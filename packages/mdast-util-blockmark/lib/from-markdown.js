import { visit } from 'unist-util-visit'
import { parseBlockmarkPrefix } from 'micromark-extension-blockmark'

/**
 * Walk an mdast tree and extract blockmark prefixes from text nodes.
 *
 * For each block node (paragraph, heading, listItem, blockquote) whose
 * text content starts with `^[id attrs] `, the prefix is stripped from
 * the text and attached as `node.data.blockmark`.
 *
 * @param {import('mdast').Root} tree
 * @returns {void}
 */
export function blockmarkFromMarkdown(tree) {
  visit(tree, (node) => {
    if (node.type === 'paragraph' || node.type === 'heading') {
      extractFromInlineParent(node)
    } else if (node.type === 'listItem') {
      extractFromListItem(node)
    } else if (node.type === 'blockquote') {
      extractFromBlockquote(node)
    }
  })
}

/**
 * Extract a blockmark prefix from the first text child of a paragraph
 * or heading node.
 *
 * @param {import('mdast').Paragraph | import('mdast').Heading} node
 */
function extractFromInlineParent(node) {
  const first = node.children[0]
  if (!first || first.type !== 'text') return

  const prefix = parseBlockmarkPrefix(first.value)
  if (!prefix) return

  node.data = node.data || {}
  node.data.blockmark = {
    id: prefix.id,
    attributes: prefix.attributes,
    raw: prefix.raw
  }
  first.value = first.value.slice(prefix.raw.length)

  if (first.value === '') {
    node.children.shift()
  }
}

/**
 * Extract a blockmark prefix from a list item. The prefix appears in
 * the first paragraph child's first text node.
 *
 * @param {import('mdast').ListItem} node
 */
function extractFromListItem(node) {
  const firstChild = node.children[0]
  if (!firstChild || firstChild.type !== 'paragraph') return

  const textNode = firstChild.children[0]
  if (!textNode || textNode.type !== 'text') return

  const prefix = parseBlockmarkPrefix(textNode.value)
  if (!prefix) return

  node.data = node.data || {}
  node.data.blockmark = {
    id: prefix.id,
    attributes: prefix.attributes,
    raw: prefix.raw
  }
  textNode.value = textNode.value.slice(prefix.raw.length)

  if (textNode.value === '') {
    firstChild.children.shift()
  }
}

/**
 * Extract a blockmark prefix from a blockquote. The prefix appears in
 * the first paragraph child's first text node.
 *
 * @param {import('mdast').Blockquote} node
 */
function extractFromBlockquote(node) {
  const firstChild = node.children[0]
  if (!firstChild || firstChild.type !== 'paragraph') return

  const textNode = firstChild.children[0]
  if (!textNode || textNode.type !== 'text') return

  const prefix = parseBlockmarkPrefix(textNode.value)
  if (!prefix) return

  node.data = node.data || {}
  node.data.blockmark = {
    id: prefix.id,
    attributes: prefix.attributes,
    raw: prefix.raw
  }
  textNode.value = textNode.value.slice(prefix.raw.length)

  if (textNode.value === '') {
    firstChild.children.shift()
  }
}
