#!/usr/bin/env node

import { Command } from 'commander'
import { get } from '../lib/commands/get.js'
import { patch } from '../lib/commands/patch.js'
import { query } from '../lib/commands/query.js'
import { diff } from '../lib/commands/diff.js'
import { list } from '../lib/commands/list.js'

const program = new Command()

program
  .name('blockmark')
  .description('Stable block IDs for agent-era markdown')
  .version('0.1.0')

program
  .command('get')
  .description('Get the content of a block by ID')
  .argument('<file>', 'markdown file')
  .argument('<id>', 'block ID')
  .action(get)

program
  .command('patch')
  .description('Replace the content of a block by ID')
  .argument('<file>', 'markdown file')
  .argument('<id>', 'block ID')
  .requiredOption('-c, --content <text>', 'new content for the block')
  .option('-o, --output <file>', 'write to a different file instead of modifying in place')
  .action(patch)

program
  .command('query')
  .description('Find blocks matching attribute filters')
  .argument('<file>', 'markdown file')
  .option('-t, --type <type>', 'filter by type attribute')
  .option('-s, --status <status>', 'filter by status attribute')
  .option('--json', 'output as JSON')
  .action(query)

program
  .command('diff')
  .description('Diff two documents by block ID')
  .argument('<old>', 'old markdown file')
  .argument('<new>', 'new markdown file')
  .option('--json', 'output as JSON')
  .action(diff)

program
  .command('list')
  .description('List all blocks with IDs in a document')
  .argument('<file>', 'markdown file')
  .option('--json', 'output as JSON')
  .action(list)

program.parse()
