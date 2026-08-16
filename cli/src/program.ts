import { Command, Option } from 'commander';
import { registerAuthCommands } from './commands/auth.js';
import { registerContainerCommands } from './commands/container.js';
import { registerImageCommands } from './commands/image.js';
import { registerItemCommands } from './commands/item.js';
import {
  CliError,
  EXIT,
  SilentExit,
  setVerbose,
  usageContext,
} from './errors.js';

declare const __IW_VERSION__: string;

export const VERSION =
  typeof __IW_VERSION__ === 'string' ? __IW_VERSION__ : '0.0.0-dev';

/**
 * Extra guidance for Commander's own error codes, used when Commander did not
 * already append a suggestion of its own.
 */
const COMMANDER_HINTS: Record<string, string> = {
  'commander.conflictingOption': 'Pass only one of the conflicting flags.',
  'commander.missingArgument': 'Check the argument order in the usage line.',
  'commander.missingMandatoryOptionValue': 'This flag is required.',
  'commander.unknownCommand':
    'Run the parent command with --help to list subcommands.',
  'commander.invalidArgument': 'Check the value you passed to this flag.',
};

/**
 * Route Commander's own parse errors through our reporter.
 *
 * Without this, Commander prints the full help and calls `process.exit(1)`
 * itself, so parse errors never reach `reportError` and exit 1 rather than the
 * documented EXIT.USAGE. The walk runs after registration so every closure
 * captures the command it belongs to.
 */
function applyErrorHandling(command: Command): void {
  command.showHelpAfterError(false);
  // reportError is the single place errors are printed; let it own stderr.
  command.configureOutput({ outputError: () => {} });
  command.exitOverride((err) => {
    // --help and --version are successes that Commander models as errors.
    if (err.exitCode === 0) throw new SilentExit(0);
    // `iw` with no arguments: help was displayed, but it is a usage miss.
    if (err.code === 'commander.help') throw new SilentExit(EXIT.USAGE);

    const [head, ...rest] = err.message.replace(/^error:\s*/, '').split('\n');
    // Commander appends its own suggestions as "(Did you mean --foo?)".
    const hints = rest
      .map((line) => line.trim().replace(/^\((.*)\)$/, '$1'))
      .filter(Boolean);
    if (hints.length === 0 && COMMANDER_HINTS[err.code]) {
      hints.push(COMMANDER_HINTS[err.code]);
    }

    throw new CliError(head, EXIT.USAGE, hints, usageContext(command));
  });

  for (const sub of command.commands) applyErrorHandling(sub);
}

/**
 * Build the command tree. Side-effect free so tests can drive it directly.
 */
export function buildProgram(): Command {
  const program = new Command();

  program
    .name('iw')
    .description('Command line interface for Inventory Ware')
    .version(VERSION, '-V, --version')
    .option('--url <url>', 'Inventory Ware application URL (env: APP_URL)')
    .option('-v, --verbose', 'show underlying errors and stack traces')
    .showSuggestionAfterError();

  // Advanced overrides for deployments where PocketBase and the webapp are not
  // behind the same origin. Hidden to keep --help to a single URL flag.
  program
    .addOption(
      new Option(
        '--pb-url <url>',
        'override just the PocketBase URL'
      ).hideHelp()
    )
    .addOption(
      new Option('--api-url <url>', 'override just the webapp URL').hideHelp()
    );

  program.hook('preAction', (thisCommand) => {
    setVerbose(Boolean(thisCommand.opts().verbose));
  });

  registerAuthCommands(program);
  registerItemCommands(program);
  registerContainerCommands(program);
  registerImageCommands(program);

  applyErrorHandling(program);

  return program;
}
