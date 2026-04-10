import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import remarkBlockmark from '../index.js'

function process(md) {
  return unified()
    .use(remarkParse)
    .use(remarkBlockmark)
    .use(remarkStringify)
    .processSync(md)
}

function parseOnly(md) {
  const processor = unified().use(remarkParse).use(remarkBlockmark)
  const tree = processor.parse(md)
  processor.runSync(tree)
  return tree
}

describe('remarkBlockmark', () => {
  it('extracts blockmark data during parsing', () => {
    const tree = parseOnly('^[intro] Hello world.')
    const para = tree.children[0]
    assert.equal(para.data?.blockmark?.id, 'intro')
    assert.equal(para.children[0].value, 'Hello world.')
  })

  it('extracts from headings', () => {
    const tree = parseOnly('# ^[title] My Document')
    const heading = tree.children[0]
    assert.equal(heading.data?.blockmark?.id, 'title')
    assert.equal(heading.children[0].value, 'My Document')
  })

  it('extracts from list items', () => {
    const tree = parseOnly('- ^[a] Item one\n- ^[b] Item two')
    const list = tree.children[0]
    assert.equal(list.children[0].data?.blockmark?.id, 'a')
    assert.equal(list.children[1].data?.blockmark?.id, 'b')
  })

  it('extracts from blockquotes', () => {
    const tree = parseOnly('> ^[q1] A wise saying.')
    assert.equal(tree.children[0].data?.blockmark?.id, 'q1')
  })

  it('handles mixed document with IDs and plain blocks', () => {
    const md = `^[intro] Introduction paragraph.

## ^[overview] Overview

Regular paragraph without ID.

- ^[task-1] First task
- Regular item without ID

> ^[note] A note.`

    const tree = parseOnly(md)
    assert.equal(tree.children[0].data?.blockmark?.id, 'intro')
    assert.equal(tree.children[1].data?.blockmark?.id, 'overview')
    assert.equal(tree.children[2].data?.blockmark, undefined)

    const list = tree.children[3]
    assert.equal(list.children[0].data?.blockmark?.id, 'task-1')
    assert.equal(list.children[1].data?.blockmark, undefined)

    assert.equal(tree.children[4].data?.blockmark?.id, 'note')
  })

  it('handles attributes', () => {
    const tree = parseOnly('^[req-1 type=requirement status=open] Must auth.')
    const para = tree.children[0]
    assert.deepEqual(para.data?.blockmark?.attributes, {
      type: 'requirement',
      status: 'open'
    })
  })
})
