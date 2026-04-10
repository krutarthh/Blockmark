import { blockmarkFromMarkdown, blockmarkToMarkdown } from 'mdast-util-blockmark'

/**
 * remark plugin that adds blockmark support — stable block IDs for markdown.
 *
 * During parsing (run phase), extracts `^[id attrs] ` prefixes from block
 * content and attaches them as `node.data.blockmark`.
 *
 * When used with remark-stringify, a compiler hook restores the prefixes
 * so that round-tripping preserves the blockmark syntax.
 *
 * @returns {import('unified').Transformer}
 */
export default function remarkBlockmark() {
  // @ts-ignore — unified plugin `this` typing
  const self = this

  if (self && self.compiler) {
    const originalCompiler = self.compiler
    self.compiler = function (tree, file) {
      blockmarkToMarkdown(tree)
      return originalCompiler.call(this, tree, file)
    }
  }

  return (tree) => {
    blockmarkFromMarkdown(tree)
  }
}
