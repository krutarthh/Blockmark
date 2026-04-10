import { readFileSync } from 'node:fs'
import { getBlock } from 'blockmark-sdk'

/**
 * @param {string} file
 * @param {string} id
 */
export function get(file, id) {
  const source = readFileSync(file, 'utf8')
  const content = getBlock(source, id)

  if (content === null) {
    console.error(`Block "${id}" not found in ${file}`)
    process.exit(1)
  }

  process.stdout.write(content)
}
