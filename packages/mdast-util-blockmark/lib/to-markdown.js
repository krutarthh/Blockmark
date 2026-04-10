import { visit } from 'unist-util-visit'
import { serializeBlockmarkPrefix } from 'micromark-extension-blockmark'

/**
 * Walk an mdast tree and restore blockmark prefixes into text content.
 *
 * This is the reverse of `blockmarkFromMarkdown` — it prepends the
 * `^[id attrs] ` prefix back into the first text child of nodes that
 * have `data.blockmark`.
 *
 * Call this before stringifying to ensure the prefix appears in output.
 *
 * @param {import('mdast').Root} tree
 * @returns {void}
 */
export function blockmarkToMarkdown(tree) {
  visit(tree, (node) => {
    if (!node.data?.blockmark) return

    const prefix = serializeBlockmarkPrefix(node.data.blockmark)

    if (node.type === 'paragraph' || node.type === 'heading') {
      prependToInlineParent(node, prefix)
    } else if (node.type === 'listItem') {
      prependToListItem(node, prefix)
    } else if (node.type === 'blockquote') {
      prependToBlockquote(node, prefix)
    }
  })
}

/**
 * @param {import('mdast').Paragraph | import('mdast').Heading} node
 * @param {string} prefix
 */
function prependToInlineParent(node, prefix) {
  const first = node.children[0]
  if (first && first.type === 'text') {
    first.value = prefix + first.value
  } else {
    node.children.unshift({ type: 'text', value: prefix })
  }
}

/**
 * @param {import('mdast').ListItem} node
 * @param {string} prefix
 */
function prependToListItem(node, prefix) {
  const firstChild = node.children[0]
  if (firstChild && firstChild.type === 'paragraph') {
    const textNode = firstChild.children[0]
    if (textNode && textNode.type === 'text') {
      textNode.value = prefix + textNode.value
    } else {
      firstChild.children.unshift({ type: 'text', value: prefix })
    }
  }
}

/**
 * @param {import('mdast').Blockquote} node
 * @param {string} prefix
 */
function prependToBlockquote(node, prefix) {
  const firstChild = node.children[0]
  if (firstChild && firstChild.type === 'paragraph') {
    const textNode = firstChild.children[0]
    if (textNode && textNode.type === 'text') {
      textNode.value = prefix + textNode.value
    } else {
      firstChild.children.unshift({ type: 'text', value: prefix })
    }
  }
}
