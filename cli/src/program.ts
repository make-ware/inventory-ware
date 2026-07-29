import { Command } from 'commander';
import { registerAuthCommands } from './commands/auth.js';
import { registerContainerCommands } from './commands/container.js';
import { registerImageCommands } from './commands/image.js';
import { registerItemCommands } from './commands/item.js';
import { setVerbose } from './errors.js';

declare const __IW_VERSION__: string;

export const VERSION =
  typeof __IW_VERSION__ === 'string' ? __IW_VERSION__ : '0.0.0-dev';

/**
 * Build the command tree. Side-effect free so tests can drive it directly.
 */
export function buildProgram(): Command {
  const program = new Command();

  program
    .name('iw')
    .description('Command line interface for Inventory Ware')
    .version(VERSION, '-V, --version')
    .option('--pb-url <url>', 'PocketBase URL (env: POCKETBASE_URL)')
    .option(
      '--api-url <url>',
      'Inventory Ware webapp URL (env: INVENTORY_WARE_API_URL)'
    )
    .option('-v, --verbose', 'show underlying errors and stack traces')
    .showHelpAfterError();

  program.hook('preAction', (thisCommand) => {
    setVerbose(Boolean(thisCommand.opts().verbose));
  });

  registerAuthCommands(program);
  registerItemCommands(program);
  registerContainerCommands(program);
  registerImageCommands(program);

  return program;
}
