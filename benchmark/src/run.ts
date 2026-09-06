/**
 * `yarn benchmark` — run the production image-analysis path against committed
 * cases and score each expected field by how often it came back right.
 *
 * The point is a feedback loop for prompt work: nothing here mocks the model,
 * and nothing re-implements the prompt. Every run goes through the same
 * `createAIAnalysisService().analyzeImage` the `/api-next/analyze-image` route
 * calls, so a change to `ai-analysis.ts` shows up here and a change here shows
 * up nowhere else.
 *
 * PocketBase is deliberately not involved: the category vocabulary a real
 * upload would read from the database is supplied per case instead, which keeps
 * a benchmark run reproducible and runnable without a server.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AnalysisResult } from '@project/shared';
import { loadImageAsDataUrl } from './image.js';
import { mean, scoreCase } from './scorer.js';
import { BenchmarkCaseSchema } from './types.js';
import type {
  BenchmarkReport,
  CaseResult,
  CategoryLibraryInput,
  LoadedCase,
} from './types.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BENCHMARK_DIR = path.resolve(HERE, '..');
const CASES_DIR = path.join(BENCHMARK_DIR, 'cases');
const RESULTS_DIR = path.join(BENCHMARK_DIR, 'results');

/** Default sample size — enough to see non-determinism, cheap enough to rerun. */
const DEFAULT_RUNS = 3;

/** Breather between calls so a burst of runs does not trip a rate limit. */
const RUN_PAUSE_MS = 250;

/** A case with no `categoryLibrary`, i.e. what a fresh install looks like. */
const EMPTY_LIBRARY: CategoryLibraryInput = {
  functional: [],
  specific: [],
  itemType: [],
};

const USAGE = `
Usage: yarn benchmark [options]

Runs every case in benchmark/cases/*.json through the production image-analysis
service and writes a scored report to benchmark/results/<model>.json.

Options:
  --model <name>   Label for this run and the default output file name.
                   Naming only — the model actually called is the one AI_MODEL
                   (or the provider default) resolves to. Default: that model.
  --case <glob>    Only run cases whose file name or "name" matches. A pattern
                   with * or ? is globbed against the whole name; anything else
                   is a case-insensitive substring. Default: every case.
  --runs <n>       Analyses per case. Default: ${DEFAULT_RUNS}.
  --out <path>     Output file. Default: benchmark/results/<model>.json
  -h, --help       Print this help and exit.

Environment (same block as the webapp — see .env.example):
  AI_PROVIDER, AI_MODEL, AI_BASE_URL, AI_EXPERIMENTAL_MODE,
  OPENAI_API_KEY / GEMINI_API_KEY

Examples:
  yarn benchmark
  yarn benchmark --case drill\\*
  yarn benchmark --model gpt-5.4-baseline --runs 5
`.trim();

interface CliOptions {
  model?: string;
  casePattern?: string;
  runs: number;
  out?: string;
  help: boolean;
}

class UsageError extends Error {}

/** Message text for anything thrown, without leaking a stack into the report. */
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { runs: DEFAULT_RUNS, help: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    // `yarn benchmark -- --model x` forwards the separator on some setups.
    if (arg === '--') continue;

    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }

    const eq = arg.indexOf('=');
    const flag = arg.startsWith('--') && eq > -1 ? arg.slice(0, eq) : arg;
    const inlineValue =
      arg.startsWith('--') && eq > -1 ? arg.slice(eq + 1) : undefined;

    const takeValue = (): string => {
      const value = inlineValue ?? argv[++i];
      if (value === undefined || value.startsWith('--')) {
        throw new UsageError(`${flag} needs a value.`);
      }
      return value;
    };

    switch (flag) {
      case '--model':
        options.model = takeValue();
        break;
      case '--case':
        options.casePattern = takeValue();
        break;
      case '--out':
        options.out = takeValue();
        break;
      case '--runs': {
        const raw = takeValue();
        const runs = Number(raw);
        if (!Number.isInteger(runs) || runs < 1) {
          throw new UsageError(
            `--runs must be a positive integer, got "${raw}".`
          );
        }
        options.runs = runs;
        break;
      }
      default:
        throw new UsageError(`Unknown argument "${arg}".`);
    }
  }

  return options;
}

