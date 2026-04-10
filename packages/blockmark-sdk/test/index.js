import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parse, getBlock, patchBlock, queryBlocks, listBlocks, diffBlocks } from '../index.js'

const REALISTIC_DOC = `# Product Requirements Document

^[req-1 type=requirement status=open] Users must authenticate via OAuth 2.0.

^[req-2 type=requirement status=done] The dashboard must load in under 2 seconds.

^[req-3 type=requirement status=open depends=req-1] Admin users can manage
other users' permissions.

## ^[arch] System Architecture

The system uses a microservices pattern with the following services:

- ^[svc-1 type=service] Auth service handles authentication
- ^[svc-2 type=service] Dashboard service renders the UI
- ^[svc-3 type=service] Admin service manages permissions

## Tasks

- ^[task-1 type=task status=open] Implement login flow
- ^[task-2 type=task status=done] Write auth tests
- ^[task-3 type=task status=open depends=task-1] Implement token refresh

> ^[note-1] Important: OAuth tokens expire after 1 hour.
> Refresh tokens are valid for 30 days.

^[dec-1 type=decision supersedes=dec-0] We chose PostgreSQL over MySQL because
of superior JSONB support and full-text search capabilities.
`

describe('parse', () => {
  it('returns a tree with blockmark data attached', () => {
    const tree = parse(REALISTIC_DOC)
    assert.equal(tree.type, 'root')
    assert.ok(tree.children.length > 0)
  })
})

describe('getBlock', () => {
  it('returns paragraph content by ID', () => {
    const content = getBlock(REALISTIC_DOC, 'req-1')
    assert.equal(content, 'Users must authenticate via OAuth 2.0.')
  })

  it('returns multi-line paragraph content', () => {
    const content = getBlock(REALISTIC_DOC, 'req-3')
    assert.ok(content)
    assert.ok(content.includes('Admin users can manage'))
    assert.ok(content.includes("other users' permissions."))
  })

  it('returns heading content without markers', () => {
    const content = getBlock(REALISTIC_DOC, 'arch')
    assert.equal(content, 'System Architecture')
  })

  it('returns list item content', () => {
    const content = getBlock(REALISTIC_DOC, 'task-1')
    assert.ok(content)
    assert.ok(content.includes('Implement login flow'))
  })

  it('returns blockquote content', () => {
    const content = getBlock(REALISTIC_DOC, 'note-1')
    assert.ok(content)
    assert.ok(content.includes('Important: OAuth tokens expire'))
  })

  it('returns null for non-existent ID', () => {
    assert.equal(getBlock(REALISTIC_DOC, 'does-not-exist'), null)
  })

  it('returns null for empty document', () => {
    assert.equal(getBlock('', 'any'), null)
  })
})

describe('patchBlock', () => {
  it('patches paragraph content', () => {
    const result = patchBlock(REALISTIC_DOC, 'req-1', 'Users must authenticate via SSO.')
    assert.ok(result.includes('^[req-1 type=requirement status=open] Users must authenticate via SSO.'))
    assert.ok(result.includes('^[req-2 type=requirement status=done]'))
  })

  it('preserves all other blocks byte-identical', () => {
    const result = patchBlock(REALISTIC_DOC, 'req-1', 'New content.')
    const req2Content = getBlock(result, 'req-2')
    assert.equal(req2Content, 'The dashboard must load in under 2 seconds.')

    const archContent = getBlock(result, 'arch')
    assert.equal(archContent, 'System Architecture')
  })

  it('patches heading content', () => {
    const result = patchBlock(REALISTIC_DOC, 'arch', 'New Architecture')
    assert.ok(result.includes('## ^[arch] New Architecture'))
  })

  it('throws for non-existent ID', () => {
    assert.throws(
      () => patchBlock(REALISTIC_DOC, 'nope', 'content'),
      /Block "nope" not found/
    )
  })

  it('patches multi-line block to single line', () => {
    const result = patchBlock(REALISTIC_DOC, 'dec-1', 'We chose MongoDB.')
    assert.ok(result.includes('^[dec-1 type=decision supersedes=dec-0] We chose MongoDB.'))
    assert.ok(!result.includes('superior JSONB support'))
  })

  it('result is parseable with correct IDs', () => {
    const result = patchBlock(REALISTIC_DOC, 'req-1', 'New auth requirement.')
    const blocks = listBlocks(result)
    const ids = blocks.map(b => b.id)
    assert.ok(ids.includes('req-1'))
    assert.ok(ids.includes('req-2'))
    assert.ok(ids.includes('arch'))
  })
})

