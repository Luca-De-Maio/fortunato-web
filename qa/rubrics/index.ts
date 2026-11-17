import { productAlignmentRubric } from "./rubrics/product-alignment.ts";
import { adminAccessControlRubric } from "./rubrics/admin-access-control.ts";
import { brandGuidelinesRubric } from "./rubrics/brand-guidelines.ts";
import { shoppingScenariosRubric } from "./rubrics/shopping-scenarios.ts";
import { printReport, toJson } from "./reports/rubric-report.ts";
import { fortunatoConfig } from "./targets/fortunato-web/config.ts";
import { syntheticStoreConfig } from "./targets/synthetic-store/config.ts";
import type { Rubric, RunContext, TargetConfig } from "./rubrics/types.ts";

const RUBRICS: Rubric[] = [productAlignmentRubric, adminAccessControlRubric, brandGuidelinesRubric, shoppingScenariosRubric];
const TARGETS: Record<string, TargetConfig> = { "fortunato-web": fortunatoConfig, "synthetic-store": syntheticStoreConfig };

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const wanted = flag("--rubric")?.split(",");
const selected = wanted ? RUBRICS.filter((r) => wanted.includes(r.id)) : RUBRICS;
if (selected.length === 0) {
  console.error(`No rubric matches "${wanted}". Available: ${RUBRICS.map((r) => r.id).join(", ")}`);
  process.exit(2);
}

const targetName = process.env.TARGET ?? "fortunato-web";
const target = TARGETS[targetName];
if (!target) {
  console.error(`Unknown TARGET "${targetName}". Available: ${Object.keys(TARGETS).join(", ")}`);
  process.exit(2);
}

const ctx: RunContext = {
  baseUrl: process.env.TARGET_URL ?? "http://localhost:4321",
  target,
  catalogFile: process.env.CATALOG_FILE,
  responsesFile: process.env.RESPONSES_FILE,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
};

const json = args.includes("--json");
const log = json ? console.error : console.log;
log(`\nTarget: ${target.name} @ ${ctx.baseUrl}${ctx.catalogFile ? ` (catalog: ${ctx.catalogFile})` : ""}`);
log(`Running ${selected.length} rubric(s)...`);

const settled = await Promise.allSettled(selected.map((r) => r.run(ctx)));
const results = settled.flatMap((s, i) => {
  if (s.status === "fulfilled") return [s.value];
  console.error(`\n✘ ${selected[i].id} could not run: ${(s.reason as Error).message}`);
  return [];
});

if (json) process.stdout.write(toJson(results) + "\n");
else printReport(results);

process.exit(results.length === selected.length && results.every((r) => r.passed) ? 0 : 1);
