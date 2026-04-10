import { parse } from './parse.js'
import { collectBlocks } from './utils.js'
import { serializeBlockmarkPrefix } from 'micromark-extension-blockmark'

/**
 * @typedef {'added' | 'removed' | 'changed' | 'unchanged'} DiffStatus
 */

/**
 * @typedef {Object} BlockDiff
 * @property {string} id
 * @property {DiffStatus} status
 * @property {string} [oldContent]
 * @property {string} [newContent]
 */

/**
 * Diff two markdown documents by blockmark ID.
 *
 * Compares blocks with matching IDs and reports which were added,
 * removed, changed, or unchanged.
 *
 * @param {string} oldSource
 * @param {string} newSource
 * @returns {BlockDiff[]}
 */
export function diffBlocks(oldSource, newSource) {
  const oldTree = parse(oldSource)
  const newTree = parse(newSource)

  const oldBlocks = collectBlocks(oldTree)
  const newBlocks = collectBlocks(newTree)

  const oldMap = new Map()
  for (const block of oldBlocks) {
    oldMap.set(block.id, extractContent(oldSource, block))
  }

  const newMap = new Map()
  for (const block of newBlocks) {
    newMap.set(block.id, extractContent(newSource, block))
  }

  /** @type {BlockDiff[]} */
  const diffs = []

  const allIds = new Set([...oldMap.keys(), ...newMap.keys()])

  for (const id of allIds) {
    const oldContent = oldMap.get(id)
    const newContent = newMap.get(id)

    if (oldContent === undefined) {
      diffs.push({ id, status: 'added', newContent })
    } else if (newContent === undefined) {
      diffs.push({ id, status: 'removed', oldContent })
    } else if (oldContent === newContent) {
      diffs.push({ id, status: 'unchanged' })
    } else {
      diffs.push({ id, status: 'changed', oldContent, newContent })
    }
  }

  return diffs
}

/**
 * @param {string} source
 * @param {import('./utils.js').BlockRecord} block
 * @returns {string}
 */
function extractContent(source, block) {
  if (!block.position) return ''
  const start = block.position.start.offset ?? 0
  const end = block.position.end.offset ?? 0
  const raw = source.slice(start, end)

  const prefix = block.raw || serializeBlockmarkPrefix(block)
  const prefixIdx = raw.indexOf(prefix)
  if (prefixIdx >= 0) {
    return raw.slice(prefixIdx + prefix.length)
  }
  return raw
}
