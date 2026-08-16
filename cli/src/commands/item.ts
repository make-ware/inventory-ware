import { Command } from 'commander';
import { ItemUpdateSchema, type ItemInput } from '@project/shared';
import { CliError, EXIT, withQuietMutators } from '../errors.js';
import { printJson, printRecord, success } from '../output.js';
import { requireUserId, type Context } from '../context.js';
import {
  addQueryOptions,
  parseQueryOptions,
  type RawQueryOptions,
} from '../query/options.js';
import { executeQuery, renderQuery } from '../query/run.js';
import { ITEM_SPEC } from '../query/spec.js';
import { collectAttr, compact, run } from './shared.js';

const DETAIL_KEYS = [
  'id',
  'itemLabel',
  'itemName',
  'itemNotes',
  'categoryFunctional',
  'categorySpecific',
  'itemType',
  'itemManufacturer',
  'itemAttributes',
  'ContainerRef',
  'ImageRef',
  'created',
  'updated',
];

interface ItemFlags {
  label?: string;
  name?: string;
  notes?: string;
  functional?: string;
  specific?: string;
  type?: string;
  manufacturer?: string;
  container?: string;
  image?: string;
  attr?: Array<{ name: string; value: string }>;
  json?: boolean;
}

function toInput(flags: ItemFlags) {
  return compact({
    itemLabel: flags.label,
    itemName: flags.name,
    itemNotes: flags.notes,
    categoryFunctional: flags.functional,
    categorySpecific: flags.specific,
    itemType: flags.type,
    itemManufacturer: flags.manufacturer,
    ContainerRef: flags.container,
    ImageRef: flags.image,
    itemAttributes: flags.attr,
  });
}

/**
 * The body behind both `item list` and its `item search` alias.
 *
 * Filters are handed to `ItemMutator.search`, which builds the PocketBase
 * filter expression with proper escaping - the CLI never interpolates one.
 */
async function listItems(
  opts: RawQueryOptions,
  command: Command
): Promise<void> {
  // Validate flags before opening a context: a bad --sort should report the
  // bad flag, not "not logged in".
  const query = parseQueryOptions(ITEM_SPEC, opts, command);

  await run(command, async (ctx: Context) => {
    requireUserId(ctx);

    const result = await executeQuery(query, (page) =>
      ctx.items.search(query.search, { ...page, filters: query.filters })
    );

    renderQuery(query, result);
  });
}

