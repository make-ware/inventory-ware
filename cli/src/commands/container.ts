import { Command } from 'commander';
import { ContainerUpdateSchema, type ContainerInput } from '@project/shared';
import { CliError, EXIT, withQuietMutators } from '../errors.js';
import { printJson, printRecord, success } from '../output.js';
import { requireUserId, type Context } from '../context.js';
import {
  addQueryOptions,
  parseQueryOptions,
  type RawQueryOptions,
} from '../query/options.js';
import { executeQuery, renderQuery } from '../query/run.js';
import { CONTAINER_SPEC, ITEM_SPEC } from '../query/spec.js';
import { compact, run } from './shared.js';

const DETAIL_KEYS = [
  'id',
  'containerLabel',
  'containerNotes',
  'ImageRef',
  'created',
  'updated',
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

/** The body behind both `container list` and its `container search` alias. */
async function listContainers(
  opts: RawQueryOptions,
  command: Command
): Promise<void> {
  // Validate flags before opening a context: a bad --sort should report the
  // bad flag, not "not logged in".
  const query = parseQueryOptions(CONTAINER_SPEC, opts, command);

  await run(command, async (ctx: Context) => {
    requireUserId(ctx);

    const result = await executeQuery(query, (page) =>
      ctx.containers.search(query.search, { ...page, filters: query.filters })
    );

    renderQuery(query, result);
  });
}

export function registerContainerCommands(program: Command): void {
  const container = program
    .command('container')
    .description('Manage containers');

  const list = container.command('list').description('List containers');
  addQueryOptions(list, CONTAINER_SPEC);
  list.action(async (opts: RawQueryOptions, command: Command) => {
    await listContainers(opts, command);
  });

  // Kept as an alias so existing scripts keep working.
  const search = container
    .command('search')
    .description('Alias for `container list --search <query>`')
    .argument('<query>', 'text to search for');
  addQueryOptions(search, CONTAINER_SPEC, { search: false });
  search.action(
    async (query: string, opts: RawQueryOptions, command: Command) => {
      await listContainers({ ...opts, search: query }, command);
    }
  );

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

  // Items inside a container: the same flag set as `item list`, minus
  // --container, which the positional <id> already supplies.
  const items = container
    .command('items')
    .description('List the items inside a container')
    .argument('<id>', 'container id');
  addQueryOptions(items, ITEM_SPEC, { omitFilters: ['container'] });
  items.action(async (id: string, opts: RawQueryOptions, command: Command) => {
    const query = parseQueryOptions(ITEM_SPEC, opts, command);

    await run(command, async (ctx) => {
      requireUserId(ctx);

      const result = await executeQuery(query, (page) =>
        ctx.items.getByContainer(id, { ...page, filters: query.filters })
      );

      renderQuery(query, result);
    });
  });
}
