import { parse } from './parse.js'
import { findBlockById } from './utils.js'
import { serializeBlockmarkPrefix } from 'micromark-extension-blockmark'

/**
 * Replace the content of a block by its blockmark ID.
 *
 * The blockmark prefix and any block-level markers (heading `##`, list `-`)
 * are preserved. Only the content portion is replaced.
 *
 * @param {string} source - The full markdown document source
 * @param {string} id - The blockmark ID of the block to patch
 * @param {string} newContent - The new content (same format as getBlock returns)
 * @returns {string}
 */
export function patchBlock(source, id, newContent) {
  const tree = parse(source)
  const node = findBlockById(tree, id)
  if (!node?.position || !node.data?.blockmark) {
    throw new Error(`Block "${id}" not found`)
  }

  const start = node.position.start.offset
  const end = node.position.end.offset
  if (start === undefined || end === undefined) {
    throw new Error(`Block "${id}" has no position data`)
  }

  const raw = source.slice(start, end)
  const prefix = node.data.blockmark.raw || serializeBlockmarkPrefix(node.data.blockmark)
  const prefixIndex = raw.indexOf(prefix)

  if (prefixIndex === -1) {
    throw new Error(`Cannot locate prefix for block "${id}"`)
  }

  const markers = raw.slice(0, prefixIndex)
  const newBlock = markers + prefix + newContent

  return source.slice(0, start) + newBlock + source.slice(end)
}