describe('queryBlocks', () => {
  it('returns all blocks when no filter', () => {
    const blocks = queryBlocks(REALISTIC_DOC)
    assert.ok(blocks.length >= 10)
  })

  it('filters by type', () => {
    const reqs = queryBlocks(REALISTIC_DOC, { type: 'requirement' })
    assert.equal(reqs.length, 3)
    for (const r of reqs) {
      assert.equal(r.attributes.type, 'requirement')
    }
  })

  it('filters by status', () => {
    const open = queryBlocks(REALISTIC_DOC, { status: 'open' })
    assert.ok(open.length >= 2)
    for (const o of open) {
      assert.equal(o.attributes.status, 'open')
    }
  })

  it('filters by multiple attributes', () => {
    const openReqs = queryBlocks(REALISTIC_DOC, { type: 'requirement', status: 'open' })
    assert.equal(openReqs.length, 2)
  })

  it('returns empty for no matches', () => {
    const result = queryBlocks(REALISTIC_DOC, { type: 'nonexistent' })
    assert.equal(result.length, 0)
  })

  it('includes node type and line number', () => {
    const reqs = queryBlocks(REALISTIC_DOC, { type: 'requirement' })
    for (const r of reqs) {
      assert.ok(r.nodeType)
      assert.ok(typeof r.line === 'number')
    }
  })
})

describe('listBlocks', () => {
  it('lists all blocks with previews', () => {
    const blocks = listBlocks(REALISTIC_DOC)
    assert.ok(blocks.length >= 10)

    for (const block of blocks) {
      assert.ok(block.id)
      assert.ok(block.nodeType)
      assert.ok(typeof block.preview === 'string')
    }
  })

  it('includes correct attributes', () => {
    const blocks = listBlocks(REALISTIC_DOC)
    const req1 = blocks.find(b => b.id === 'req-1')
    assert.ok(req1)
    assert.equal(req1.attributes.type, 'requirement')
    assert.equal(req1.attributes.status, 'open')
  })

  it('previews do not contain blockmark prefixes', () => {
    const blocks = listBlocks(REALISTIC_DOC)
    for (const block of blocks) {
      assert.ok(!block.preview.includes('^['), `Preview for ${block.id} contains prefix: "${block.preview}"`)
    }
  })

  it('returns empty array for document with no IDs', () => {
    const blocks = listBlocks('Just a normal document.\n\nNo IDs here.')
    assert.equal(blocks.length, 0)
  })
})

describe('diffBlocks', () => {
  it('detects changed blocks', () => {
    const modified = patchBlock(REALISTIC_DOC, 'req-1', 'Changed content.')
    const diffs = diffBlocks(REALISTIC_DOC, modified)

    const req1Diff = diffs.find(d => d.id === 'req-1')
    assert.ok(req1Diff)
    assert.equal(req1Diff.status, 'changed')
  })

  it('detects unchanged blocks', () => {
    const modified = patchBlock(REALISTIC_DOC, 'req-1', 'Changed content.')
    const diffs = diffBlocks(REALISTIC_DOC, modified)

    const archDiff = diffs.find(d => d.id === 'arch')
    assert.ok(archDiff)
    assert.equal(archDiff.status, 'unchanged')
  })

  it('detects added blocks', () => {
    const newDoc = REALISTIC_DOC + '\n^[new-block] A brand new block.\n'
    const diffs = diffBlocks(REALISTIC_DOC, newDoc)

    const added = diffs.find(d => d.id === 'new-block')
    assert.ok(added)
    assert.equal(added.status, 'added')
  })

  it('detects removed blocks', () => {
    const reduced = '^[req-1] Only one block here.'
    const diffs = diffBlocks(REALISTIC_DOC, reduced)

    const remaining = diffs.filter(d => d.status === 'removed')
    assert.ok(remaining.length > 0)
  })

  it('returns all IDs from both documents', () => {
    const doc1 = '^[a] Block A.\n\n^[b] Block B.'
    const doc2 = '^[b] Block B modified.\n\n^[c] Block C.'
    const diffs = diffBlocks(doc1, doc2)

    const ids = diffs.map(d => d.id)
    assert.ok(ids.includes('a'))
    assert.ok(ids.includes('b'))
    assert.ok(ids.includes('c'))
  })
})
