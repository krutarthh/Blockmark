#!/usr/bin/env node

/**
 * Agent evaluation harness for Blockmark.
 *
 * Runs edit tasks against a real LLM (or replayed transcripts) in two arms:
 * - blockmark: surgical tools (list_blocks, get_block, patch_block, query_blocks)
 * - baseline:  full-doc tools (read_document, write_document)
 *
 * Usage:
 *   node benchmarks/agent-harness/run.mjs --arm blockmark --tasks all
 *   node benchmarks/agent-harness/run.mjs --arm baseline  --tasks edit-req-1
 *   node benchmarks/agent-harness/run.mjs --compare
 *   HARNESS_MODE=replay node benchmarks/agent-harness/run.mjs --compare
 *
 * Environment:
 *   OPENAI_BASE_URL          API root (default: https://api.openai.com/v1 — use http://127.0.0.1:1234/v1 for LM Studio).
 *                            If it does not end in /v1, /v1 is inserted before /chat/completions.
 *   OPENAI_COMPLETIONS_URL   Optional full POST URL (overrides base joining).
 *   HARNESS_OPENAI_NO_V1=1   POST to {OPENAI_BASE_URL}/chat/completions (no /v1) for gateways that reject /v1/chat/completions.
 *   OPENAI_API_KEY           API key (default: ollama)
 *   HARNESS_MODEL            Model name (default: gpt-4o-mini for OpenAI)
 *   HARNESS_MODE             "live" (default), "record", or "replay"
 *   HARNESS_DEBUG=1          Log resolved completions URL to stderr
 *
 * A `.env` file in the repo root is loaded automatically (see `.env.example`).
 */

import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { loadEnvFile } from './lib/load-env.js'
import { runAgentLoop } from './lib/loop.js'
import { BLOCKMARK_TOOLS, BASELINE_TOOLS, createBlockmarkExecutor, createBaselineExecutor } from './lib/tools.js'
import { verify } from './lib/verifier.js'
import { createRecorder, createReplayIterator } from './lib/replay.js'
import { validateHarnessConfig } from './lib/openai.js'

loadEnvFile()

const FIXTURE_PATH = new URL('../agent-edit-accuracy/fixture.md', import.meta.url).pathname
const TASKS_PATH = new URL('./tasks.eval.json', import.meta.url).pathname

const { values: flags } = parseArgs({
  options: {
    arm:     { type: 'string', default: 'blockmark' },
    tasks:   { type: 'string', default: 'all' },
    compare: { type: 'boolean', default: false }
  },
  strict: false
})

const MODE = process.env.HARNESS_MODE || 'live'

const SYSTEM_PROMPT_BLOCKMARK = `You are an AI assistant editing a structured markdown document.
The document uses blockmark syntax: blocks are prefixed with ^[id attrs] for stable addressing.

You have these tools:
- list_blocks: see all addressable blocks
- get_block: read a specific block's content by ID
- patch_block: replace a block's content by ID (provide the new text, not the ^[id] prefix)
- query_blocks: find blocks matching attribute filters

Always use the tools to read before editing. Use patch_block for edits — never output the full document.
When answering a query, call query_blocks or list_blocks, then summarize the result in your response.`

const SYSTEM_PROMPT_BASELINE = `You are an AI assistant editing a markdown document.

You have these tools:
- read_document: read the entire document
- write_document: replace the entire document with new content

To make an edit, first read the document, then write the complete updated version back.
When answering a query about the document, read it and answer from the content.`

async function main() {
  if (MODE === 'live' || MODE === 'record') {
    validateHarnessConfig()
  }

  const fixtureSource = readFileSync(FIXTURE_PATH, 'utf8')
  const allTasks = JSON.parse(readFileSync(TASKS_PATH, 'utf8'))

  const taskIds = flags.tasks === 'all'
    ? allTasks.map(t => t.id)
    : flags.tasks.split(',').map(s => s.trim())

  const selectedTasks = allTasks.filter(t => taskIds.includes(t.id))

  if (selectedTasks.length === 0) {
    console.error(`No tasks matched: ${flags.tasks}`)
    console.error(`Available: ${allTasks.map(t => t.id).join(', ')}`)
    process.exit(1)
  }

  const arms = flags.compare ? ['blockmark', 'baseline'] : [flags.arm]

  /** @type {Array<{taskId: string, arm: string, pass: boolean, steps: number, promptTokens: number, completionTokens: number, detail: string, error?: string}>} */
  const results = []

  for (const arm of arms) {
    for (const task of selectedTasks) {
      console.error(`\n--- ${task.id} [${arm}] ---`)
      try {
        const result = await runTask(fixtureSource, task, arm)
        results.push(result)
        const icon = result.pass ? 'PASS' : 'FAIL'
        console.error(`${icon}: ${result.detail}`)
        console.error(`  steps=${result.steps} prompt_tok=${result.promptTokens} completion_tok=${result.completionTokens}`)
      } catch (err) {
        results.push({
          taskId: task.id,
          arm,
          pass: false,
          steps: 0,
          promptTokens: 0,
          completionTokens: 0,
          detail: '',
          error: err.message
        })
        console.error(`ERROR: ${err.message}`)
      }
    }
  }

  printReport(results)

  const anyFail = results.some(r => !r.pass)
  process.exit(anyFail ? 1 : 0)
}

