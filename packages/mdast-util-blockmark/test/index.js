import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { blockmarkFromMarkdown, blockmarkToMarkdown } from '../index.js'

function parse(md) {
  const tree = unified().use(remarkParse).parse(md)
  blockmarkFromMarkdown(tree)
  return tree
}

describe('blockmarkFromMarkdown', () => {
  it('extracts ID from paragraph', () => {
    const tree = parse('^[intro] Hello world.')
    const para = tree.children[0]
    assert.equal(para.type, 'paragraph')
    assert.equal(para.data?.blockmark?.id, 'intro')
    assert.deepEqual(para.data?.blockmark?.attributes, {})
    assert.equal(para.children[0].value, 'Hello world.')
  })

  it('extracts ID with attributes from paragraph', () => {
    const tree = parse('^[req-1 type=requirement status=open] Users must authenticate.')
    const para = tree.children[0]
    assert.equal(para.data?.blockmark?.id, 'req-1')
    assert.deepEqual(para.data?.blockmark?.attributes, { type: 'requirement', status: 'open' })
    assert.equal(para.children[0].value, 'Users must authenticate.')
  })

  it('extracts ID from heading', () => {
    const tree = parse('## ^[arch] System Architecture')
    const heading = tree.children[0]
    assert.equal(heading.type, 'heading')
    assert.equal(heading.data?.blockmark?.id, 'arch')
    assert.equal(heading.children[0].value, 'System Architecture')
  })

  it('extracts ID from list item', () => {
    const tree = parse('- ^[task-1] Implement login flow\n- ^[task-2] Write tests')
    const list = tree.children[0]
    assert.equal(list.type, 'list')

    const item1 = list.children[0]
    assert.equal(item1.data?.blockmark?.id, 'task-1')
    const p1 = item1.children[0]
    assert.equal(p1.children[0].value, 'Implement login flow')

    const item2 = list.children[1]
    assert.equal(item2.data?.blockmark?.id, 'task-2')
  })

  it('extracts ID from blockquote', () => {
    const tree = parse('> ^[note-1] Important caveat.')
    const bq = tree.children[0]
    assert.equal(bq.type, 'blockquote')
    assert.equal(bq.data?.blockmark?.id, 'note-1')
    const para = bq.children[0]
    assert.equal(para.children[0].value, 'Important caveat.')
  })

  it('does not extract from plain paragraphs', () => {
    const tree = parse('Just a normal paragraph.')
    const para = tree.children[0]
    assert.equal(para.data?.blockmark, undefined)
  })

  it('does not extract from malformed prefix', () => {
    const tree = parse('^[not closed this is text.')
    const para = tree.children[0]
    assert.equal(para.data?.blockmark, undefined)
  })

  it('handles consecutive blocks', () => {
    const tree = parse('^[a] First.\n\n^[b] Second.\n\n^[c] Third.')
    assert.equal(tree.children.length, 3)
    assert.equal(tree.children[0].data?.blockmark?.id, 'a')
    assert.equal(tree.children[1].data?.blockmark?.id, 'b')
    assert.equal(tree.children[2].data?.blockmark?.id, 'c')
  })

  it('stores raw prefix string', () => {
    const tree = parse('^[req-1 type=requirement] Content.')
    const para = tree.children[0]
    assert.equal(para.data?.blockmark?.raw, '^[req-1 type=requirement] ')
  })
})

describe('blockmarkToMarkdown', () => {
  it('restores prefix in paragraph', () => {
    const tree = parse('^[intro] Hello world.')
    blockmarkToMarkdown(tree)
    const para = tree.children[0]
    assert.equal(para.children[0].value, '^[intro] Hello world.')
  })

  it('restores prefix in heading', () => {
    const tree = parse('## ^[arch] System Architecture')
    blockmarkToMarkdown(tree)
    const heading = tree.children[0]
    assert.equal(heading.children[0].value, '^[arch] System Architecture')
  })

  it('restores prefix in list item', () => {
    const tree = parse('- ^[task-1] Implement login')
    blockmarkToMarkdown(tree)
    const list = tree.children[0]
    const item = list.children[0]
    const para = item.children[0]
    assert.equal(para.children[0].value, '^[task-1] Implement login')
  })

  it('restores prefix in blockquote', () => {
    const tree = parse('> ^[note-1] Important.')
    blockmarkToMarkdown(tree)
    const bq = tree.children[0]
    const para = bq.children[0]
    assert.equal(para.children[0].value, '^[note-1] Important.')
  })

  it('does not modify nodes without blockmark data', () => {
    const tree = parse('Normal paragraph.')
    blockmarkToMarkdown(tree)
    assert.equal(tree.children[0].children[0].value, 'Normal paragraph.')
  })
})
