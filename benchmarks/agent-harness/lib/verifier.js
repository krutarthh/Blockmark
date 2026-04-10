import { getBlock, queryBlocks } from 'blockmark-sdk'

/**
 * @typedef {{ pass: boolean, detail: string }} VerifyResult
 */

/**
 * Run the verifier for a task against the final document state.
 *
 * @param {string} source - final document content
 * @param {object} verifier - verifier spec from tasks.eval.json
 * @param {string | null} lastContent - last model text message (for query tasks)
 * @returns {VerifyResult}
 */
export function verify(source, verifier, lastContent) {
  switch (verifier.type) {
    case 'blockEquals':
      return verifyBlockEquals(source, verifier)
    case 'blockContains':
      return verifyBlockContains(source, verifier)
    case 'queryEquals':
      return verifyQueryEquals(source, verifier, lastContent)
    case 'multiBlockContains':
      return verifyMultiBlockContains(source, verifier)
    case 'documentUnchanged':
      return verifyDocumentUnchanged(source, verifier)
    default:
      return { pass: false, detail: `Unknown verifier type: ${verifier.type}` }
  }
}

function verifyMultiBlockContains(source, v) {
  if (!Array.isArray(v.blocks) || v.blocks.length === 0) {
    return { pass: false, detail: 'multiBlockContains verifier requires blocks[]' }
  }

  for (const block of v.blocks) {
    const content = getBlock(source, block.id)
    if (content === null) {
      return { pass: false, detail: `Block "${block.id}" not found in document` }
    }
    const missing = (block.expectedContains || []).filter(s => !content.includes(s))
    if (missing.length > 0) {
      return {
        pass: false,
        detail: `Block "${block.id}" missing substrings: ${JSON.stringify(missing)}`
      }
    }
  }

  const unchangedCheck = verifyUnchangedBlocks(source, v)
  if (!unchangedCheck.pass) return unchangedCheck

  return { pass: true, detail: `All ${v.blocks.length} blocks satisfied expected substrings` }
}

function verifyBlockEquals(source, v) {
  const content = getBlock(source, v.id)
  if (content === null) {
    return { pass: false, detail: `Block "${v.id}" not found in document` }
  }
  if (content.trim() === v.expected.trim()) {
    return { pass: true, detail: 'Exact match' }
  }
  return {
    pass: false,
    detail: `Expected: "${v.expected.slice(0, 100)}..."\nGot:      "${content.slice(0, 100)}..."`
  }
}

function verifyBlockContains(source, v) {
  const content = getBlock(source, v.id)
  if (content === null) {
    return { pass: false, detail: `Block "${v.id}" not found in document` }
  }
  const missing = v.expectedContains.filter(s => !content.includes(s))
  if (missing.length > 0) {
    return {
      pass: false,
      detail: `Missing substrings: ${JSON.stringify(missing)}\nBlock content: "${content.slice(0, 200)}"`
    }
  }

  const unchangedCheck = verifyUnchangedBlocks(source, v)
  if (!unchangedCheck.pass) {
    return unchangedCheck
  }

  return { pass: true, detail: `All ${v.expectedContains.length} expected substrings found` }
}

function verifyQueryEquals(source, v, lastContent) {
  const results = queryBlocks(source, v.filter)
  const actualIds = results.map(b => b.id).sort()
  const expectedIds = [...v.expectedIds].sort()

  const sdkMatch = JSON.stringify(actualIds) === JSON.stringify(expectedIds)
  if (!sdkMatch) {
    return {
      pass: false,
      detail: `SDK query mismatch.\nExpected IDs: ${JSON.stringify(expectedIds)}\nActual IDs:   ${JSON.stringify(actualIds)}`
    }
  }

  // Query tasks do not change the document; ground truth is the SDK result.
  // Requiring verbatim IDs in the model's prose fails baseline runs when the
  // model paraphrases ("the four high-priority open requirements").
  if (v.requireModelMentionIds === true && lastContent) {
    const mentionedAll = expectedIds.every(id => lastContent.includes(id))
    if (!mentionedAll) {
      const missing = expectedIds.filter(id => !lastContent.includes(id))
      return {
        pass: false,
        detail: `SDK query correct, but model response missing IDs: ${JSON.stringify(missing)}`
      }
    }
    return { pass: true, detail: `All ${expectedIds.length} IDs match (SDK + model cited IDs)` }
  }

  return { pass: true, detail: `All ${expectedIds.length} IDs match (SDK query)` }
}

function verifyDocumentUnchanged(source, v) {
  if (typeof v.expectedSource !== 'string') {
    return { pass: false, detail: 'documentUnchanged verifier requires expectedSource string' }
  }
  if (source === v.expectedSource) {
    return { pass: true, detail: 'Document remained unchanged' }
  }
  return { pass: false, detail: 'Document changed but task expected no modifications' }
}

function verifyUnchangedBlocks(source, v) {
  if (!Array.isArray(v.mustMatchBlocks) || v.mustMatchBlocks.length === 0) {
    return { pass: true, detail: '' }
  }

  for (const expected of v.mustMatchBlocks) {
    const actual = getBlock(source, expected.id)
    if (actual === null) {
      return { pass: false, detail: `Block "${expected.id}" missing while verifying unchanged blocks` }
    }
    if (actual.trim() !== expected.content.trim()) {
      return {
        pass: false,
        detail: `Unrelated block "${expected.id}" changed unexpectedly`
      }
    }
  }

  return { pass: true, detail: '' }
}