async function runTask(fixtureSource, task, arm) {
  const isBlockmark = arm === 'blockmark'

  const tools = isBlockmark ? BLOCKMARK_TOOLS : BASELINE_TOOLS
  const executor = isBlockmark
    ? createBlockmarkExecutor(fixtureSource)
    : createBaselineExecutor(fixtureSource)
  const systemPrompt = isBlockmark ? SYSTEM_PROMPT_BLOCKMARK : SYSTEM_PROMPT_BASELINE

  let recorder = null
  let replay = null

  if (MODE === 'record') {
    recorder = createRecorder(task.id, arm)
  } else if (MODE === 'replay') {
    replay = createReplayIterator(task.id, arm)
    if (!replay) {
      return {
        taskId: task.id,
        arm,
        pass: false,
        steps: 0,
        promptTokens: 0,
        completionTokens: 0,
        detail: 'No recording found for replay',
        error: 'missing_recording'
      }
    }
  }

  const { steps, promptTokens, completionTokens, lastContent } = await runAgentLoop({
    systemPrompt,
    userPrompt: task.prompt,
    tools,
    executor,
    recorder,
    replay
  })

  if (recorder) recorder.flush()

  const finalSource = executor.getSource()
  const { pass, detail } = verify(finalSource, task.verifier, lastContent)

  return { taskId: task.id, arm, pass, steps, promptTokens, completionTokens, detail }
}

function printReport(results) {
  console.log('\n' + '='.repeat(72))
  console.log('  AGENT EVALUATION REPORT')
  console.log('='.repeat(72))

  const colW = { task: 24, arm: 12, pass: 6, steps: 6, ptok: 10, ctok: 10 }

  console.log(
    'Task'.padEnd(colW.task) +
    'Arm'.padEnd(colW.arm) +
    'Pass'.padEnd(colW.pass) +
    'Steps'.padEnd(colW.steps) +
    'PromptTok'.padEnd(colW.ptok) +
    'CompTok'.padEnd(colW.ctok) +
    'Detail'
  )
  console.log('-'.repeat(72))

  for (const r of results) {
    console.log(
      r.taskId.padEnd(colW.task) +
      r.arm.padEnd(colW.arm) +
      (r.pass ? 'YES' : 'NO').padEnd(colW.pass) +
      String(r.steps).padEnd(colW.steps) +
      String(r.promptTokens).padEnd(colW.ptok) +
      String(r.completionTokens).padEnd(colW.ctok) +
      (r.error || r.detail).slice(0, 50)
    )
  }

  console.log('-'.repeat(72))

  const passed = results.filter(r => r.pass).length
  const total = results.length
  console.log(`\n  ${passed}/${total} passed`)

  if (results.some(r => r.arm === 'blockmark') && results.some(r => r.arm === 'baseline')) {
    const bmTokens = results.filter(r => r.arm === 'blockmark').reduce((s, r) => s + r.promptTokens + r.completionTokens, 0)
    const blTokens = results.filter(r => r.arm === 'baseline').reduce((s, r) => s + r.promptTokens + r.completionTokens, 0)
    if (blTokens > 0 && bmTokens > 0) {
      const savings = Math.round((1 - bmTokens / blTokens) * 100)
      if (savings >= 0) {
        console.log(`  Token savings (blockmark vs baseline, sum of reported usage): ${savings}%`)
      } else {
        console.log(`  Token usage: blockmark used ${-savings}% MORE than baseline in this run (model + step count dependent).`)
      }
      console.log('  Note: blockmark keeps more turns in context; baseline emits large completions on write_document.')
      console.log('  Compare per edit task (prompt vs completion columns), not only this headline.')
    }
  }

  console.log()
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(2)
})
