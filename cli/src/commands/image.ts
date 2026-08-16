import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { Command, Option } from 'commander';
import { IMAGE_TYPES, type ImageType } from '@project/shared';
import { CliError, EXIT, withQuietMutators } from '../errors.js';
import { printJson, printRecord, success } from '../output.js';
import { requireUserId } from '../context.js';
import {
  addQueryOptions,
  parseQueryOptions,
  type RawQueryOptions,
} from '../query/options.js';
import { executeQuery, renderQuery } from '../query/run.js';
import { IMAGE_SPEC } from '../query/spec.js';
import { run } from './shared.js';

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

export function registerImageCommands(program: Command): void {
  const image = program.command('image').description('Manage images');

  image
    .command('upload')
    .description('Upload one or more image files')
    .argument('<file...>', 'paths to image files')
    .addOption(
      new Option('-t, --type <type>', 'image type')
        .choices([...IMAGE_TYPES])
        .default('unprocessed')
    )
    .option('--analyze', 'run AI analysis after upload (requires the webapp)')
    .option('--json', 'output raw JSON')
    .action(async (files: string[], opts, command: Command) => {
      await run(command, async (ctx) => {
        const userId = requireUserId(ctx);
        const imageType = (opts.type ?? 'unprocessed') as ImageType;

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

  const list = image.command('list').description('List images');
  addQueryOptions(list, IMAGE_SPEC);
  list.action(async (opts: RawQueryOptions, command: Command) => {
    const query = parseQueryOptions(IMAGE_SPEC, opts, command);

    await run(command, async (ctx) => {
      requireUserId(ctx);

      const result = await executeQuery(query, (page) =>
        ctx.images.search({ ...page, filters: query.filters })
      );

      renderQuery(query, result);
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
