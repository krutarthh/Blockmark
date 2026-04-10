import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const RECORDINGS_DIR = new URL('../recordings/', import.meta.url).pathname

/**
 * Create a recorder that appends entries to a JSONL file.
 *
 * @param {string} taskId
 * @param {string} arm
 * @returns {{ record: (entry: any) => void, flush: () => void }}
 */
export function createRecorder(taskId, arm) {
  const lines = []
  const filePath = join(RECORDINGS_DIR, `${taskId}.${arm}.jsonl`)

  return {
    record(entry) {
      lines.push(JSON.stringify(entry))
    },
    flush() {
      if (!existsSync(dirname(filePath))) {
        mkdirSync(dirname(filePath), { recursive: true })
      }
      writeFileSync(filePath, lines.join('\n') + '\n', 'utf8')
    }
  }
}

/**
 * Create a replay iterator that yields assistant messages from a recorded
 * JSONL transcript. Tool messages are skipped (the harness re-executes
 * tools live against the real SDK).
 *
 * @param {string} taskId
 * @param {string} arm
 * @returns {Iterator<any> | null}
 */
export function createReplayIterator(taskId, arm) {
  const filePath = join(RECORDINGS_DIR, `${taskId}.${arm}.jsonl`)

  if (!existsSync(filePath)) return null

  const lines = readFileSync(filePath, 'utf8').trim().split('\n')
  const assistantMessages = []

  for (const line of lines) {
    if (!line.trim()) continue
    const entry = JSON.parse(line)
    if (entry.role === 'assistant') {
      assistantMessages.push({
        role: 'assistant',
        content: entry.content,
        tool_calls: entry.tool_calls ?? undefined
      })
    }
  }

  let idx = 0
  return {
    next() {
      if (idx >= assistantMessages.length) return { done: true, value: undefined }
      return { done: false, value: assistantMessages[idx++] }
    },
    [Symbol.iterator]() { return this }
  }
}
