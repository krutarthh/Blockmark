# Blockmark

**Stable block IDs for agent-era markdown.**

Blockmark adds one thing to markdown: addressable blocks. A lightweight `^[id]` prefix that gives any block a permanent handle — so AI agents can target, extract, and patch individual blocks without full-document rewrites.

```markdown
^[req-1 type=requirement status=open] Users must authenticate via OAuth 2.0.

## ^[arch] System Architecture

The system uses a microservices pattern.

- ^[task-1 type=task] Implement login flow
- ^[task-2 type=task] Write auth tests
```

## The Problem

Every AI agent editing tool uses fragile strategies to target markdown:

| Strategy | How it breaks |
|----------|--------------|
| **Line numbers** | Any edit above shifts them |
| **Exact string matching** | Whitespace changes, duplicate text, reformatting |
| **Full-document rewrites** | Wasteful tokens, noisy diffs, risks losing content |
| **Regex on prose** | Unreliable on natural language |

The result: agents do unnecessary work, edits are fragile, and diffs are unreadable.

## The Solution

```bash
# Agent reads one block — not the whole document
blockmark get doc.md req-1
# → "Users must authenticate via OAuth 2.0."

# Agent patches one block — everything else stays byte-identical
blockmark patch doc.md req-1 --content "Users must authenticate via SSO."

# Query blocks by type and status
blockmark query doc.md --type requirement --status open
# → req-1, req-3

# Diff two versions — by block, not by line
blockmark diff v1.md v2.md
# → req-1: changed, req-2: unchanged, req-3: added
```

