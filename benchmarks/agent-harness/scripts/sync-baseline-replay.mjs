#!/usr/bin/env node
/**
 * Regenerate *.baseline.jsonl from ../agent-edit-accuracy/fixture.md using patchBlock.
 * Run after changing the fixture so replay mode still applies the correct full-document writes.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { patchBlock } from 'blockmark-sdk'

const root = dirname(fileURLToPath(import.meta.url))
const fixturePath = join(root, '../../agent-edit-accuracy/fixture.md')
const recordingsDir = join(root, '../recordings')

const doc = readFileSync(fixturePath, 'utf8')

const edits = {
  'edit-req-1': {
    id: 'req-1',
    content:
      'The system shall support\nsingle sign-on (SSO) via SAML 2.0 and OpenID Connect (OIDC-compliant) for enterprise customers.',
    final:
      "I've updated req-1 to mention OIDC-compliant OpenID Connect support, with SAML 2.0 preserved."
  },
  'update-perf-threshold': {
    id: 'req-8',
    content:
      'API response times shall\nnot exceed 150ms at the 95th percentile under normal load conditions\n(defined as 5000 concurrent users).',
    final: 'Updated req-8: the API response time threshold is now 150ms instead of 200ms.'
  },
  'add-decision-context': {
    id: 'dec-1',
    content:
      'We migrated from MySQL 8 to PostgreSQL 16 as the primary database for\nits mature JSONB support, full-text search, and strong transactional guarantees.',
    final: 'Updated dec-1 to mention the migration from MySQL 8 to PostgreSQL 16.'
  }
}

const multiEdits = {
  'multi-block-status-update': {
    replacements: [
      [
        'Custom roles shall be configurable per organization.',
        'Custom roles shall be configurable per organization and this applies to all enterprise tenants.'
      ],
      [
        'shall occur automatically every 90 days.',
        'shall occur automatically every 90 days; this applies to all enterprise tenants.'
      ]
    ],
    final: 'Updated req-2 and req-6 to include enterprise-tenant applicability.'
  }
}

function writeBaseline(name, patchedDoc, finalMsg) {
  const lines = [
    JSON.stringify({
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'read_document', arguments: '{}' }
        }
      ]
    }),
    JSON.stringify({
      role: 'tool',
      tool_call_id: 'call_1',
      name: 'read_document',
      content: '<full document>'
    }),
    JSON.stringify({
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call_2',
          type: 'function',
          function: {
            name: 'write_document',
            arguments: JSON.stringify({ content: patchedDoc })
          }
        }
      ]
    }),
    JSON.stringify({
      role: 'tool',
      tool_call_id: 'call_2',
      name: 'write_document',
      content: 'Document updated successfully.'
    }),
    JSON.stringify({
      role: 'assistant',
      content: finalMsg,
      tool_calls: null
    })
  ]
  writeFileSync(join(recordingsDir, `${name}.baseline.jsonl`), lines.join('\n') + '\n')
}

for (const [name, { id, content, final: finalMsg }] of Object.entries(edits)) {
  writeBaseline(name, patchBlock(doc, id, content), finalMsg)
}

for (const [name, data] of Object.entries(multiEdits)) {
  let patched = doc
  for (const [from, to] of data.replacements) {
    patched = patched.replace(from, to)
  }
  writeBaseline(name, patched, data.final)
}

function writeReadOnlyBaseline(name, finalMsg) {
  const lines = [
    JSON.stringify({
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'read_document', arguments: '{}' }
        }
      ]
    }),
    JSON.stringify({
      role: 'tool',
      tool_call_id: 'call_1',
      name: 'read_document',
      content: '<full document>'
    }),
    JSON.stringify({
      role: 'assistant',
      content: finalMsg,
      tool_calls: null
    })
  ]
  writeFileSync(join(recordingsDir, `${name}.baseline.jsonl`), lines.join('\n') + '\n')
}

writeReadOnlyBaseline('unknown-id-noop', 'I cannot find block req-404 in the document, so no changes were made.')
writeReadOnlyBaseline('read-only-summary', 'req-1 requires enterprise SSO via SAML 2.0 and OpenID Connect. req-8 sets API response times to 200ms at the 95th percentile under normal load.')

console.log('Synced baseline replay files from fixture:', [...Object.keys(edits), ...Object.keys(multiEdits), 'unknown-id-noop', 'read-only-summary'].join(', '))
