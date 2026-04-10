import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkBlockmark from 'remark-blockmark'

/**
 * Parse a markdown string into a blockmark-aware mdast tree.
 *
 * Block nodes that start with `^[id attrs] ` will have their prefix
 * extracted and stored as `node.data.blockmark`.
 *
 * @param {string} source
 * @returns {import('mdast').Root}
 */
export function parse(source) {
  const processor = unified().use(remarkParse).use(remarkBlockmark)
  const tree = processor.parse(source)
  processor.runSync(tree)
  return tree
}
