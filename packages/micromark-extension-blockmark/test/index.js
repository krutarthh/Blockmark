import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseBlockmarkPrefix, serializeBlockmarkPrefix } from '../index.js'

describe('parseBlockmarkPrefix', () => {
  it('parses a simple ID', () => {
    const result = parseBlockmarkPrefix('^[intro] This is text.')
    assert.ok(result)
    assert.equal(result.id, 'intro')
    assert.deepEqual(result.attributes, {})
    assert.equal(result.raw, '^[intro] ')
  })

  it('parses ID with hyphens and dots', () => {
    const result = parseBlockmarkPrefix('^[req-1.2] Content')
    assert.ok(result)
    assert.equal(result.id, 'req-1.2')
  })

  it('parses ID with underscore start', () => {
    const result = parseBlockmarkPrefix('^[_private] Content')
    assert.ok(result)
    assert.equal(result.id, '_private')
  })

  it('parses single attribute', () => {
    const result = parseBlockmarkPrefix('^[req-1 type=requirement] Content')
    assert.ok(result)
    assert.equal(result.id, 'req-1')
    assert.deepEqual(result.attributes, { type: 'requirement' })
  })

  it('parses multiple attributes', () => {
    const result = parseBlockmarkPrefix('^[req-1 type=requirement status=open] Content')
    assert.ok(result)
    assert.equal(result.id, 'req-1')
    assert.deepEqual(result.attributes, { type: 'requirement', status: 'open' })
  })

  it('parses quoted attribute values', () => {
    const result = parseBlockmarkPrefix('^[dec-1 reason="it was better"] Content')
    assert.ok(result)
    assert.equal(result.id, 'dec-1')
    assert.deepEqual(result.attributes, { reason: 'it was better' })
  })

  it('parses attribute with slashes and colons', () => {
    const result = parseBlockmarkPrefix('^[link-1 href=https://example.com/path] Content')
    assert.ok(result)
    assert.deepEqual(result.attributes, { href: 'https://example.com/path' })
  })

  it('returns null for missing closing bracket', () => {
    assert.equal(parseBlockmarkPrefix('^[not closed text'), null)
  })

  it('returns null for no space after bracket', () => {
    assert.equal(parseBlockmarkPrefix('^[id]no-space'), null)
  })

  it('returns null for empty ID', () => {
    assert.equal(parseBlockmarkPrefix('^[] content'), null)
  })

  it('returns null for ID starting with digit', () => {
    assert.equal(parseBlockmarkPrefix('^[123] content'), null)
  })

  it('returns null for plain text', () => {
    assert.equal(parseBlockmarkPrefix('Just regular text'), null)
  })

  it('returns null for empty string', () => {
    assert.equal(parseBlockmarkPrefix(''), null)
  })

  it('captures full raw prefix including attributes', () => {
    const result = parseBlockmarkPrefix('^[req-1 type=requirement status=open] Content')
    assert.ok(result)
    assert.equal(result.raw, '^[req-1 type=requirement status=open] ')
  })
})

describe('serializeBlockmarkPrefix', () => {
  it('serializes a simple ID', () => {
    assert.equal(
      serializeBlockmarkPrefix({ id: 'intro', attributes: {} }),
      '^[intro] '
    )
  })

  it('serializes with attributes', () => {
    assert.equal(
      serializeBlockmarkPrefix({ id: 'req-1', attributes: { type: 'requirement', status: 'open' } }),
      '^[req-1 type=requirement status=open] '
    )
  })

  it('quotes attribute values with spaces', () => {
    assert.equal(
      serializeBlockmarkPrefix({ id: 'dec-1', attributes: { reason: 'it was better' } }),
      '^[dec-1 reason="it was better"] '
    )
  })

  it('round-trips a parsed prefix', () => {
    const original = '^[req-1 type=requirement status=open] '
    const parsed = parseBlockmarkPrefix(original + 'content')
    assert.ok(parsed)
    assert.equal(serializeBlockmarkPrefix(parsed), original)
  })
})
