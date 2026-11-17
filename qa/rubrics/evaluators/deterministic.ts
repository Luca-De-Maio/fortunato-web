import type { CriterionResult, RubricCriterion } from "../rubrics/types.ts";

export function evaluate(
  criterion: RubricCriterion,
  check: () => { passed: boolean; details: string; evidence?: unknown }
): CriterionResult {
  const { passed, details, evidence } = check();
  return {
    criterionId: criterion.id,
    description: criterion.description,
    passed,
    score: passed ? 1 : 0,
    details,
    evidence,
  };
}

export function evaluateAll(
  items: unknown[],
  criterion: RubricCriterion,
  check: (item: unknown) => { passed: boolean; reason: string }
): CriterionResult {
  const results = items.map(check);
  const failures = results.filter((r) => !r.passed);
  const score = (items.length - failures.length) / Math.max(items.length, 1);
  return {
    criterionId: criterion.id,
    description: criterion.description,
    passed: failures.length === 0,
    score,
    details:
      failures.length === 0
        ? `All ${items.length} items passed.`
        : `${failures.length}/${items.length} failed: ${failures.map((f) => f.reason).slice(0, 5).join("; ")}`,
    evidence: failures.map((f) => f.reason),
  };
}
