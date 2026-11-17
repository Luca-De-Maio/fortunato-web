export type EvaluationType = "deterministic" | "llm-judge";

export interface RubricCriterion {
  id: string;
  description: string;
  weight: number;
  evaluationType: EvaluationType;
  /** If this criterion fails, the rubric fails regardless of the total score. */
  critical?: boolean;
}

export interface Rubric {
  id: string;
  name: string;
  description: string;
  criteria: RubricCriterion[];
  run: (context: RunContext) => Promise<RubricResult>;
}

export interface TargetConfig {
  name: string;
  validCategories: readonly string[];
  requiredProductFields: readonly string[];
  /** Flag a price below this share of its category median (catches test SKUs and typos). */
  minPriceVsCategoryMedian: number;
  /** Words that mark an internal or placeholder product that should never be public. */
  internalMarkers: readonly string[];
}

export interface RunContext {
  baseUrl: string;
  target: TargetConfig;
  /** Read the catalog from this JSON file instead of the target's API. */
  catalogFile?: string;
  /** Pre-recorded assistant answers for the shopping-scenarios rubric. */
  responsesFile?: string;
  anthropicApiKey?: string;
}

export interface CriterionResult {
  criterionId: string;
  description: string;
  passed: boolean;
  score: number;
  details: string;
  /** True when the criterion could not run (e.g. no API key). Excluded from the score. */
  skipped?: boolean;
  critical?: boolean;
  evidence?: unknown;
}

export interface RubricResult {
  rubricId: string;
  rubricName: string;
  totalScore: number;
  passed: boolean;
  threshold: number;
  /** Share of the rubric's weight that actually ran (1 = nothing skipped). */
  coverage: number;
  criteriaResults: CriterionResult[];
  runAt: string;
  durationMs: number;
}
