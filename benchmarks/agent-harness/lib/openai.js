/**
 * Minimal OpenAI-compatible chat completions client.
 * Works with OpenAI, Ollama (/v1), LM Studio, vLLM, etc.
 * Uses raw fetch — zero extra dependencies.
 *
 * URL resolution (in order):
 * 1. OPENAI_COMPLETIONS_URL — full POST URL if set (bypasses base joining).
 * 2. OPENAI_BASE_URL + path:
 *    - If HARNESS_OPENAI_NO_V1=1 → {base}/chat/completions (no /v1 segment).
 *    - Else if base ends with /v1 → {base}/chat/completions.
 *    - Else → {base}/v1/chat/completions (auto-insert /v1 for Ollama etc.).
 */

/** Default when unset: official OpenAI API (set OPENAI_BASE_URL for Ollama / LM Studio / etc.). */
const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_MODEL = 'gpt-4o-mini'

/**
 * Trim .env noise; OpenAI rejects ids with leading/trailing space or `vendor/model` shape.
 *
 * @param {string | undefined} raw
 * @returns {string}
 */
export function normalizeHarnessModel(raw) {
  let s = raw == null || raw === '' ? DEFAULT_MODEL : String(raw)
  s = s.replace(/^\uFEFF/, '').trim()
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim()
  }
  return s || DEFAULT_MODEL
}

/**
 * Fail fast on common misconfig (e.g. LM Studio model id against api.openai.com).
 */
export function validateHarnessConfig() {
  const base = (process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL).trim()
  const model = normalizeHarnessModel(process.env.HARNESS_MODEL)
  const url = resolveChatCompletionsUrl()

  let host = ''
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return
  }

  const isOpenAi =
    host === 'api.openai.com' || host.endsWith('.openai.com')

  if (isOpenAi && model.includes('/')) {
    throw new Error(
      `HARNESS_MODEL is "${model}" but the request goes to OpenAI (api.openai.com).\n\n` +
        'OpenAI does not use `vendor/model` ids (that shape is for LM Studio / Ollama).\n' +
        'Set e.g. HARNESS_MODEL=gpt-4o-mini or HARNESS_MODEL=gpt-4o\n\n' +
        'List ids your key can use: npm run eval:models\n'
    )
  }

  if (process.env.HARNESS_DEBUG === '1') {
    console.error(`[blockmark-harness] model=${JSON.stringify(model)} url=${url}`)
  }
}

/**
 * GET /v1/models URL for the configured base (OpenAI-compatible).
 *
 * @param {string | undefined} baseURLOverride
 * @returns {string}
 */
export function resolveModelsListUrl(baseURLOverride) {
  let base = (baseURLOverride || process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL).trim()
  base = base.replace(/\/+$/, '')
  if (/\/v1$/i.test(base)) return `${base}/models`
  return `${base}/v1/models`
}

/**
 * OpenAI project keys must hit api.openai.com — LM Studio / local servers reject sk-proj-* as "malformed LM Studio token".
 *
 * @param {string} baseURL
 * @param {string} apiKey
 */
export function assertKeyMatchesBaseUrl(baseURL, apiKey) {
  const key = (apiKey || '').trim()
  if (!key.startsWith('sk-proj-')) return

  let host = ''
  try {
    const raw = baseURL.trim()
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`)
    host = u.hostname.toLowerCase()
  } catch {
    return
  }

  const local =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host.endsWith('.local')

  if (!local) return

  throw new Error(
    'OPENAI_API_KEY looks like an OpenAI key (sk-proj-...), but OPENAI_BASE_URL points to a local server (e.g. LM Studio).\n\n' +
      'Use one of these:\n' +
      '  • Real OpenAI: OPENAI_BASE_URL=https://api.openai.com/v1\n' +
      '  • LM Studio only: use the developer key from LM Studio (not sk-proj-*), and OPENAI_BASE_URL=http://127.0.0.1:1234/v1\n\n' +
      'Tip: shell exports override .env — run `unset OPENAI_BASE_URL` if an old value is stuck.'
  )
}

/**
 * Build the chat completions POST URL from env / opts.
 *
 * @param {string | undefined} baseURLOverride
 * @returns {string}
 */
export function resolveChatCompletionsUrl(baseURLOverride) {
  const explicit = process.env.OPENAI_COMPLETIONS_URL?.trim()
  if (explicit) return explicit

  let base = (baseURLOverride || process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL).trim()
  base = base.replace(/\/+$/, '')

  const noV1 = process.env.HARNESS_OPENAI_NO_V1 === '1' || process.env.HARNESS_OPENAI_NO_V1 === 'true'

  if (noV1) {
    return `${base}/chat/completions`
  }

  if (/\/v1$/i.test(base)) {
    return `${base}/chat/completions`
  }

  return `${base}/v1/chat/completions`
}

/**
 * @param {{ messages: Array, tools?: Array, model?: string, baseURL?: string, apiKey?: string }} opts
 * @returns {Promise<{ message: { role: string, content: string | null, tool_calls?: Array }, usage?: { prompt_tokens?: number, completion_tokens?: number } }>}
 */
export async function chatCompletion(opts) {
  const model = normalizeHarnessModel(opts.model || process.env.HARNESS_MODEL)
  const apiKey = opts.apiKey || process.env.OPENAI_API_KEY || ''
  const baseForCheck =
    opts.baseURL || process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL

  assertKeyMatchesBaseUrl(baseForCheck, apiKey)

  const url = resolveChatCompletionsUrl(opts.baseURL)
  if (process.env.HARNESS_DEBUG === '1') {
    console.error(`[blockmark-harness] POST ${url}`)
  }

  const body = {
    model,
    messages: opts.messages,
    temperature: 1
  }

  if (opts.tools?.length) {
    body.tools = opts.tools
    body.tool_choice = 'auto'
  }

  const authKey = apiKey || 'ollama'

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authKey}`
    },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const text = await res.text()
    let msg = `LLM API ${res.status}: ${text.slice(0, 500)}`
    if (res.status === 400 && /invalid model/i.test(text)) {
      try {
        const host = new URL(url).hostname
        if (host === 'api.openai.com' || host.endsWith('.openai.com')) {
          msg +=
            '\n\nHint for api.openai.com:\n' +
            '  • Use a current id: gpt-4o-mini, gpt-4o, gpt-4-turbo (not bare gpt-4).\n' +
            '  • No slashes: not qwen/foo — that is for LM Studio.\n' +
            '  • Check spelling and spaces in HARNESS_MODEL; run: npm run eval:models\n' +
            '  • Docs: https://platform.openai.com/docs/models'
        }
      } catch {
        /* ignore */
      }
    }
    throw new Error(msg)
  }

  const data = await res.json()
  const choice = data.choices?.[0]

  if (!choice) {
    throw new Error(`LLM API returned no choices: ${JSON.stringify(data).slice(0, 500)}`)
  }

  return {
    message: choice.message,
    usage: data.usage ?? null
  }
}
