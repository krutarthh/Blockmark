import { getBlock, patchBlock, queryBlocks, listBlocks } from 'blockmark-sdk'

/**
 * Blockmark-arm tool definitions (OpenAI function-calling schema).
 */
export const BLOCKMARK_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_blocks',
      description: 'List all addressable blocks in the document with their IDs, attributes, node types, and a short content preview.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_block',
      description: 'Get the full text content of a specific block by its ID. Returns the content after the blockmark prefix.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'The blockmark ID of the block to read' } },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'patch_block',
      description: 'Replace the content of a block by its ID. Only the specified block changes; everything else stays byte-identical. Provide the new text content (without the ^[id] prefix).',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The blockmark ID of the block to edit' },
          content: { type: 'string', description: 'The new text content for the block' }
        },
        required: ['id', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_blocks',
      description: 'Find blocks matching attribute filters. Returns blocks whose attributes match all provided key-value pairs.',
      parameters: {
        type: 'object',
        properties: {
          filter: {
            type: 'object',
            description: 'Key-value pairs to filter on (e.g. {"type":"requirement","status":"open"})',
            additionalProperties: { type: 'string' }
          }
        },
        required: ['filter']
      }
    }
  }
]

/**
 * Baseline-arm tool definitions — full document read/write.
 */
export const BASELINE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_document',
      description: 'Read the entire markdown document.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_document',
      description: 'Replace the entire markdown document with new content.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The complete new markdown document content' }
        },
        required: ['content']
      }
    }
  }
]

/**
 * Create a tool executor for the blockmark arm.
 * Keeps mutable `source` state in a closure.
 *
 * @param {string} initialSource
 * @returns {{ execute: (name: string, args: Record<string, any>) => string, getSource: () => string }}
 */
export function createBlockmarkExecutor(initialSource) {
  let source = initialSource

  return {
    execute(name, args) {
      switch (name) {
        case 'list_blocks':
          return JSON.stringify(listBlocks(source))
        case 'get_block':
          return getBlock(source, args.id) ?? `Error: block "${args.id}" not found`
        case 'patch_block':
          try {
            source = patchBlock(source, args.id, args.content)
            return `Patched block "${args.id}" successfully.`
          } catch (e) {
            return `Error: ${e.message}`
          }
        case 'query_blocks': {
          const results = queryBlocks(source, args.filter)
          return JSON.stringify(results.map(b => ({ id: b.id, attributes: b.attributes, nodeType: b.nodeType })))
        }
        default:
          return `Error: unknown tool "${name}"`
      }
    },
    getSource() { return source }
  }
}

/**
 * Create a tool executor for the baseline arm.
 *
 * @param {string} initialSource
 * @returns {{ execute: (name: string, args: Record<string, any>) => string, getSource: () => string }}
 */
export function createBaselineExecutor(initialSource) {
  let source = initialSource

  return {
    execute(name, args) {
      switch (name) {
        case 'read_document':
          return source
        case 'write_document':
          source = args.content
          return 'Document updated successfully.'
        default:
          return `Error: unknown tool "${name}"`
      }
    },
    getSource() { return source }
  }
}
