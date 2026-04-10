#!/usr/bin/env node

/**
 * Benchmark: Blockmark vs full-document rewrite
 *
 * Simulates agent edit tasks in two modes:
 * - Baseline: agent receives full document, produces full rewritten document
 * - Blockmark: agent receives target block, produces just the new content
 *
 * Measures: token count, diff size, correctness
 */

import { readFileSync } from 'node:fs'
import { getBlock, patchBlock, queryBlocks, listBlocks, diffBlocks } from 'blockmark-sdk'

const doc = readFileSync(new URL('./fixture.md', import.meta.url), 'utf8')
const tasks = JSON.parse(readFileSync(new URL('./tasks.json', import.meta.url), 'utf8'))

console.log('╔══════════════════════════════════════════════════════════════╗')
console.log('║        BLOCKMARK BENCHMARK: Surgical vs Full-Rewrite        ║')
console.log('╚══════════════════════════════════════════════════════════════╝\n')

const docCharCount = doc.length
const blockCount = listBlocks(doc).length
console.log(`Document: ${docCharCount} chars, ${blockCount} addressable blocks\n`)

console.log('─'.repeat(64))
console.log('EDIT TASKS')
console.log('─'.repeat(64))

let totalBaselineChars = 0
let totalBlockmarkChars = 0
let allCorrect = true

for (const task of tasks) {
  console.log(`\n  Task: ${task.description}`)

  if (task.queryFilter) {
    // Query task
    const baselineInput = docCharCount
    const results = queryBlocks(doc, task.queryFilter)
    const blockmarkInput = JSON.stringify(task.queryFilter).length

    console.log(`    Baseline:  agent scans ${baselineInput} chars to find matches`)
    console.log(`    Blockmark: structured query, ${blockmarkInput} char filter → ${results.length} results`)
    console.log(`    Results:   ${results.map(r => r.id).join(', ')}`)

    totalBaselineChars += baselineInput
    totalBlockmarkChars += blockmarkInput
    continue
  }

  const currentContent = getBlock(doc, task.targetBlock)
  if (!currentContent) {
    console.log(`    ERROR: Block ${task.targetBlock} not found`)
    allCorrect = false
    continue
  }

  // Baseline mode: agent gets full doc, produces full doc
  const baselineInput = docCharCount
  const baselineOutput = docCharCount

  // Blockmark mode: agent gets just the block, produces just the new content
  const blockmarkInput = currentContent.length
  const blockmarkOutput = task.newContent.length

  // Execute the patch
  const patched = patchBlock(doc, task.targetBlock, task.newContent)
  const patchedContent = getBlock(patched, task.targetBlock)
  const correct = patchedContent === task.newContent

  // Calculate diff
  const diffs = diffBlocks(doc, patched)
  const changedBlocks = diffs.filter(d => d.status === 'changed').length
  const unchangedBlocks = diffs.filter(d => d.status === 'unchanged').length

  console.log(`    Baseline:  ${baselineInput} chars in → ${baselineOutput} chars out`)
  console.log(`    Blockmark: ${blockmarkInput} chars in → ${blockmarkOutput} chars out`)
  console.log(`    Savings:   ${Math.round((1 - (blockmarkInput + blockmarkOutput) / (baselineInput + baselineOutput)) * 100)}%`)
  console.log(`    Precision: ${changedBlocks} block changed, ${unchangedBlocks} unchanged`)
  console.log(`    Correct:   ${correct ? 'YES' : 'NO'}`)

  if (!correct) allCorrect = false
  totalBaselineChars += baselineInput + baselineOutput
  totalBlockmarkChars += blockmarkInput + blockmarkOutput
}

console.log('\n' + '─'.repeat(64))
console.log('SUMMARY')
console.log('─'.repeat(64))
console.log(`\n  Total baseline chars (I/O):  ${totalBaselineChars}`)
console.log(`  Total blockmark chars (I/O): ${totalBlockmarkChars}`)
console.log(`  Overall savings:             ${Math.round((1 - totalBlockmarkChars / totalBaselineChars) * 100)}%`)
console.log(`  All edits correct:           ${allCorrect ? 'YES' : 'NO'}`)
console.log(`  Blocks in document:          ${blockCount}`)
console.log()