/** Read and validate every `benchmark/cases/*.json`. */
async function loadCases(): Promise<LoadedCase[]> {
  let entries: string[];
  try {
    entries = await readdir(CASES_DIR);
  } catch {
    throw new Error(`No cases directory at ${CASES_DIR}.`);
  }

  const files = entries.filter((name) => name.endsWith('.json')).sort();
  const loaded: LoadedCase[] = [];

  for (const file of files) {
    const fullPath = path.join(CASES_DIR, file);
    const raw = await readFile(fullPath, 'utf8');

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`${file} is not valid JSON: ${errorMessage(err)}`, {
        cause: err,
      });
    }

    const result = BenchmarkCaseSchema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues
        .map(
          (issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`
        )
        .join('\n');
      throw new Error(`${file} is not a valid benchmark case:\n${issues}`);
    }

    loaded.push({
      file: fullPath,
      slug: file.replace(/\.json$/, ''),
      case: result.data,
    });
  }

  return loaded;
}

function globToRegExp(pattern: string): RegExp {
  const source = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${source}$`, 'i');
}

/**
 * `--case` is a glob when it contains a wildcard and a substring otherwise —
 * `--case drill` and `--case drill*` should both find `drill-on-bench`.
 */
function matchesPattern(loaded: LoadedCase, pattern: string): boolean {
  const candidates = [loaded.slug, loaded.case.name];
  if (pattern.includes('*') || pattern.includes('?')) {
    const regex = globToRegExp(pattern);
    return candidates.some((candidate) => regex.test(candidate));
  }
  const needle = pattern.toLowerCase();
  return candidates.some((candidate) =>
    candidate.toLowerCase().includes(needle)
  );
}

