import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const CLI = new URL('../bin/blockmark.js', import.meta.url).pathname

function run(...args) {
  return execFileSync('node', [CLI, ...args], { encoding: 'utf8' })
}

const TEST_DOC = `^[req-1 type=requirement status=open] Users must authenticate via OAuth 2.0.

^[req-2 type=requirement status=done] Dashboard must load in under 2s.

## ^[arch] System Architecture

- ^[task-1 type=task status=open] Implement login
- ^[task-2 type=task status=done] Write tests

> ^[note-1] Important caveat.
`

let tmpDir
let testFile

before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'blockmark-test-'))
  testFile = join(tmpDir, 'test.md')
  writeFileSync(testFile, TEST_DOC)
})

after(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('blockmark CLI', () => {
  describe('list', () => {
    it('lists all blocks', () => {
      const out = run('list', testFile)
      assert.ok(out.includes('req-1'))
      assert.ok(out.includes('req-2'))
      assert.ok(out.includes('arch'))
      assert.ok(out.includes('task-1'))
      assert.ok(out.includes('note-1'))
    })

    it('outputs JSON with --json', () => {
      const out = run('list', testFile, '--json')
      const data = JSON.parse(out)
      assert.ok(Array.isArray(data))
      assert.ok(data.length >= 5)
      assert.ok(data.some(b => b.id === 'req-1'))
    })
  })

  describe('get', () => {
    it('gets block content by ID', () => {
      const out = run('get', testFile, 'req-1')
      assert.equal(out, 'Users must authenticate via OAuth 2.0.')
    })

    it('exits with error for missing ID', () => {
      assert.throws(
        () => run('get', testFile, 'nonexistent'),
        /Block "nonexistent" not found/
      )
    })
  })

  describe('query', () => {
    it('queries by type', () => {
      const out = run('query', testFile, '--type', 'requirement')
      assert.ok(out.includes('req-1'))
      assert.ok(out.includes('req-2'))
      assert.ok(!out.includes('task-1'))
    })

    it('queries by status', () => {
      const out = run('query', testFile, '--status', 'open')
      assert.ok(out.includes('req-1'))
      assert.ok(out.includes('task-1'))
      assert.ok(!out.includes('req-2'))
    })

    it('outputs JSON with --json', () => {
      const out = run('query', testFile, '--type', 'task', '--json')
      const data = JSON.parse(out)
      assert.ok(Array.isArray(data))
      assert.equal(data.length, 2)
    })
  })

  describe('patch', () => {
    it('patches a block in place', () => {
      const patchFile = join(tmpDir, 'patch-test.md')
      writeFileSync(patchFile, TEST_DOC)

      run('patch', patchFile, 'req-1', '-c', 'Users must authenticate via SSO.')

      const result = readFileSync(patchFile, 'utf8')
      assert.ok(result.includes('Users must authenticate via SSO.'))
      assert.ok(result.includes('^[req-1 type=requirement status=open]'))
      assert.ok(result.includes('^[req-2 type=requirement status=done]'))
    })

    it('patches to a different output file', () => {
      const patchFile = join(tmpDir, 'patch-source.md')
      const outputFile = join(tmpDir, 'patch-output.md')
      writeFileSync(patchFile, TEST_DOC)

      run('patch', patchFile, 'req-1', '-c', 'New content.', '-o', outputFile)

      const original = readFileSync(patchFile, 'utf8')
      const result = readFileSync(outputFile, 'utf8')
      assert.ok(original.includes('OAuth 2.0'))
      assert.ok(result.includes('New content.'))
    })
  })

  describe('diff', () => {
    it('diffs two files', () => {
      const file1 = join(tmpDir, 'v1.md')
      const file2 = join(tmpDir, 'v2.md')
      writeFileSync(file1, TEST_DOC)

      const modified = TEST_DOC.replace(
        'Users must authenticate via OAuth 2.0.',
        'Users must authenticate via SSO.'
      )
      writeFileSync(file2, modified)

      const out = run('diff', file1, file2)
      assert.ok(out.includes('~ req-1: changed'))
    })

    it('outputs JSON with --json', () => {
      const file1 = join(tmpDir, 'v1b.md')
      const file2 = join(tmpDir, 'v2b.md')
      writeFileSync(file1, '^[a] Block A.\n')
      writeFileSync(file2, '^[a] Block A modified.\n\n^[b] Block B.\n')

      const out = run('diff', file1, file2, '--json')
      const data = JSON.parse(out)
      assert.ok(Array.isArray(data))
      assert.ok(data.some(d => d.id === 'a' && d.status === 'changed'))
      assert.ok(data.some(d => d.id === 'b' && d.status === 'added'))
    })
  })
})
