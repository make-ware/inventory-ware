import { Command } from 'commander';
import { ContainerUpdateSchema, type ContainerInput } from '@project/shared';
import { CliError, EXIT, withQuietMutators } from '../errors.js';
import { printJson, printRecord, printTable, success } from '../output.js';
import { requireUserId } from '../context.js';
import { compact, parseIntOption, run } from './shared.js';

const COLUMNS: Array<[string, string]> = [
  ['id', 'ID'],
  ['containerLabel', 'LABEL'],
  ['containerNotes', 'NOTES'],
  ['created', 'CREATED'],
];

const DETAIL_KEYS = [
  'id',
  'containerLabel',
  'containerNotes',
  'ImageRef',
  'created',
  'updated',
];

const ITEM_COLUMNS: Array<[string, string]> = [
  ['id', 'ID'],
  ['itemLabel', 'LABEL'],
  ['itemType', 'TYPE'],
  ['categoryFunctional', 'FUNCTIONAL'],
];

interface ContainerFlags {
  label?: string;
  notes?: string;
  image?: string;
  json?: boolean;
}

function toInput(flags: ContainerFlags) {
  return compact({
    containerLabel: flags.label,
    containerNotes: flags.notes,
    ImageRef: flags.image,
  });
}

export function registerContainerCommands(program: Command): void {
  const container = program
    .command('container')
    .description('Manage containers');

  container
    .command('list')
    .description('List containers')
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
        const result = await withQuietMutators(() =>
          ctx.containers.getList(
            opts.page ?? 1,
            opts.perPage ?? 100,
            undefined,
            opts.sort,
            opts.expand
          )
        );

        if (opts.json) {
          printJson(result);
          return;
        }
        printTable(
          result.items as unknown as Array<Record<string, unknown>>,
          COLUMNS
        );
      });
    });

  container
    .command('search')
    .description('Search containers by label or notes')
    .argument('<query>', 'text to search for')
    .option('-e, --expand <fields>', 'relations to expand')
    .option('-s, --sort <sort>', 'sort expression')
    .option('--json', 'output raw JSON')
    .action(async (query: string, opts, command: Command) => {
      await run(command, async (ctx) => {
        requireUserId(ctx);
        const results = await withQuietMutators(() =>
          ctx.containers.search(query, opts.expand, opts.sort)
        );

        if (opts.json) {
          printJson(results);
          return;
        }
        printTable(
          results as unknown as Array<Record<string, unknown>>,
          COLUMNS
        );
      });
    });

  container
    .command('get')
    .description('Show a single container')
    .argument('<id>', 'container id')
    .option('-e, --expand <fields>', 'relations to expand')
    .option('--json', 'output raw JSON')
    .action(async (id: string, opts, command: Command) => {
      await run(command, async (ctx) => {
        requireUserId(ctx);
        const record = await withQuietMutators(() =>
          ctx.containers.getById(id, opts.expand)
        );
        if (!record)
          throw new CliError(`Container ${id} not found.`, EXIT.NOT_FOUND);

        if (opts.json) {
          printJson(record);
          return;
        }
        printRecord(record as unknown as Record<string, unknown>, DETAIL_KEYS);
      });
    });

  container
    .command('create')
    .description('Create a container')
    .requiredOption('-l, --label <label>', 'container label')
    .option('--notes <notes>', 'free-form notes')
    .option('-i, --image <id>', 'image to associate')
    .option('--json', 'output raw JSON')
    .action(async (opts: ContainerFlags, command: Command) => {
      await run(command, async (ctx) => {
        const userId = requireUserId(ctx);
        const input = {
          ...toInput(opts),
          UserRef: userId,
        } as ContainerInput;

        const record = await withQuietMutators(() =>
          ctx.containers.create(input)
        );

        if (opts.json) {
          printJson(record);
          return;
        }
        success(`Created container ${record.id}`);
        printRecord(record as unknown as Record<string, unknown>, DETAIL_KEYS);
      });
    });

  container
    .command('update')
    .description('Update a container')
    .argument('<id>', 'container id')
    .option('-l, --label <label>', 'container label')
    .option('--notes <notes>', 'free-form notes')
    .option('-i, --image <id>', 'image to associate')
    .option('--json', 'output raw JSON')
    .action(async (id: string, opts: ContainerFlags, command: Command) => {
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
        const parsed = ContainerUpdateSchema.parse(patch);
        const record = await withQuietMutators(() =>
          ctx.containers.update(id, parsed)
        );

        if (opts.json) {
          printJson(record);
          return;
        }
        success(`Updated container ${record.id}`);
        printRecord(record as unknown as Record<string, unknown>, DETAIL_KEYS);
      });
    });

  container
    .command('delete')
    .description('Delete a container')
    .argument('<id>', 'container id')
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
        const deleted = await withQuietMutators(() =>
          ctx.containers.delete(id)
        );
        if (!deleted) {
          throw new CliError(`Could not delete container ${id}.`, EXIT.GENERAL);
        }
        success(`Deleted container ${id}`);
      });
    });

  container
    .command('items')
    .description('List the items inside a container')
    .argument('<id>', 'container id')
    .option('-e, --expand <fields>', 'relations to expand')
    .option('--json', 'output raw JSON')
    .action(async (id: string, opts, command: Command) => {
      await run(command, async (ctx) => {
        requireUserId(ctx);
        const items = await withQuietMutators(() =>
          ctx.items.getByContainer(id, opts.expand)
        );

        if (opts.json) {
          printJson(items);
          return;
        }
        printTable(
          items as unknown as Array<Record<string, unknown>>,
          ITEM_COLUMNS
        );
      });
    });
}
