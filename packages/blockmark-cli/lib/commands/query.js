import { readFileSync } from 'node:fs'
import { queryBlocks } from 'blockmark-sdk'

/**
 * @param {string} file
 * @param {{ type?: string, status?: string, json?: boolean }} opts
 */
export function query(file, opts) {
  const source = readFileSync(file, 'utf8')

  /** @type {Record<string, string>} */
  const filter = {}
  if (opts.type) filter.type = opts.type
  if (opts.status) filter.status = opts.status

  const blocks = queryBlocks(source, filter)

  if (opts.json) {
    console.log(JSON.stringify(blocks, null, 2))
  } else {
    if (blocks.length === 0) {
      console.log('No matching blocks found.')
      return
    }
    for (const block of blocks) {
      const attrs = Object.entries(block.attributes)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ')
      const meta = attrs ? ` (${attrs})` : ''
      console.log(`${block.id}${meta}  [${block.nodeType}, line ${block.line ?? '?'}]`)
    }
  }
}
