import { parse } from './parse.js'
import { collectBlocks } from './utils.js'
import { serializeBlockmarkPrefix } from 'micromark-extension-blockmark'

/**
 * @typedef {Object} BlockEntry
 * @property {string} id
 * @property {Record<string, string>} attributes
 * @property {string} nodeType
 * @property {number} [line]
 * @property {string} preview - First 80 chars of the block content (prefix and markers stripped)
 */

/**
 * List all blocks with blockmark IDs in a document.
 *
 * @param {string} source - The full markdown document source
 * @returns {BlockEntry[]}
 */
export function listBlocks(source) {
  const tree = parse(source)
  const blocks = collectBlocks(tree)

  return blocks.map((block) => {
    let preview = ''
    if (block.position) {
      const start = block.position.start.offset ?? 0
      const end = block.position.end.offset ?? 0
      const raw = source.slice(start, end)

      const prefix = block.raw || serializeBlockmarkPrefix(block)
      const prefixIdx = raw.indexOf(prefix)

      const content = prefixIdx >= 0
        ? raw.slice(prefixIdx + prefix.length)
        : raw

      preview = content.slice(0, 80).replace(/\n/g, ' ')
      if (content.length > 80) preview += '...'
    }

    return {
      id: block.id,
      attributes: block.attributes,
      nodeType: block.nodeType,
      line: block.line,
      preview
    }
  })
}
