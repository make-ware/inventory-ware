import { reportError } from './errors.js';
import { buildProgram } from './program.js';

export async function main(argv: string[] = process.argv): Promise<void> {
  const program = buildProgram();
  try {
    await program.parseAsync(argv);
  } catch (error) {
    process.exitCode = reportError(error);
  }
}

await main();
