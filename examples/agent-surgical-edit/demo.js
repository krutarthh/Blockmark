#!/usr/bin/env node

/**
 * Demo: Agent surgical edit with blockmark
 *
 * Shows the before/after difference between full-document rewrites
 * and surgical block-level edits using blockmark.
 */

import { readFileSync } from 'node:fs'
import { getBlock, patchBlock, listBlocks, queryBlocks, diffBlocks } from 'blockmark-sdk'

const doc = readFileSync(new URL('./after.md', import.meta.url), 'utf8')

console.log('=== BLOCKMARK SURGICAL EDIT DEMO ===\n')

// Step 1: Agent lists all blocks to understand the document structure
console.log('1. Agent scans the document for addressable blocks:\n')
for (const block of listBlocks(doc)) {
  const attrs = Object.entries(block.attributes)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')
  console.log(`   ${block.id} [${block.nodeType}] ${attrs}`)
  console.log(`   → "${block.preview}"`)
}

// Step 2: Agent queries for open requirements
console.log('\n2. Agent queries for open requirements:\n')
const openReqs = queryBlocks(doc, { type: 'requirement', status: 'open' })
for (const req of openReqs) {
  console.log(`   ${req.id}: "${getBlock(doc, req.id)}"`)
}

// Step 3: Agent makes a surgical edit to one block
console.log('\n3. Agent patches req-1 (OAuth → SSO):\n')
const patched = patchBlock(doc, 'req-1', 'Users must authenticate via SSO.')

console.log('   BEFORE: "' + getBlock(doc, 'req-1') + '"')
console.log('   AFTER:  "' + getBlock(patched, 'req-1') + '"')

// Step 4: Diff confirms only one block changed
console.log('\n4. Diff confirms surgical precision:\n')
const diffs = diffBlocks(doc, patched)
for (const d of diffs) {
  const symbol = d.status === 'changed' ? '~' : d.status === 'unchanged' ? ' ' : '+'
  console.log(`   ${symbol} ${d.id}: ${d.status}`)
}

// Step 5: Show the token savings
const originalTokenEstimate = doc.length
const blockTokenEstimate = getBlock(doc, 'req-1').length + 'Users must authenticate via SSO.'.length
console.log(`\n5. Token efficiency:`)
console.log(`   Full-document rewrite: ~${originalTokenEstimate} chars in + ~${originalTokenEstimate} chars out`)
console.log(`   Surgical block edit:   ~${blockTokenEstimate} chars in + ~${blockTokenEstimate} chars out`)
console.log(`   Savings:               ${Math.round((1 - blockTokenEstimate / originalTokenEstimate) * 100)}% fewer tokens`)
