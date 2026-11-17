import type { RubricResult } from "../rubrics/types.ts";

const PASS = "\x1b[32m✔\x1b[0m";
const FAIL = "\x1b[31m✘\x1b[0m";
const SKIP = "\x1b[90m–\x1b[0m";
const WARN = "\x1b[33m⚠\x1b[0m";

function scoreBar(score: number, width = 20): string {
  const filled = Math.round(score * width);
  return "[" + "█".repeat(filled) + "░".repeat(width - filled) + "]";
}

export function printReport(results: RubricResult[]): void {
  console.log("\n" + "═".repeat(60));
  console.log("  AI QA RUBRICS FRAMEWORK: REPORT");
  console.log("═".repeat(60));

  for (const r of results) {
    console.log(`\n${r.passed ? PASS : FAIL}  ${r.rubricName}`);
    console.log(
      `   Score: ${scoreBar(r.totalScore)} ${(r.totalScore * 100).toFixed(1)}%  (threshold ${(r.threshold * 100).toFixed(0)}%)` +
        (r.coverage < 1 ? `  ${WARN} coverage ${(r.coverage * 100).toFixed(0)}%: some criteria were skipped` : "")
    );
    console.log(`   Duration: ${r.durationMs}ms  |  ${r.runAt}`);
    for (const c of r.criteriaResults) {
      const icon = c.skipped ? SKIP : c.passed ? PASS : FAIL;
      const pct = c.skipped ? " --" : (c.score * 100).toFixed(0).padStart(3);
      console.log(`     ${icon} [${pct}%] ${c.description}${c.critical ? " (critical)" : ""}`);
      if (!c.passed) console.log(`          ${c.skipped ? "" : WARN + "  "}${c.details}`);
    }
  }

  const overall = results.every((r) => r.passed);
  const avg = results.reduce((a, r) => a + r.totalScore, 0) / Math.max(results.length, 1);
  console.log("\n" + "═".repeat(60));
  console.log(`  OVERALL: ${overall ? PASS + "  PASSED" : FAIL + "  FAILED"}  |  Avg score: ${(avg * 100).toFixed(1)}%`);
  console.log("═".repeat(60) + "\n");
}

export function toJson(results: RubricResult[]): string {
  return JSON.stringify(results, null, 2);
}
