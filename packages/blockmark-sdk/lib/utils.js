import { visit } from 'unist-util-visit'

/**
 * @typedef {Object} BlockRecord
 * @property {string} id
 * @property {Record<string, string>} attributes
 * @property {string} [raw] - Original prefix string
 * @property {string} nodeType
 * @property {number} [line]
 * @property {{ start: { offset?: number, line?: number }, end: { offset?: number } } | undefined} position
 */

/**
 * Find a block node by its blockmark ID.
 *
 * @param {import('mdast').Root} tree
 * @param {string} id
 * @returns {(import('mdast').Nodes & { data?: { blockmark?: { id: string, attributes: Record<string, string>, raw?: string } }, position?: any }) | null}
 */
export function findBlockById(tree, id) {
  /** @type {any} */
  let found = null

  visit(tree, (node) => {
    if (node.data?.blockmark?.id === id) {
      found = node
      return false
    }
  })

  return found
}

/**
 * Collect all blocks that have blockmark IDs.
 *
 * @param {import('mdast').Root} tree
 * @returns {BlockRecord[]}
 */
export function collectBlocks(tree) {
  /** @type {BlockRecord[]} */
  const blocks = []

  visit(tree, (node) => {
    if (node.data?.blockmark) {
      blocks.push({
        id: node.data.blockmark.id,
        attributes: node.data.blockmark.attributes,
        raw: node.data.blockmark.raw,
        nodeType: node.type,
        line: node.position?.start?.line,
        position: node.position
      })
    }
  })

  return blocks
}
