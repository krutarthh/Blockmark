#!/usr/bin/env node

/**
 * List model ids the configured API key can use (OpenAI: GET /v1/models).
 *
 *   npm run eval:models
 *
 * Loads `.env` from repo root like the harness.
 */

import { loadEnvFile } from './lib/load-env.js'
import { resolveModelsListUrl, normalizeHarnessModel } from './lib/openai.js'

loadEnvFile()

const apiKey = process.env.OPENAI_API_KEY?.trim() || ''
const listUrl = resolveModelsListUrl()

if (!apiKey || apiKey === 'ollama') {
  console.error('Set OPENAI_API_KEY in .env (or your shell).')
  process.exit(1)
}

const res = await fetch(listUrl, {
  headers: { Authorization: `Bearer ${apiKey}` }
})

const text = await res.text()
if (!res.ok) {
  console.error(`GET ${listUrl}\n${res.status} ${text.slice(0, 800)}`)
  process.exit(1)
}

let data
try {
  data = JSON.parse(text)
} catch {
  console.error('Non-JSON response:', text.slice(0, 500))
  process.exit(1)
}

const ids = (data.data || [])
  .map((m) => m.id)
  .filter(Boolean)
  .sort()

console.log(`GET ${listUrl}\n`)
console.log(ids.join('\n'))
console.log(`\n(${ids.length} models)`)

const want = normalizeHarnessModel(process.env.HARNESS_MODEL)
if (want && !ids.includes(want)) {
  console.error(
    `\nNote: HARNESS_MODEL=${JSON.stringify(want)} is not in this list for your key — chat completions may return "invalid model ID".`
  )
}
