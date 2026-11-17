import { readFile } from "node:fs/promises";
import type { CriterionResult, Rubric, RubricCriterion, RunContext } from "./types.ts";
import { finalize, skipped } from "./scoring.ts";
import { llmJudge } from "../evaluators/llm-judge.ts";
import { loadCatalog, type Product } from "../targets/catalog.ts";
import { askStoreAssistant, ASSISTANT_MODEL } from "../runners/assistant.ts";

const SCENARIOS_FILE = process.env.SCENARIOS_FILE ?? new URL("../scenarios/fortunato.scenarios.json", import.meta.url).pathname;
const THRESHOLD = 0.8;

interface Scenario {
  id: string;
  intent: string;
  failurePattern: string;
  prompt: string;
  /** Each inner list is one fact; any spelling in it counts. */
  requiredFacts: string[][];
  forbidden: { pattern: string; why: string }[];
  allowedNumbers?: number[];
  judge: string;
}

const criteria: RubricCriterion[] = [
  { id: "grounded-prices", description: "Every price in the answer is a catalog price, a previous price, or a sum of up to three catalog prices", weight: 0.25, evaluationType: "deterministic", critical: true },
  { id: "required-facts", description: "The answer states the facts the scenario hinges on (sizes, measures, prices)", weight: 0.2, evaluationType: "deterministic" },
  { id: "no-forbidden-claims", description: "The answer makes none of the scenario's known false claims", weight: 0.2, evaluationType: "deterministic", critical: true },
  { id: "judge-quality", description: "LLM judge: the answer meets the scenario's ideal-answer description", weight: 0.35, evaluationType: "llm-judge" },
];

/** "$112.880", "$ 44480", "ARS 109.500" -> numbers. Thousands use dots in es-AR. */
export function extractPrices(text: string): number[] {
  const re = /(?:\$|ARS)\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?/g;
  return [...text.matchAll(re)].map((m) => Number(m[1].replace(/\./g, "")));
}

function allowedPrices(products: Product[], extra: number[] = []): Set<number> {
  const base = [...new Set(products.flatMap((p) => [p.price, p.compareAt].filter((x): x is number => typeof x === "number")))];
  const current = [...new Set(products.map((p) => p.price))];
  const out = new Set<number>([...base, ...extra]);
  for (let i = 0; i < current.length; i++)
    for (let j = i; j < current.length; j++) {
      out.add(current[i] + current[j]);
      for (let k = j; k < current.length; k++) out.add(current[i] + current[j] + current[k]);
    }
  return out;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function perScenario(criterion: RubricCriterion, rows: { id: string; score: number; note: string }[], passMark = 1): CriterionResult {
  const fails = rows.filter((r) => r.score < passMark);
  const score = rows.reduce((a, r) => a + r.score, 0) / Math.max(rows.length, 1);
  return {
    criterionId: criterion.id,
    description: criterion.description,
    passed: fails.length === 0,
    score,
    details: fails.length ? fails.map((f) => `${f.id}: ${f.note}`).join(" | ") : `All ${rows.length} scenarios passed.`,
    evidence: rows,
  };
}

export const shoppingScenariosRubric: Rubric = {
  id: "shopping-scenarios",
  name: "Shopping Assistant Scenarios",
  description: "Asks a store assistant realistic, edge-case shopping questions and grades the answers against the catalog.",
  criteria,
  async run(ctx: RunContext) {
    const start = Date.now();
    const { products } = await loadCatalog(ctx);
    const { scenarios } = JSON.parse(await readFile(SCENARIOS_FILE, "utf8")) as { scenarios: Scenario[] };

    let answers: Record<string, string>;
    let answerSource: string;
    if (ctx.responsesFile) {
      answers = JSON.parse(await readFile(ctx.responsesFile, "utf8")).responses;
      answerSource = ctx.responsesFile;
    } else if (ctx.anthropicApiKey) {
      const key = ctx.anthropicApiKey;
      const got = await Promise.all(scenarios.map((s) => askStoreAssistant(products, s.prompt, key)));
      answers = Object.fromEntries(scenarios.map((s, i) => [s.id, got[i]]));
      answerSource = `live: ${ASSISTANT_MODEL}`;
    } else {
      return finalize(
        { rubricId: "shopping-scenarios", rubricName: "Shopping Assistant Scenarios", threshold: THRESHOLD, start },
        criteria,
        criteria.map((c) => skipped(c, "no answers: set RESPONSES_FILE or ANTHROPIC_API_KEY"))
      );
    }

    const missing = scenarios.filter((s) => typeof answers[s.id] !== "string");
    if (missing.length) throw new Error(`No answer for scenario(s): ${missing.map((s) => s.id).join(", ")}`);

    const grounded = scenarios.map((s) => {
      const ok = allowedPrices(products, s.allowedNumbers);
      const bad = extractPrices(answers[s.id]).filter((n) => !ok.has(n));
      return { id: s.id, score: bad.length ? 0 : 1, note: bad.length ? `price not in catalog: ${bad.join(", ")}` : "" };
    });
    const facts = scenarios.map((s) => {
      const a = norm(answers[s.id]);
      const absent = s.requiredFacts.filter((alts) => !alts.some((f) => a.includes(norm(f))));
      const score = s.requiredFacts.length ? 1 - absent.length / s.requiredFacts.length : 1;
      return { id: s.id, score, note: absent.length ? `missing ${absent.map((x) => x[0]).join(", ")}` : "" };
    });
    const forbidden = scenarios.map((s) => {
      const hits = s.forbidden.filter((f) => new RegExp(f.pattern, "i").test(answers[s.id]));
      return { id: s.id, score: hits.length ? 0 : 1, note: hits.map((h) => h.why).join("; ") };
    });

    const judged = await Promise.all(
      scenarios.map((s) =>
        llmJudge(
          {
            criterion: { ...criteria[3], description: s.judge },
            subject: answers[s.id],
            context: `Customer message: ${s.prompt}\nCatalog (ground truth): ${JSON.stringify(products)}`,
          },
          ctx.anthropicApiKey
        )
      )
    );
    const judgeResult: CriterionResult = judged.every((j) => j.skipped)
      ? skipped(criteria[3], judged[0]?.details.replace(/^SKIPPED: /, "") ?? "no scenarios")
      : perScenario(
          criteria[3],
          judged.flatMap((j, i) => (j.skipped ? [] : [{ id: scenarios[i].id, score: j.score, note: j.details }])),
          0.7
        );

    const results = [
      perScenario(criteria[0], grounded),
      perScenario(criteria[1], facts),
      perScenario(criteria[2], forbidden),
      judgeResult,
    ];
    results[0].details += ` Answers: ${answerSource}.`;
    return finalize({ rubricId: "shopping-scenarios", rubricName: "Shopping Assistant Scenarios", threshold: THRESHOLD, start }, criteria, results);
  },
};
