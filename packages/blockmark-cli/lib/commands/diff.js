import { readFileSync } from 'node:fs'
import { diffBlocks } from 'blockmark-sdk'

/**
 * @param {string} oldFile
 * @param {string} newFile
 * @param {{ json?: boolean }} opts
 */
export function diff(oldFile, newFile, opts) {
  const oldSource = readFileSync(oldFile, 'utf8')
  const newSource = readFileSync(newFile, 'utf8')

  const diffs = diffBlocks(oldSource, newSource)

  if (opts.json) {
    console.log(JSON.stringify(diffs, null, 2))
  } else {
    if (diffs.length === 0) {
      console.log('No blockmark IDs found in either document.')
      return
    }
    for (const d of diffs) {
      const symbol =
        d.status === 'added' ? '+' :
        d.status === 'removed' ? '-' :
        d.status === 'changed' ? '~' : ' '
      console.log(`${symbol} ${d.id}: ${d.status}`)
    }
  }
}