export function registerItemCommands(program: Command): void {
  const item = program.command('item').description('Manage inventory items');

  const list = item.command('list').description('List items');
  addQueryOptions(list, ITEM_SPEC);
  list.action(async (opts: RawQueryOptions, command: Command) => {
    await listItems(opts, command);
  });

  // Kept as an alias so existing scripts keep working; `list --search` is the
  // canonical form and both run the same code.
  const search = item
    .command('search')
    .description('Alias for `item list --search <query>`')
    .argument('<query>', 'text to search for');
  addQueryOptions(search, ITEM_SPEC, { search: false });
  search.action(
    async (query: string, opts: RawQueryOptions, command: Command) => {
      await listItems({ ...opts, search: query }, command);
    }
  );

  item
    .command('get')
    .description('Show a single item')
    .argument('<id>', 'item id')
    .option('-e, --expand <fields>', 'relations to expand')
    .option('--json', 'output raw JSON')
    .action(async (id: string, opts, command: Command) => {
      await run(command, async (ctx) => {
        requireUserId(ctx);
        const record = await withQuietMutators(() =>
          ctx.items.getById(id, opts.expand)
        );
        if (!record)
          throw new CliError(`Item ${id} not found.`, EXIT.NOT_FOUND);

        if (opts.json) {
          printJson(record);
          return;
        }
        printRecord(record as unknown as Record<string, unknown>, DETAIL_KEYS);
      });
    });

  item
    .command('create')
    .description('Create an item')
    .requiredOption('-l, --label <label>', 'item label')
    .requiredOption('--functional <category>', 'functional category')
    .requiredOption('--specific <category>', 'specific category')
    .requiredOption('-t, --type <type>', 'item type')
    .option('-n, --name <name>', 'item name')
    .option('--notes <notes>', 'free-form notes')
    .option('--manufacturer <name>', 'manufacturer')
    .option('-c, --container <id>', 'container to place the item in')
    .option('-i, --image <id>', 'image to associate')
    .option(
      '--attr <name=value>',
      'custom attribute (repeatable)',
      collectAttr,
      [] as Array<{ name: string; value: string }>
    )
    .option('--json', 'output raw JSON')
    .action(async (opts: ItemFlags, command: Command) => {
      await run(command, async (ctx) => {
        const userId = requireUserId(ctx);
        const input = {
          ...toInput(opts),
          UserRef: userId,
        } as ItemInput;

        const record = await withQuietMutators(() => ctx.items.create(input));

        if (opts.json) {
          printJson(record);
          return;
        }
        success(`Created item ${record.id}`);
        // Categories are slugified by the schema, so echo the stored values.
        printRecord(record as unknown as Record<string, unknown>, DETAIL_KEYS);
      });
    });

  item
    .command('update')
    .description('Update an item')
    .argument('<id>', 'item id')
    .option('-l, --label <label>', 'item label')
    .option('--functional <category>', 'functional category')
    .option('--specific <category>', 'specific category')
    .option('-t, --type <type>', 'item type')
    .option('-n, --name <name>', 'item name')
    .option('--notes <notes>', 'free-form notes')
    .option('--manufacturer <name>', 'manufacturer')
    .option('-c, --container <id>', 'container to place the item in')
    .option('-i, --image <id>', 'image to associate')
    .option(
      '--attr <name=value>',
      'custom attribute (repeatable, replaces all)',
      collectAttr
    )
    .option('--json', 'output raw JSON')
    .action(async (id: string, opts: ItemFlags, command: Command) => {
      await run(command, async (ctx) => {
        requireUserId(ctx);
        const patch = toInput(opts);
        if (Object.keys(patch).length === 0) {
          throw new CliError(
            'Nothing to update.',
            EXIT.USAGE,
            'Pass at least one field flag.'
          );
        }

        // BaseMutator.update() skips validateInput, so validate here.
        const parsed = ItemUpdateSchema.parse(patch);
        const record = await withQuietMutators(() =>
          ctx.items.update(id, parsed)
        );

        if (opts.json) {
          printJson(record);
          return;
        }
        success(`Updated item ${record.id}`);
        printRecord(record as unknown as Record<string, unknown>, DETAIL_KEYS);
      });
    });

  item
    .command('delete')
    .description('Delete an item')
    .argument('<id>', 'item id')
    .option('-y, --yes', 'skip confirmation')
    .action(async (id: string, opts, command: Command) => {
      await run(command, async (ctx) => {
        requireUserId(ctx);
        if (!opts.yes) {
          throw new CliError(
            `Refusing to delete ${id} without confirmation.`,
            EXIT.USAGE,
            'Re-run with --yes to confirm.'
          );
        }
        // BaseMutator.delete() swallows errors and returns false.
        const deleted = await withQuietMutators(() => ctx.items.delete(id));
        if (!deleted) {
          throw new CliError(`Could not delete item ${id}.`, EXIT.GENERAL);
        }
        success(`Deleted item ${id}`);
      });
    });

  item
    .command('categories')
    .description('List distinct categories in use')
    .option('--json', 'output raw JSON')
    .action(async (opts, command: Command) => {
      await run(command, async (ctx) => {
        requireUserId(ctx);
        const categories = await withQuietMutators(() =>
          ctx.items.getDistinctCategories()
        );

        if (opts.json) {
          printJson(categories);
          return;
        }
        printRecord(categories as unknown as Record<string, unknown>);
      });
    });
}
