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

**97% fewer tokens** compared to full-document rewrites. ([See the benchmark.](benchmarks/agent-edit-accuracy/benchmark.js))

## Quickstart

```bash
# Clone and install
git clone https://github.com/your-org/blockmark.git
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

### Reading the report

The harness prints a table with one row per task per arm (shape is similar to the per-task tables under [Sample live results (multi-model)](#sample-live-results-multi-model) above).

- **Steps** — number of LLM round-trips
- **PromptTok / CompTok** — total tokens consumed (when the API reports them)
- **Pass** — whether the verifier assertion held on the final document

In `--compare` mode the summary also shows aggregate token usage for blockmark vs baseline. A **negative** “savings” number means blockmark used more reported tokens in that run (common with small models that take extra tool rounds and grow the chat context). Baseline often has **lower prompt** tokens but **higher completion** tokens on `write_document` because it echoes the full file. Interpret the table per task, not only the headline.

Query tasks (`queryEquals` in `tasks.eval.json`) pass when the document still matches the expected `queryBlocks` result. They do **not** require the model to spell out every block ID unless you set `"requireModelMentionIds": true` on that verifier.

### Sample live results (multi-model)

The following runs all used **`HARNESS_MODE=live`**, **`npm run eval`** (or `node benchmarks/agent-harness/run.mjs --compare`), OpenAI’s Chat Completions API, and the shared eval fixture (including the large appendix in [`benchmarks/agent-edit-accuracy/fixture.md`](benchmarks/agent-edit-accuracy/fixture.md), on the order of **90k+ characters**). Token columns are **sums of API-reported usage** across the four tasks in that arm (same tasks for blockmark and baseline).

| Model | Pass | Blockmark total tok | Baseline total tok | Headline vs baseline |
|-------|------|--------------------:|-------------------:|----------------------|
| `gpt-5.4-mini` | 8/8 | 9,739 | 13,591 | **−28%** (blockmark lower) |
| `gpt-4o-mini` | 8/8 | 11,231 | 13,363 | **−16%** |
| `gpt-4o` | 8/8 | 11,238 | 12,602 | **−11%** |
| `gpt-5.4` | 8/8 | 15,249 | 13,559 | **+12%** (blockmark higher) |

“Headline vs baseline” matches the harness line *Token savings (blockmark vs baseline, sum of reported usage)* (positive % means blockmark used fewer total reported tokens). **Which model wins on totals varies:** blockmark often trades higher **prompt** tokens (tool rounds and context growth) for lower **completion** tokens; if prompt growth is large enough, baseline can still be cheaper on sum of reported usage (as with **`gpt-5.4`** here vs **`gpt-5.4-mini`**).

<details>
<summary>Per-task tables (gpt-5.4-mini)</summary>

| Task | Arm | Pass | Steps | PromptTok | CompTok |
|------|-----|------|------:|----------:|--------:|
| edit-req-1 | blockmark | YES | 3 | 1,510 | 94 |
| update-perf-threshold | blockmark | YES | 4 | 4,921 | 112 |
| add-decision-context | blockmark | YES | 3 | 1,537 | 105 |
| extract-open-high-reqs | blockmark | YES | 2 | 1,408 | 52 |
| edit-req-1 | baseline | YES | 3 | 3,199 | 884 |
| update-perf-threshold | baseline | YES | 3 | 3,208 | 856 |
| add-decision-context | baseline | YES | 3 | 3,219 | 887 |
| extract-open-high-reqs | baseline | YES | 2 | 1,280 | 58 |

</details>

<details>
<summary>Per-task tables (gpt-4o-mini)</summary>

| Task | Arm | Pass | Steps | PromptTok | CompTok |
|------|-----|------|------:|----------:|--------:|
| edit-req-1 | blockmark | YES | 4 | 3,185 | 102 |
| update-perf-threshold | blockmark | YES | 4 | 3,217 | 110 |
| add-decision-context | blockmark | YES | 4 | 3,221 | 113 |
| extract-open-high-reqs | blockmark | YES | 2 | 1,234 | 49 |
| edit-req-1 | baseline | YES | 3 | 2,916 | 1,657 |
| update-perf-threshold | baseline | YES | 3 | 2,935 | 876 |
| add-decision-context | baseline | YES | 3 | 2,942 | 886 |
| extract-open-high-reqs | baseline | YES | 2 | 1,106 | 45 |

</details>

<details>
<summary>Per-task tables (gpt-4o)</summary>

| Task | Arm | Pass | Steps | PromptTok | CompTok |
|------|-----|------|------:|----------:|--------:|
| edit-req-1 | blockmark | YES | 4 | 3,183 | 100 |
| update-perf-threshold | blockmark | YES | 4 | 3,217 | 109 |
| add-decision-context | blockmark | YES | 4 | 3,221 | 113 |
| extract-open-high-reqs | blockmark | YES | 2 | 1,242 | 53 |
| edit-req-1 | baseline | YES | 3 | 2,923 | 876 |
| update-perf-threshold | baseline | YES | 3 | 2,938 | 879 |
| add-decision-context | baseline | YES | 3 | 2,949 | 886 |
| extract-open-high-reqs | baseline | YES | 2 | 1,106 | 45 |

</details>

<details>
<summary>Per-task tables (gpt-5.4)</summary>

| Task | Arm | Pass | Steps | PromptTok | CompTok |
|------|-----|------|------:|----------:|--------:|
| edit-req-1 | blockmark | YES | 4 | 3,556 | 154 |
| update-perf-threshold | blockmark | YES | 4 | 4,921 | 113 |
| add-decision-context | blockmark | YES | 4 | 4,926 | 117 |
| extract-open-high-reqs | blockmark | YES | 2 | 1,408 | 54 |
| edit-req-1 | baseline | YES | 3 | 3,191 | 875 |
| update-perf-threshold | baseline | YES | 3 | 3,208 | 868 |
| add-decision-context | baseline | YES | 3 | 3,220 | 886 |
| extract-open-high-reqs | baseline | YES | 2 | 1,280 | 31 |

</details>

## Examples

- **[Surgical edit demo](examples/agent-surgical-edit/)** — Before/after showing an agent patching one block
- **[Requirements tracker](examples/requirements-tracker/)** — A PRD with typed, queryable blocks
- **[Prompt templates](examples/prompt-templates/)** — System prompt for blockmark-aware agents
- **[Benchmark](benchmarks/agent-edit-accuracy/)** — Quantified comparison: blockmark vs full-rewrite
- **[Agent eval harness](benchmarks/agent-harness/)** — Real LLM evaluation: blockmark vs baseline

## License

MIT
