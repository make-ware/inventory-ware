import * as readline from 'node:readline';
import { Command } from 'commander';
import { withRetry } from '@project/shared';
import { CliError, EXIT, notLoggedIn, withQuietMutators } from '../errors.js';
import { printJson, printRecord, success } from '../output.js';
import { run } from './shared.js';

function prompt(query: string, hidden = false): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      // Allow piping credentials in scripts: read a single line from stdin.
      const rl = readline.createInterface({ input: process.stdin });
      rl.once('line', (line) => {
        rl.close();
        resolve(line.trim());
      });
      rl.once('close', () => resolve(''));
      rl.once('error', reject);
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    let muted = false;
    const internals = rl as unknown as {
      _writeToOutput: (chunk: string) => void;
    };
    internals._writeToOutput = (chunk: string) => {
      if (!muted) process.stdout.write(chunk);
    };

    process.stdout.write(query);
    muted = hidden;

    rl.question('', (answer) => {
      muted = false;
      if (hidden) process.stdout.write('\n');
      rl.close();
      resolve(answer.trim());
    });
    rl.once('error', reject);
  });
}

export function registerAuthCommands(program: Command): void {
  program
    .command('login')
    .description('Authenticate against the Users collection and cache a token')
    .option('-e, --email <email>', 'account email')
    .option(
      '-p, --password <password>',
      'account password (prefer the prompt or IW_PASSWORD)'
    )
    .action(async (_opts, command: Command) => {
      await run(command, async (ctx) => {
        const opts = command.opts<{ email?: string; password?: string }>();

        const email = opts.email ?? (await prompt('Email: '));
        if (!email) throw new CliError('An email is required.', EXIT.USAGE);

        const password =
          opts.password ??
          process.env.IW_PASSWORD ??
          (await prompt('Password: ', true));
        if (!password)
          throw new CliError('A password is required.', EXIT.USAGE);

        const auth = await withQuietMutators(() =>
          withRetry(() =>
            ctx.pb.collection('Users').authWithPassword(email, password)
          )
        );

        success(`Logged in as ${auth.record?.email ?? email}`);
        console.log(`PocketBase: ${ctx.config.pocketbaseUrl}`);
      });
    });

  program
    .command('logout')
    .description('Clear the cached session')
    .action(async (_opts, command: Command) => {
      await run(command, async (ctx) => {
        ctx.pb.authStore.clear();
        success('Logged out.');
      });
    });

  program
    .command('whoami')
    .description('Show the currently authenticated user')
    .option('--json', 'output raw JSON')
    .action(async (_opts, command: Command) => {
      await run(command, async (ctx) => {
        const record = ctx.pb.authStore.record;
        if (!ctx.pb.authStore.isValid || !record) throw notLoggedIn();

        if (command.opts<{ json?: boolean }>().json) {
          printJson(record);
          return;
        }
        printRecord(record as unknown as Record<string, unknown>, [
          'id',
          'email',
          'name',
          'created',
        ]);
      });
    });
}
