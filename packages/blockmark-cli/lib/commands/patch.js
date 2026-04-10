import { readFileSync, writeFileSync } from 'node:fs'
import { patchBlock } from 'blockmark-sdk'

/**
 * @param {string} file
 * @param {string} id
 * @param {{ content: string, output?: string }} opts
 */
export function patch(file, id, opts) {
  const source = readFileSync(file, 'utf8')

  let result
  try {
    result = patchBlock(source, id, opts.content)
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }

  const target = opts.output || file
  writeFileSync(target, result, 'utf8')
  console.error(`Patched block "${id}" in ${target}`)
}
