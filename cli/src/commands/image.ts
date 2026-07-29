import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { Command } from 'commander';
import { CliError, EXIT, withQuietMutators } from '../errors.js';
import { printJson, printRecord, printTable, success } from '../output.js';
import { requireUserId } from '../context.js';
import { run } from './shared.js';

const COLUMNS: Array<[string, string]> = [
  ['id', 'ID'],
  ['file', 'FILE'],
  ['imageType', 'TYPE'],
  ['analysisStatus', 'STATUS'],
  ['created', 'CREATED'],
];

const IMAGE_TYPES = ['item', 'container', 'unprocessed'] as const;
const STATUSES = ['pending', 'processing', 'completed', 'failed'] as const;

type ImageType = (typeof IMAGE_TYPES)[number];
type AnalysisStatus = (typeof STATUSES)[number];

/**
 * PocketBase's file field enforces a mimeType allowlist, so an
 * `application/octet-stream` fallback would be rejected with an opaque 400.
 */
const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
};

async function fileFromPath(path: string): Promise<File> {
  const ext = extname(path).toLowerCase();
  const type = MIME_BY_EXT[ext];
  if (!type) {
    throw new CliError(
      `Unsupported image type "${ext || path}".`,
      EXIT.USAGE,
      `Supported extensions: ${Object.keys(MIME_BY_EXT).join(', ')}`
    );
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(path);
  } catch (error) {
    throw new CliError(
      `Could not read ${path}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      EXIT.USAGE
    );
  }

  return new File([new Uint8Array(buffer)], basename(path), { type });
}

function assertOneOf<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  flag: string
): T | undefined {
  if (value === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(value)) {
    throw new CliError(
      `Invalid ${flag} "${value}".`,
      EXIT.USAGE,
      `Expected one of: ${allowed.join(', ')}`
    );
  }
  return value as T;
}

export function registerImageCommands(program: Command): void {
  const image = program.command('image').description('Manage images');

  image
    .command('upload')
    .description('Upload one or more image files')
    .argument('<file...>', 'paths to image files')
    .option(
      '-t, --type <type>',
      `image type (${IMAGE_TYPES.join('|')})`,
      'unprocessed'
    )
    .option('--analyze', 'run AI analysis after upload (requires the webapp)')
    .option('--json', 'output raw JSON')
    .action(async (files: string[], opts, command: Command) => {
      await run(command, async (ctx) => {
        const userId = requireUserId(ctx);
        const imageType =
          assertOneOf<ImageType>(opts.type, IMAGE_TYPES, '--type') ??
          'unprocessed';

        const results: unknown[] = [];
        for (const path of files) {
          const file = await fileFromPath(path);
          const record = await withQuietMutators(() =>
            ctx.images.uploadImage(file, userId, imageType)
          );

          if (!opts.json) success(`Uploaded ${path} as ${record.id}`);

          if (opts.analyze) {
            const analysis = await ctx.api.analyzeImage(record.id);
            if (!opts.json) {
              const count = Array.isArray(analysis.items)
                ? analysis.items.length
                : 0;
              success(`Analyzed ${record.id} (${count} item(s) detected)`);
            }
            results.push({ image: record, analysis });
          } else {
            results.push({ image: record });
          }
        }

        if (opts.json) printJson(results);
      });
    });

  image
    .command('analyze')
    .description('Run AI analysis on an already-uploaded image')
    .argument('<id>', 'image id')
    .option('--json', 'output raw JSON')
    .action(async (id: string, opts, command: Command) => {
      await run(command, async (ctx) => {
        requireUserId(ctx);
        const analysis = await ctx.api.analyzeImage(id);

        if (opts.json) {
          printJson(analysis);
          return;
        }
        const count = Array.isArray(analysis.items) ? analysis.items.length : 0;
        success(`Analyzed ${id} (${count} item(s) detected)`);
      });
    });

  image
    .command('list')
    .description('List images')
    .option(
      '--status <status>',
      `filter by analysis status (${STATUSES.join('|')})`
    )
    .option('--page <n>', 'page number')
    .option('--per-page <n>', 'items per page')
    .option('--json', 'output raw JSON')
    .action(async (opts, command: Command) => {
      await run(command, async (ctx) => {
        requireUserId(ctx);
        const status = assertOneOf<AnalysisStatus>(
          opts.status,
          STATUSES,
          '--status'
        );

        const records = status
          ? await withQuietMutators(() =>
              ctx.images.getByAnalysisStatus(status)
            )
          : (
              await withQuietMutators(() =>
                ctx.images.getList(
                  Number(opts.page ?? 1),
                  Number(opts.perPage ?? 100)
                )
              )
            ).items;

        if (opts.json) {
          printJson(records);
          return;
        }
        printTable(
          records as unknown as Array<Record<string, unknown>>,
          COLUMNS
        );
      });
    });

  image
    .command('get')
    .description('Show a single image')
    .argument('<id>', 'image id')
    .option('--json', 'output raw JSON')
    .action(async (id: string, opts, command: Command) => {
      await run(command, async (ctx) => {
        requireUserId(ctx);
        const record = await withQuietMutators(() => ctx.images.getById(id));
        if (!record)
          throw new CliError(`Image ${id} not found.`, EXIT.NOT_FOUND);

        if (opts.json) {
          printJson(record);
          return;
        }
        printRecord(record as unknown as Record<string, unknown>);
      });
    });

  image
    .command('url')
    .description('Print the download URL for an image')
    .argument('<id>', 'image id')
    .action(async (id: string, _opts, command: Command) => {
      await run(command, async (ctx) => {
        requireUserId(ctx);
        const record = await withQuietMutators(() => ctx.images.getById(id));
        if (!record)
          throw new CliError(`Image ${id} not found.`, EXIT.NOT_FOUND);
        console.log(ctx.images.getFileUrl(record));
      });
    });
}
