import type { CriterionResult, RubricCriterion, RubricResult } from "./types.ts";

/**
 * Weighted score over the criteria that ran. Skipped criteria are left out of
 * both numerator and denominator, so a missing API key lowers coverage, not the score.
 */
export function finalize(
  meta: { rubricId: string; rubricName: string; threshold: number; start: number },
  criteria: RubricCriterion[],
  results: CriterionResult[]
): RubricResult {
  const weightOf = new Map(criteria.map((c) => [c.id, c.weight]));
  const totalWeight = criteria.reduce((a, c) => a + c.weight, 0);
  let ranWeight = 0;
  let earned = 0;
  for (const r of results) {
    const w = weightOf.get(r.criterionId);
    if (w === undefined) throw new Error(`Result for unknown criterion "${r.criterionId}" in ${meta.rubricId}`);
    if (r.skipped) continue;
    ranWeight += w;
    earned += r.score * w;
  }
  const totalScore = ranWeight > 0 ? earned / ranWeight : 0;
  const critical = new Set(criteria.filter((c) => c.critical).map((c) => c.id));
  const criticalFailed = results.some((r) => critical.has(r.criterionId) && !r.skipped && !r.passed);
  return {
    rubricId: meta.rubricId,
    rubricName: meta.rubricName,
    totalScore,
    passed: ranWeight > 0 && !criticalFailed && totalScore >= meta.threshold,
    threshold: meta.threshold,
    coverage: totalWeight > 0 ? ranWeight / totalWeight : 0,
    criteriaResults: results.map((r) => (critical.has(r.criterionId) ? { ...r, critical: true } : r)),
    runAt: new Date().toISOString(),
    durationMs: Date.now() - meta.start,
  };
}

export function skipped(criterion: RubricCriterion, reason: string): CriterionResult {
  return {
    criterionId: criterion.id,
    description: criterion.description,
    passed: false,
    score: 0,
    skipped: true,
    details: `SKIPPED: ${reason}`,
  };
}
