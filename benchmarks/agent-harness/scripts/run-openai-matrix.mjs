#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_MODELS = ['gpt-5.4-mini', 'gpt-4o-mini', 'gpt-4o']
const REPEATS = Number(process.env.HARNESS_REPEATS || 5)
const FIXTURE_TIER = process.env.HARNESS_FIXTURE_TIER || 'large'
const RUN_TIMEOUT_MS = Number(process.env.HARNESS_RUN_TIMEOUT_MS || 900000)
const MODELS = (process.env.HARNESS_MODEL_MATRIX || DEFAULT_MODELS.join(','))
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

const promptPricePer1M = parseFloat(process.env.OPENAI_PRICE_PROMPT_PER_1M || '')
const completionPricePer1M = parseFloat(process.env.OPENAI_PRICE_COMPLETION_PER_1M || '')
const pricingEnabled = Number.isFinite(promptPricePer1M) && Number.isFinite(completionPricePer1M)

const projectRoot = join(fileURLToPath(new URL('../../..', import.meta.url)))
const runPath = join(projectRoot, 'benchmarks/agent-harness/run.mjs')
const outDir = join(projectRoot, 'benchmarks/agent-harness/results')
mkdirSync(outDir, { recursive: true })

function summarizeRepeatResults(results) {
  const bm = results.filter(r => r.arm === 'blockmark')
  const bl = results.filter(r => r.arm === 'baseline')
  const bmPass = bm.filter(r => r.pass).length / bm.length
  const blPass = bl.filter(r => r.pass).length / bl.length
  const bmPrompt = bm.reduce((s, r) => s + r.promptTokens, 0)
  const bmComp = bm.reduce((s, r) => s + r.completionTokens, 0)
  const blPrompt = bl.reduce((s, r) => s + r.promptTokens, 0)
  const blComp = bl.reduce((s, r) => s + r.completionTokens, 0)
  const bmTotal = bmPrompt + bmComp
  const blTotal = blPrompt + blComp
  const tokenDeltaPct = blTotal > 0 ? ((blTotal - bmTotal) / blTotal) * 100 : 0
  const cost = pricingEnabled ? {
    bm: (bmPrompt / 1_000_000) * promptPricePer1M + (bmComp / 1_000_000) * completionPricePer1M,
    bl: (blPrompt / 1_000_000) * promptPricePer1M + (blComp / 1_000_000) * completionPricePer1M
  } : null
  const costDeltaPct = cost && cost.bl > 0 ? ((cost.bl - cost.bm) / cost.bl) * 100 : null
  return { bmPass, blPass, bmPrompt, bmComp, blPrompt, blComp, bmTotal, blTotal, tokenDeltaPct, costDeltaPct }
}

function mean(xs) {
  return xs.reduce((s, x) => s + x, 0) / xs.length
}

function percentile(xs, p) {
  const sorted = [...xs].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))
  return sorted[idx]
}

function bootstrapCI(values, iters = 2000) {
  const boots = []
  for (let i = 0; i < iters; i++) {
    const sample = []
    for (let j = 0; j < values.length; j++) {
      const k = Math.floor(Math.random() * values.length)
      sample.push(values[k])
    }
    boots.push(mean(sample))
  }
  return [percentile(boots, 0.025), percentile(boots, 0.975)]
}

const matrix = []
for (const model of MODELS) {
  const repeats = []
  const repeatErrors = []
  for (let i = 0; i < REPEATS; i++) {
    process.stderr.write(`\n[matrix] model=${model} repeat=${i + 1}/${REPEATS}\n`)
    const res = spawnSync(process.execPath, [runPath, '--compare', '--json'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        HARNESS_MODE: 'live',
        HARNESS_MODEL: model,
        HARNESS_FIXTURE_TIER: FIXTURE_TIER
      },
      encoding: 'utf8',
      timeout: RUN_TIMEOUT_MS
    })
    if (res.error && res.error.message) {
      repeatErrors.push({ repeat: i + 1, error: res.error.message })
      process.stderr.write(`[matrix] warn: ${model} repeat ${i + 1} failed: ${res.error.message}\n`)
      continue
    }
    if (res.status !== 0) {
      process.stderr.write(res.stdout)
      process.stderr.write(res.stderr)
      repeatErrors.push({ repeat: i + 1, error: `exit ${res.status}` })
      process.stderr.write(`[matrix] warn: ${model} repeat ${i + 1} exited ${res.status}\n`)
      continue
    }
    const lines = res.stdout.trim().split('\n')
    const jsonLine = lines[lines.length - 1]
    const parsed = JSON.parse(jsonLine)
    repeats.push(summarizeRepeatResults(parsed.results))
  }

  if (repeats.length === 0) {
    throw new Error(`no successful repeats for ${model}`)
  }

  const bmPass = repeats.map(r => r.bmPass)
  const blPass = repeats.map(r => r.blPass)
  const tokenDelta = repeats.map(r => r.tokenDeltaPct)
  const costDelta = repeats.map(r => r.costDeltaPct).filter(v => v != null)
  const gatePass = mean(bmPass) >= 0.95 && mean(bmPass) >= mean(blPass) - 0.01

  matrix.push({
    model,
    requestedRepeats: REPEATS,
    completedRepeats: repeats.length,
    fixtureTier: FIXTURE_TIER,
    repeatErrors,
    gatePass,
    bmPassMean: mean(bmPass),
    blPassMean: mean(blPass),
    tokenDeltaMean: mean(tokenDelta),
    tokenDeltaCI95: bootstrapCI(tokenDelta),
    costDeltaMean: costDelta.length ? mean(costDelta) : null,
    costDeltaCI95: costDelta.length ? bootstrapCI(costDelta) : null
  })
}

const out = {
  generatedAt: new Date().toISOString(),
  repeats: REPEATS,
  fixtureTier: FIXTURE_TIER,
  models: MODELS,
  pricing: pricingEnabled ? {
    promptPer1M: promptPricePer1M,
    completionPer1M: completionPricePer1M
  } : null,
  matrix
}

const outPath = join(outDir, `openai-matrix-${Date.now()}.json`)
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8')
console.log(JSON.stringify(out, null, 2))
console.error(`\n[matrix] wrote ${outPath}`)
