import { parse } from './parse.js'
import { collectBlocks } from './utils.js'

/**
 * @typedef {Object} BlockInfo
 * @property {string} id
 * @property {Record<string, string>} attributes
 * @property {string} nodeType - The mdast node type (paragraph, heading, etc.)
 * @property {number} [line] - The start line number (1-indexed)
 */

/**
 * Query blocks matching a filter.
 *
 * The filter is an object of attribute key-value pairs. A block matches
 * if it has all the specified attributes with the specified values.
 * An empty filter matches all blocks with blockmark IDs.
 *
 * @param {string} source - The full markdown document source
 * @param {Record<string, string>} [filter] - Attribute filter
 * @returns {BlockInfo[]}
 */
export function queryBlocks(source, filter) {
  const tree = parse(source)
  const blocks = collectBlocks(tree)

  if (!filter || Object.keys(filter).length === 0) {
    return blocks
  }

  return blocks.filter((block) => {
    for (const [key, value] of Object.entries(filter)) {
      if (block.attributes[key] !== value) return false
    }
    return true
  })
}
