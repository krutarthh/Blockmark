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
import { validateHarnessConfig, normalizeHarnessModel } from './lib/openai.js'
import { getBlock } from 'blockmark-sdk'

loadEnvFile()

const LARGE_FIXTURE_PATH = new URL('../agent-edit-accuracy/fixture.md', import.meta.url).pathname
const SMALL_FIXTURE_PATH = new URL('../agent-edit-accuracy/fixture.small.md', import.meta.url).pathname
const TASKS_PATH = new URL('./tasks.eval.json', import.meta.url).pathname

const { values: flags } = parseArgs({
  options: {
    arm:     { type: 'string', default: 'blockmark' },
    tasks:   { type: 'string', default: 'all' },
    compare: { type: 'boolean', default: false },
    json:    { type: 'boolean', default: false }
  },
  strict: false
})

const MODE = process.env.HARNESS_MODE || 'live'

const SYSTEM_PROMPT_BLOCKMARK = `You are an AI assistant editing a structured markdown document.
The document uses blockmark syntax: blocks are prefixed with ^[id attrs] for stable addressing.

You have these tools:
- list_blocks: list all block IDs and attributes (large output; use only when needed)
- get_block: read a specific block's content by ID
- patch_block: replace a block's content by ID (provide the new text, not the ^[id] prefix)
- query_blocks: find blocks matching attribute filters

Token-efficient workflow is required:
- If the request names a block ID (e.g., req-8, dec-1), DO NOT call list_blocks.
- For ID-targeted edits, do exactly: get_block(id) -> patch_block(id, content) -> final response.
- Use list_blocks only when the ID is unknown or ambiguous.
- For filter queries, use query_blocks (not list_blocks) unless explicitly needed.

Always use tools to read before editing. Use patch_block for edits — never output the full document.
When answering a query, summarize results concisely after the tool call(s).`

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

  const activeModel = normalizeHarnessModel(process.env.HARNESS_MODEL)
  const activeBase = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').trim()
  console.error(`[blockmark-harness] mode=${MODE} model=${JSON.stringify(activeModel)} base=${activeBase}`)

  const fixtureTier = process.env.HARNESS_FIXTURE_TIER === 'small' ? 'small' : 'large'
  const fixturePath = process.env.HARNESS_FIXTURE
    ? process.env.HARNESS_FIXTURE
    : (fixtureTier === 'small' ? SMALL_FIXTURE_PATH : LARGE_FIXTURE_PATH)
  const fixtureSource = readFileSync(fixturePath, 'utf8')
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

  if (flags.json) {
    console.log(JSON.stringify({
      mode: MODE,
      model: activeModel,
      fixtureTier,
      fixturePath,
      results
    }))
  }

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
  const verifier = enrichVerifierForFixture(task.verifier, fixtureSource)
  const { pass, detail } = verify(finalSource, verifier, lastContent)

  return { taskId: task.id, arm, pass, steps, promptTokens, completionTokens, detail }
}

function enrichVerifierForFixture(verifier, fixtureSource) {
  const copy = JSON.parse(JSON.stringify(verifier))

  if (copy.type === 'documentUnchanged') {
    copy.expectedSource = fixtureSource
  }

  if (Array.isArray(copy.mustMatchBlockIds) && !copy.mustMatchBlocks) {
    copy.mustMatchBlocks = copy.mustMatchBlockIds
      .map(id => ({ id, content: getBlock(fixtureSource, id) }))
      .filter(x => typeof x.content === 'string')
  }

  return copy
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
    const taskIds = [...new Set(results.map(r => r.taskId))]
    let bmTokens = 0
    let blTokens = 0
    let canCompare = true
    for (const id of taskIds) {
      const bm = results.find(r => r.taskId === id && r.arm === 'blockmark')
      const bl = results.find(r => r.taskId === id && r.arm === 'baseline')
      if (!bm || !bl) {
        canCompare = false
        break
      }
      if (bm.error || bl.error || !bm.pass || !bl.pass) {
        canCompare = false
        break
      }
      bmTokens += bm.promptTokens + bm.completionTokens
      blTokens += bl.promptTokens + bl.completionTokens
    }

    const replayNoTokens = MODE === 'replay' && bmTokens === 0 && blTokens === 0

    if (canCompare && bmTokens > 0 && blTokens > 0) {
      const savings = Math.round((1 - bmTokens / blTokens) * 100)
      if (savings >= 0) {
        console.log(`  Token savings (blockmark vs baseline, sum of reported usage): ${savings}%`)
      } else {
        console.log(`  Token usage: blockmark used ${-savings}% MORE than baseline in this run (model + step count dependent).`)
      }
      console.log('  Note: blockmark keeps more turns in context; baseline emits large completions on write_document.')
      console.log('  Compare per edit task (prompt vs completion columns), not only this headline.')
    } else if (!replayNoTokens && !canCompare) {
      console.log('  Skipping aggregate token comparison: not all paired tasks completed successfully on both arms.')
      console.log('  (Retries or a stable network help; baseline write_document can be large and may time out.)')
    }
  }

  console.log()
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(2)
})