On the **scripted** benchmark in [`benchmarks/agent-edit-accuracy/benchmark.js`](benchmarks/agent-edit-accuracy/benchmark.js), blockmark traffic is **far smaller** than a full-document rewrite for the same edits (often **~90%+** fewer characters in/out on that simulation). **Live** LLM runs vary by model, fixture size, and network—see [Evaluation results](#evaluation-results-recorded-runs).

## Quickstart

```bash
# Clone and install
git clone https://github.com/krutarthh/Blockmark.git
cd blockmark
npm install

# Try the CLI
node packages/blockmark-cli/bin/blockmark.js list examples/test-doc.md
node packages/blockmark-cli/bin/blockmark.js get examples/test-doc.md req-1

# Run the demo
node examples/agent-surgical-edit/demo.js

# Run all tests (78 tests across 5 packages)
npm test
```

## SDK Usage

```javascript
import { getBlock, patchBlock, queryBlocks, listBlocks, diffBlocks } from 'blockmark-sdk'

const doc = fs.readFileSync('doc.md', 'utf8')

// Get a block's content
const content = getBlock(doc, 'req-1')
// → "Users must authenticate via OAuth 2.0."

// Surgical edit — only req-1 changes, everything else is byte-identical
const patched = patchBlock(doc, 'req-1', 'Users must authenticate via SSO.')

// Query by attributes
const openReqs = queryBlocks(doc, { type: 'requirement', status: 'open' })

// List all addressable blocks
const blocks = listBlocks(doc)

// Diff two document versions by block ID
const diffs = diffBlocks(oldDoc, newDoc)
// → [{ id: 'req-1', status: 'changed' }, { id: 'req-2', status: 'unchanged' }, ...]
```

## Syntax

A blockmark prefix is `^[id]` or `^[id key=value ...]` followed by a space, placed at the start of a block's content:

| Block type | Syntax |
|-----------|--------|
| Paragraph | `^[id] Content text...` |
| Heading | `## ^[id] Heading text` |
| List item | `- ^[id] Item text` |
| Blockquote | `> ^[id] Quote text` |

**Attributes** are optional key-value metadata:

```markdown
^[req-1 type=requirement status=open priority=high] Must support SSO.
^[dec-1 type=decision supersedes=dec-0] We chose Postgres.
```

Existing markdown parsers treat `^[id]` as plain text — blockmark degrades gracefully.

Full spec: [spec/v0.1.md](spec/v0.1.md)

## Packages

| Package | Purpose |
|---------|---------|
| `micromark-extension-blockmark` | Core prefix parser (regex + tokenizer) |
| `mdast-util-blockmark` | AST transform — extract/restore block IDs on mdast nodes |
| `remark-blockmark` | remark plugin — use with unified/remark pipelines |
| `blockmark-sdk` | High-level SDK — `getBlock`, `patchBlock`, `queryBlocks`, `listBlocks`, `diffBlocks` |
| `blockmark-cli` | CLI — `blockmark get`, `patch`, `query`, `list`, `diff` |

## Architecture

```
                   micromark-extension-blockmark
                     (prefix regex + parser)
                              │
                    mdast-util-blockmark
                  (AST attach/extract/restore)
                              │
                      remark-blockmark
                    (unified plugin glue)
                              │
                 ┌────────────┴────────────┐
           blockmark-sdk              blockmark-cli
        (JS/TS library API)        (terminal interface)
                 │                        │
                 └────────────┬────────────┘
                     Agent tool integrations
```

## Why Not...

**Obsidian `^block-id`?** — Suffix position (agent has to read the whole block to find the ID), not standardized outside Obsidian, no programmatic SDK.

**Kramdown `{#id}`?** — Tied to Kramdown renderer, no agent tooling, no query/patch operations.

**MDX/components?** — Heavy runtime, JSX syntax, not designed for agent editing.

**YAML frontmatter?** — Document-level only, not block-level.

## Tests

```bash
# Run all 78 tests
npm test

# Individual packages
node --test packages/micromark-extension-blockmark/test/index.js
node --test packages/mdast-util-blockmark/test/index.js
node --test packages/remark-blockmark/test/index.js
node --test packages/blockmark-sdk/test/index.js
node --test packages/blockmark-cli/test/index.js
```

## Agent Evaluation Harness

The repo includes a real-agent eval harness that runs edit tasks against a live LLM (or replayed transcripts) in two arms:

- **Blockmark arm** — surgical tools: `list_blocks`, `get_block`, `patch_block`, `query_blocks`
- **Baseline arm** — full-document tools: `read_document`, `write_document`

Both arms run the same tasks against the same fixture document, then a verifier checks the final document state.

### Configure with `.env`

Copy the example file and fill in your API details:

```bash
cp .env.example .env
# edit .env — OPENAI_BASE_URL, OPENAI_API_KEY, HARNESS_MODEL, etc.
```

The harness loads `.env` from the repo root when you run `node benchmarks/agent-harness/run.mjs` or `npm run eval`. Values already set in your shell take precedence.

### Run with a local model (Ollama + Gemma)

```bash
# Start Ollama with Gemma
ollama run gemma2:9b

# Run blockmark arm against all tasks
export OPENAI_BASE_URL=http://localhost:11434/v1
export OPENAI_API_KEY=ollama
export HARNESS_MODEL=gemma2:9b
node benchmarks/agent-harness/run.mjs --arm blockmark --tasks all

# Compare both arms head-to-head
node benchmarks/agent-harness/run.mjs --compare

# Record transcripts for later replay
HARNESS_MODE=record node benchmarks/agent-harness/run.mjs --compare
```

### Run with a real OpenAI API key

Use the official Chat Completions endpoint (same shape the harness already expects).

1. In **`.env`** (repo root), set:

```env
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=sk-proj-...your-secret-key...
HARNESS_MODEL=gpt-4o-mini
```

Do **not** set `HARNESS_MODE=replay` if you want live calls. Leave `HARNESS_MODE` unset or use `live`.

2. **Smoke test** one task (cheaper than full `--compare`):

```bash
node benchmarks/agent-harness/run.mjs --arm blockmark --tasks edit-req-1
```

3. **Full compare** (both arms, all eval tasks — several API rounds, billed per token):

```bash
node benchmarks/agent-harness/run.mjs --compare
```

Use a model that supports **tool/function calling** (e.g. `gpt-4o-mini`, `gpt-4o`). OpenAI often returns **invalid model ID** for bare `gpt-4`; prefer **`gpt-4o`** or **`gpt-4-turbo`** for GPT‑4‑class behavior. If you see empty or malformed tool calls, try a stronger model or run `HARNESS_DEBUG=1` to confirm requests go to `https://api.openai.com/v1/chat/completions`.

### Other OpenAI-compatible APIs

```bash
export OPENAI_BASE_URL=https://your-gateway.example/v1
export OPENAI_API_KEY=...
export HARNESS_MODEL=your-model-id
node benchmarks/agent-harness/run.mjs --compare
```

### If you see `invalid model ID` (OpenAI)

Your key only allows certain model names, and they must match **exactly** (no LM Studio-style `qwen/...` on `api.openai.com`).

```bash
npm run eval:models
```

Pick an `id` from the list and set `HARNESS_MODEL` to that string. Try `gpt-4o-mini` first.

### Replay mode (CI, no LLM required)

Pre-recorded transcripts are committed under `benchmarks/agent-harness/recordings/`. Replay re-executes the tool calls against the live SDK but reads model responses from disk:

```bash
npm run eval:replay
```

If you change `benchmarks/agent-edit-accuracy/fixture.md`, baseline replay files embed the full post-edit document. Regenerate them with `npm run eval:sync-baseline-replay`, then run `npm run eval:replay` again.

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | API root. For LM Studio / Ollama, set a local URL (e.g. `http://127.0.0.1:1234/v1`). **Do not** send OpenAI `sk-proj-*` keys to localhost — use OpenAI’s URL or a local dev key. |
| `OPENAI_COMPLETIONS_URL` | (unset) | If set, the **full** POST URL for chat completions (overrides base joining). Use this when your gateway uses a non-standard path. |
| `HARNESS_OPENAI_NO_V1` | (unset) | Set to `1` to POST to `{OPENAI_BASE_URL}/chat/completions` with **no** `/v1` segment. Use when the server logs errors for `/v1/chat/completions`. |
| `OPENAI_API_KEY` | `ollama` | API key |
| `HARNESS_MODEL` | `gpt-4o-mini` | Model name |
| `HARNESS_MODE` | `live` | `live`, `record`, or `replay` |
| `HARNESS_DEBUG` | (unset) | Set to `1` to print the resolved completions URL to stderr |
| `HARNESS_FIXTURE_TIER` | `large` | `large` = [`fixture.md`](benchmarks/agent-edit-accuracy/fixture.md) (~90k+ chars appendix); `small` = [`fixture.small.md`](benchmarks/agent-edit-accuracy/fixture.small.md) (cheaper iteration). |
| `HARNESS_FIXTURE` | (unset) | Optional absolute path to a custom markdown fixture (overrides tier). |

### Reading the report

The harness prints one row per **task** and **arm** with **Steps**, **PromptTok**, **CompTok**, and **Pass**.

- **Steps** — LLM round-trips (tool calls).
- **PromptTok / CompTok** — API-reported usage (replay mode shows `0`).
- **Pass** — verifier result on the final document (see [`tasks.eval.json`](benchmarks/agent-harness/tasks.eval.json)).

**Headline token comparison** (blockmark vs baseline sum) is only printed when **every** task passes on **both** arms with no transport errors. If anything fails (model error, `fetch failed`, or verifier miss), the run is **not** a fair apples-to-apples cost comparison—read the per-task rows.

Query tasks use `queryEquals`; the harness can require the model to cite IDs in prose (`requireModelMentionIds`) for stricter checks.

### Harness implementation (eval rigor + cheaper blockmark tool traffic)

- **Blockmark system prompt** ([`run.mjs`](benchmarks/agent-harness/run.mjs)): prefer **`get_block` → `patch_block`** when IDs are known; avoid **`list_blocks`** unless necessary.
- **Compact `list_blocks`** ([`tools.js`](benchmarks/agent-harness/lib/tools.js)): returns only `id`, `attributes`, `nodeType`.
- **Verifiers** ([`verifier.js`](benchmarks/agent-harness/lib/verifier.js), [`tasks.eval.json`](benchmarks/agent-harness/tasks.eval.json)): `mustMatchBlockIds` on edits; **`documentUnchanged`** / **`multiBlockContains`** for no-op and multi-block tasks; query task can require cited IDs.
- **Fixtures**: default **large** [`fixture.md`](benchmarks/agent-edit-accuracy/fixture.md); **`HARNESS_FIXTURE_TIER=small`** uses [`fixture.small.md`](benchmarks/agent-edit-accuracy/fixture.small.md) for cheaper live iteration.
- **Transparency**: stderr line `mode`, `model`, `base`; **`--json`** for machine-readable output.
- **Fair aggregate line**: savings are omitted unless all paired tasks succeed (see above).

### Evaluation results (recorded runs)

**CI / zero API cost** — regression coverage of tools + SDK + verifiers:

```bash
npm run eval:replay
```

Expected: **14/14** (7 tasks × 2 arms), `HARNESS_MODE=replay`, no tokens billed.

---

**Live OpenAI runs** below used `https://api.openai.com/v1` and the **large** fixture unless noted. Totals are **single-run**, **API-reported**, **not** dollar costs. Interpret as “what we saw on this harness,” not a universal law.

#### A — Four-task suite (8 paired rows: 4 tasks × 2 arms)

Same four tasks as in earlier benchmarks (`edit-req-1`, `update-perf-threshold`, `add-decision-context`, `extract-open-high-reqs`).

| Model | All pass? | Headline vs baseline (sum of prompt+completion) |
|-------|-----------|---------------------------------------------------|
| `gpt-5.4-mini` | 8/8 | **28%** lower total on blockmark |
| `gpt-4o-mini` | 8/8 | **16%** lower |
| `gpt-4o` | 8/8 | **11%** lower |
| `gpt-5.4` | 8/8 | **12%** higher on blockmark |
| `gpt-5.4` (repeat run) | 8/8 | **22%** higher on blockmark |

Formula when both arms complete all tasks: `round((1 − blockmark_total ÷ baseline_total) × 100)`.

**Also observed:** `404` with *“This is not a chat model…”* — `HARNESS_MODEL` must be a **chat** model that supports `/v1/chat/completions` + tools (use `npm run eval:models`). **`429 insufficient_quota`** — billing/quota exhausted. **Partial baseline** (`fetch failed` on large `write_document`) — do **not** trust a printed headline until both arms finish every task.

#### B — Seven-task suite (14 paired rows; current [`tasks.eval.json`](benchmarks/agent-harness/tasks.eval.json))

Adds `unknown-id-noop`, `multi-block-status-update`, `read-only-summary`.

| Model | Pass (of 14) | Notes |
|-------|--------------|--------|
| `gpt-5.4-mini` | **14/14** | Full pass; large-doc run showed ~**94%** lower blockmark total vs baseline in logs when both arms completed all tasks |
| `gpt-5.4-mini` | **13/14** | Baseline **`unknown-id-noop`** failed: model changed the document when asked not to — quality issue on baseline arm, not a token “win” |
| `gpt-4o-mini` | **7/7** blockmark only | Blockmark **18,609** total tokens (sum of prompt+completion) with all tasks passing; **baseline** hit **`fetch failed`** on several full-document writes — **no** fair combined headline for that run |
| `gpt-4o-mini` | **10/14** | Baseline **`fetch failed`** on edit tasks (large `write_document` / network) — **ignore** any printed savings line; retry or use `HARNESS_FIXTURE_TIER=small` |

**Other live notes:** occasional **blockmark** miss on `add-decision-context` (e.g. missing `MySQL` in `dec-1`) until the model retries—verifier correctly fails that task.

#### C — Budget-friendly workflow

- Ship **CI** with `npm run eval:replay` (free).
- For **live** checks without burning tokens on the appendix: `HARNESS_FIXTURE_TIER=small` and/or a single task: `--tasks edit-req-1`.
- Optional multi-repeat matrix (costly): [`benchmarks/agent-harness/scripts/run-openai-matrix.mjs`](benchmarks/agent-harness/scripts/run-openai-matrix.mjs) via `npm run eval:matrix:openai` — set `HARNESS_REPEATS`, `HARNESS_MODEL_MATRIX`, optional `OPENAI_PRICE_*` for rough USD estimates.

## Examples

- **[Surgical edit demo](examples/agent-surgical-edit/)** — Before/after showing an agent patching one block
- **[Requirements tracker](examples/requirements-tracker/)** — A PRD with typed, queryable blocks
- **[Prompt templates](examples/prompt-templates/)** — System prompt for blockmark-aware agents
- **[Benchmark](benchmarks/agent-edit-accuracy/)** — Quantified comparison: blockmark vs full-rewrite
- **[Agent eval harness](benchmarks/agent-harness/)** — Real LLM evaluation: blockmark vs baseline

## License

MIT
