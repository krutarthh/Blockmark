import { readFileSync } from 'node:fs'
import { listBlocks } from 'blockmark-sdk'

/**
 * @param {string} file
 * @param {{ json?: boolean }} opts
 */
export function list(file, opts) {
  const source = readFileSync(file, 'utf8')
  const blocks = listBlocks(source)

  if (opts.json) {
    console.log(JSON.stringify(blocks, null, 2))
  } else {
    if (blocks.length === 0) {
      console.log('No blockmark IDs found.')
      return
    }
    for (const block of blocks) {
      const attrs = Object.entries(block.attributes)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ')
      const meta = attrs ? ` (${attrs})` : ''
      console.log(`${block.id}${meta}  [${block.nodeType}, line ${block.line ?? '?'}]`)
      console.log(`  ${block.preview}`)
    }
  }
}
