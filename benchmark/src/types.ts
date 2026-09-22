/**
 * Case-file schemas and report shapes for the image-analysis benchmark.
 *
 * Case files are hand-written JSON, so they are parsed through Zod rather than
 * cast: a typo in a field name should fail before a single (paid) model call is
 * made, naming the file and the offending key.
 */
import { z } from 'zod';

/**
 * The "already in this inventory" vocabulary handed to the prompt. Optional in
 * a case file; an omitted tier is an empty list, which is what a fresh install
 * looks like — the prompt still renders its curated examples in that case.
 */
export const CategoryLibrarySchema = z.strictObject({
  functional: z.array(z.string()).default([]),
  specific: z.array(z.string()).default([]),
  itemType: z.array(z.string()).default([]),
});

export const FieldExpectationSchema = z.strictObject({
  /**
   * Dot path into the `data` object of an `AnalysisResult` — `item.itemType`,
   * `container.containerItems[0].itemType`, `imageLabel`. See `getField`.
   */
  field: z.string().min(1),
  /**
   * Acceptable answers. A run scores a hit when the field matches *any* of
   * them; an empty list can never be satisfied and is reported as such.
   */
  expected: z.array(z.string()),
  /** Free-text reminder of why this expectation exists. Copied into the report. */
  note: z.string().optional(),
});

export const BenchmarkCaseSchema = z.strictObject({
  name: z.string().min(1),
  /** Path to the image, relative to the `benchmark/` directory. */
  image: z.string().min(1),
  description: z.string().optional(),
  categoryLibrary: CategoryLibrarySchema.optional(),
  expectations: z.array(FieldExpectationSchema).min(1),
});

export type CategoryLibraryInput = z.infer<typeof CategoryLibrarySchema>;
export type FieldExpectation = z.infer<typeof FieldExpectationSchema>;
export type BenchmarkCase = z.infer<typeof BenchmarkCaseSchema>;

/** A case file plus where it was loaded from, for error messages and filtering. */
export interface LoadedCase {
  /** Absolute path of the case file. */
  file: string;
  /** File name without the `.json` extension. */
  slug: string;
  case: BenchmarkCase;
}

export interface FieldScore {
  field: string;
  expected: string[];
  /** Runs in which the field matched one of the expected terms. */
  hits: number;
  /** Runs that produced a result at all (failed runs are not counted). */
  total: number;
  /** `hits / total`, or 0 when nothing ran. */
  score: number;
  /**
   * Why a score is lower than it looks — an empty `expected`, or runs that came
   * back as the other analysis type so an `item.*` path could never resolve.
   */
  note?: string;
}

/**
 * What a report records for one case: the scores and nothing else.
 *
 * Raw model output is deliberately absent. It is non-deterministic and bulky, so
 * persisting it would make every rerun a large diff of text nobody compares;
 * what a prompt change is judged on is the delta in the scores. The runs are
 * still printed to the console as they happen — see `benchmark/README.md`.
 */
export interface CaseResult {
  name: string;
  image: string;
  description?: string;
  /** Provider errors, one per failed run, surfaced verbatim. */
  errors: string[];
  scores: FieldScore[];
  /** Mean of the field scores. */
  avgScore: number;
}

export interface BenchmarkReport {
  /** Label for this run — `--model`, else the model resolved from the env. */
  model: string;
  provider: string;
  experimentalMode: boolean;
  generatedAt: string;
  /** Short SHA of the working tree, or null outside a git checkout. */
  gitSha: string | null;
  runsPerCase: number;
  cases: CaseResult[];
  overall: {
    avgScore: number;
    totalFields: number;
    totalHits: number;
    totalPossible: number;
  };
}
