import { parse } from './parse.js'
import { findBlockById } from './utils.js'
import { serializeBlockmarkPrefix } from 'micromark-extension-blockmark'

/**
 * Get the content of a block by its blockmark ID.
 *
 * Returns the text content of the block — the part after the blockmark prefix
 * and any block-level markers (heading `##`, list `-`, blockquote `>`).
 *
 * Returns `null` if no block with that ID exists.
 *
 * @param {string} source - The full markdown document source
 * @param {string} id - The blockmark ID to find
 * @returns {string | null}
 */
export function getBlock(source, id) {
  const tree = parse(source)
  const node = findBlockById(tree, id)
  if (!node?.position || !node.data?.blockmark) return null

  const start = node.position.start.offset
  const end = node.position.end.offset
  if (start === undefined || end === undefined) return null

  const raw = source.slice(start, end)
  const prefix = node.data.blockmark.raw || serializeBlockmarkPrefix(node.data.blockmark)
  const prefixIndex = raw.indexOf(prefix)

  if (prefixIndex === -1) return raw
  return raw.slice(prefixIndex + prefix.length)
}