/** Short SHA of the checkout, so a report says which prompt produced it. */
function resolveGitSha(): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: BENCHMARK_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function sanitizeForFilename(model: string): string {
  return `${model.replace(/[^A-Za-z0-9._-]/g, '-')}.json`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printCaseTable(result: CaseResult): void {
  console.log(`\n${result.name} — avg ${result.avgScore.toFixed(2)}`);
  console.table(
    result.scores.map((score) => ({
      field: score.field,
      expected: score.expected.join(' | ') || '(none)',
      hits: `${score.hits}/${score.total}`,
      score: score.score.toFixed(2),
    }))
  );
  for (const score of result.scores) {
    if (score.note) console.log(`  note (${score.field}): ${score.note}`);
  }
  for (const error of result.errors) {
    console.error(`  run failed: ${error}`);
  }
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(USAGE);
    return 0;
  }

  const allCases = await loadCases();
  if (allCases.length === 0) {
    throw new Error(`No case files found in ${CASES_DIR}.`);
  }

  const selected = options.casePattern
    ? allCases.filter((loaded) => matchesPattern(loaded, options.casePattern!))
    : allCases;

  if (selected.length === 0) {
    throw new UsageError(
      `No case matched "${options.casePattern}". Available: ` +
        allCases.map((loaded) => loaded.slug).join(', ')
    );
  }

  // Imported here rather than at the top so `--help` and case validation work
  // without an API key, a built `shared/dist`, or the AI SDK on disk.
  const [
    { getAIConfig, DEFAULT_MODELS, API_KEY_VARS },
    { createAIAnalysisService },
  ] = await Promise.all([
    import('@/services/ai-config'),
    import('@/services/ai-analysis'),
  ]);

  const config = getAIConfig();
  if (!config.configured) {
    throw new Error(
      `AI analysis is not configured: ${API_KEY_VARS[config.provider]} is not set. ` +
        `Add OPENAI_API_KEY or GEMINI_API_KEY to .env at the repo root ` +
        `(and AI_PROVIDER if you want to pick between them), then rerun.`
    );
  }

  const model =
    options.model ??
    process.env.AI_MODEL?.trim() ??
    config.model ??
    DEFAULT_MODELS[config.provider];

  if (options.model && options.model !== config.model) {
    console.warn(
      `--model "${options.model}" labels this report only; the analysis will ` +
        `actually call "${config.model}". Set AI_MODEL to change that.`
    );
  }

  const outPath = options.out
    ? path.resolve(process.cwd(), options.out)
    : path.join(RESULTS_DIR, sanitizeForFilename(model));

  console.log(
    `Benchmarking ${selected.length} case(s) × ${options.runs} run(s) against ` +
      `${config.provider}/${config.model}` +
      `${config.experimentalMode ? ' (experimental mode)' : ''}`
  );

  const service = createAIAnalysisService();
  const results: CaseResult[] = [];

  for (const loaded of selected) {
    const { case: benchmarkCase } = loaded;
    const imagePath = path.resolve(BENCHMARK_DIR, benchmarkCase.image);
    const dataUrl = await loadImageAsDataUrl(imagePath);
    const categoryLibrary = benchmarkCase.categoryLibrary ?? EMPTY_LIBRARY;

    const runs: AnalysisResult[] = [];
    const errors: string[] = [];

    for (let attempt = 1; attempt <= options.runs; attempt++) {
      if (attempt > 1) await sleep(RUN_PAUSE_MS);
      process.stderr.write(
        `  ${benchmarkCase.name}: run ${attempt}/${options.runs}\n`
      );
      try {
        // Sequential on purpose: parallel runs are the fastest way to be rate
        // limited, and the whole benchmark is a handful of calls.
        runs.push(await service.analyzeImage(dataUrl, categoryLibrary));
      } catch (err) {
        // Surfaced verbatim — a 429 or a schema-validation failure is exactly
        // the detail a prompt change needs to see.
        errors.push(errorMessage(err));
      }
    }

    const { scores, avgScore } = scoreCase(benchmarkCase, runs);
    const result: CaseResult = {
      name: benchmarkCase.name,
      image: benchmarkCase.image,
      ...(benchmarkCase.description
        ? { description: benchmarkCase.description }
        : {}),
      runs,
      errors,
      scores,
      avgScore,
    };
    results.push(result);
    printCaseTable(result);
  }

  const allScores = results.flatMap((result) => result.scores);
  const report: BenchmarkReport = {
    model,
    provider: config.provider,
    experimentalMode: config.experimentalMode,
    generatedAt: new Date().toISOString(),
    gitSha: resolveGitSha(),
    runsPerCase: options.runs,
    cases: results,
    overall: {
      avgScore: mean(results.map((result) => result.avgScore)),
      totalFields: allScores.length,
      totalHits: allScores.reduce((sum, score) => sum + score.hits, 0),
      totalPossible: allScores.reduce((sum, score) => sum + score.total, 0),
    },
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(
    `\nOverall avg ${report.overall.avgScore.toFixed(2)} ` +
      `(${report.overall.totalHits}/${report.overall.totalPossible} field-runs matched)`
  );
  // Relative only when it actually reads as one — a `--out` outside the repo
  // would otherwise print a stack of `../`.
  const insideCwd = outPath.startsWith(`${process.cwd()}${path.sep}`);
  console.log(
    `Wrote ${insideCwd ? path.relative(process.cwd(), outPath) : outPath}`
  );

  const failedRuns = results.reduce(
    (sum, result) => sum + result.errors.length,
    0
  );
  if (failedRuns > 0) {
    console.error(
      `\n${failedRuns} run(s) failed; scores above are out of the runs that succeeded.`
    );
    return 1;
  }

  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error(`\nbenchmark: ${errorMessage(err)}`);
    if (err instanceof UsageError) console.error(`\n${USAGE}`);
    process.exitCode = 2;
  });
