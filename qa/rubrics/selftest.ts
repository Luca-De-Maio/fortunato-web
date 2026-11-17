/**
 * Tests the rubric, not the store: runs product-alignment on a synthetic catalog
 * with known seeded defects and checks that every defect is caught and nothing clean is flagged.
 */
import { readFile } from "node:fs/promises";
import { productAlignmentRubric } from "./rubrics/product-alignment.ts";
import { syntheticStoreConfig } from "./targets/synthetic-store/config.ts";
import { extractPrices } from "./rubrics/shopping-scenarios.ts";

const dir = new URL("./targets/synthetic-store/", import.meta.url).pathname;
const expected = JSON.parse(await readFile(dir + "expected-defects.json", "utf8"))["product-alignment"] as Record<string, string[]>;

const result = await productAlignmentRubric.run({
  baseUrl: "http://unused",
  target: syntheticStoreConfig,
  catalogFile: dir + "catalog.json",
});

let problems = 0;
for (const c of result.criteriaResults) {
  const flagged = new Set(((c.evidence as string[]) ?? []).map((reason) => reason.split(":")[0]));
  const want = new Set(expected[c.criterionId] ?? []);
  const missed = [...want].filter((id) => !flagged.has(id));
  const extra = [...flagged].filter((id) => !want.has(id));
  const ok = missed.length === 0 && extra.length === 0;
  if (!ok) problems++;
  console.log(`${ok ? "✔" : "✘"} ${c.criterionId.padEnd(20)} caught ${flagged.size}/${want.size}` +
    (missed.length ? `  missed: ${missed.join(", ")}` : "") + (extra.length ? `  false positives: ${extra.join(", ")}` : ""));
}

const priceCases: [string, number[]][] = [
  ["Sale $112.880 en total", [112880]],
  ["a $ 44480 o ARS 109.500,00", [44480, 109500]],
  ["sin precios, talle 42", []],
];
for (const [text, want] of priceCases) {
  const got = extractPrices(text);
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) problems++;
  console.log(`${ok ? "✔" : "✘"} extractPrices("${text}") = [${got}]`);
}

console.log(problems ? `\n${problems} check(s) failed` : "\nAll self-checks passed");
process.exit(problems ? 1 : 0);
