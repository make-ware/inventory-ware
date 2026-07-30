import { Command } from 'commander';
import { ItemUpdateSchema, type ItemInput } from '@project/shared';
import { CliError, EXIT, withQuietMutators } from '../errors.js';
import { printJson, printRecord, printTable, success } from '../output.js';
import { requireUserId, type Context } from '../context.js';
import { collectAttr, compact, parseIntOption, run } from './shared.js';

const COLUMNS: Array<[string, string]> = [
  ['id', 'ID'],
  ['itemLabel', 'LABEL'],
  ['itemType', 'TYPE'],
  ['categoryFunctional', 'FUNCTIONAL'],
  ['categorySpecific', 'SPECIFIC'],
  ['ContainerRef', 'CONTAINER'],
];

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

function renderList(
  ctx: Context,
  items: Array<Record<string, unknown>>,
  json: boolean
) {
  void ctx;
  if (json) {
    printJson(items);
    return;
  }
  printTable(items, COLUMNS);
}

export function registerItemCommands(program: Command): void {
  const item = program.command('item').description('Manage inventory items');

  item
    .command('list')
    .description('List items')
    .option('-c, --container <id>', 'only items in this container')
    .option('--page <n>', 'page number', (v) => parseIntOption(v, '--page'))
    .option('--per-page <n>', 'items per page', (v) =>
      parseIntOption(v, '--per-page')
    )
    .option('-s, --sort <sort>', 'sort expression', '-created')
    .option('-e, --expand <fields>', 'relations to expand')
    .option('--json', 'output raw JSON')
    .action(async (opts, command: Command) => {
      await run(command, async (ctx) => {
        requireUserId(ctx);
        const filter = opts.container
          ? `ContainerRef="${opts.container}"`
          : undefined;

        const result = await withQuietMutators(() =>
          ctx.items.getList(
            opts.page ?? 1,
            opts.perPage ?? 100,
            filter,
            opts.sort,
            opts.expand
          )
        );

        if (opts.json) {
          printJson(result);
          return;
        }
        renderList(
          ctx,
          result.items as unknown as Array<Record<string, unknown>>,
          false
        );
      });
    });

  item
    .command('search')
    .description('Full-text search across item fields')
    .argument('<query>', 'text to search for')
    .option('--functional <category>', 'filter by functional category')
    .option('--specific <category>', 'filter by specific category')
    .option('--type <type>', 'filter by item type')
    .option('-c, --container <id>', 'filter by container')
    .option('-e, --expand <fields>', 'relations to expand')
    .option('-s, --sort <sort>', 'sort expression')
    .option('--json', 'output raw JSON')
    .action(async (query: string, opts, command: Command) => {
      await run(command, async (ctx) => {
        requireUserId(ctx);
        const items = await withQuietMutators(() =>
          ctx.items.search(
            query,
            compact({
              categoryFunctional: opts.functional,
              categorySpecific: opts.specific,
              itemType: opts.type,
              container: opts.container,
            }),
            opts.expand,
            opts.sort
          )
        );
        renderList(
          ctx,
          items as unknown as Array<Record<string, unknown>>,
          Boolean(opts.json)
        );
      });
    });

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
    .requiredOption('--type <type>', 'item type')
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
    .option('--type <type>', 'item type')
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
