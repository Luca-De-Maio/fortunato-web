import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { CriterionResult, RubricCriterion } from "../rubrics/types.ts";
import { skipped } from "../rubrics/scoring.ts";

export const JUDGE_MODEL = process.env.JUDGE_MODEL ?? "claude-opus-5-5";
/** Each criterion is judged this many times; the median score is kept. */
const SAMPLES = Number(process.env.JUDGE_SAMPLES ?? 3);
const PASS_MARK = 0.7;

const Verdict = z.object({
  reasoning: z.string().describe("Two or three sentences citing the specific text that drove the score."),
  score: z.number().describe("0 to 1. 1 = fully meets the criterion, 0 = clearly fails it."),
});

interface JudgeInput {
  criterion: RubricCriterion;
  subject: string;
  context?: string;
}

let client: Anthropic | null = null;

async function judgeOnce(input: JudgeInput, apiKey: string): Promise<z.infer<typeof Verdict> | string> {
  client ??= new Anthropic({ apiKey });
  const response = await client.messages.parse({
    model: JUDGE_MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(Verdict) },
    system:
      "You grade content against one rubric criterion. Judge only that criterion. " +
      "Quote the evidence you relied on. If the content does not contain enough information to judge, score 0 and say so.",
    messages: [
      {
        role: "user",
        content: `<criterion>${input.criterion.description}</criterion>\n` +
          (input.context ? `<context>${input.context}</context>\n` : "") +
          `<content>\n${input.subject}\n</content>`,
      },
    ],
  });
  if (response.stop_reason === "refusal") return "judge declined to grade (refusal)";
  if (!response.parsed_output) return `judge output did not match the schema (stop_reason: ${response.stop_reason})`;
  return response.parsed_output;
}

export async function llmJudge(input: JudgeInput, apiKey: string | undefined): Promise<CriterionResult> {
  if (!apiKey) return skipped(input.criterion, "set ANTHROPIC_API_KEY to run LLM-as-judge criteria");

  const runs = await Promise.all(Array.from({ length: SAMPLES }, () => judgeOnce(input, apiKey).catch((e: Error) => e.message)));
  const verdicts = runs.filter((r): r is z.infer<typeof Verdict> => typeof r !== "string");
  const errors = runs.filter((r): r is string => typeof r === "string");

  // A judge failure is not a content failure: report it as skipped, never as a silent 0.
  if (verdicts.length === 0) return skipped(input.criterion, `judge error: ${errors[0]}`);

  const scores = verdicts.map((v) => Math.min(1, Math.max(0, v.score))).sort((a, b) => a - b);
  const median = scores[Math.floor(scores.length / 2)];
  const chosen = verdicts.find((v) => Math.min(1, Math.max(0, v.score)) === median) ?? verdicts[0];
  const spread = scores[scores.length - 1] - scores[0];

  return {
    criterionId: input.criterion.id,
    description: input.criterion.description,
    passed: median >= PASS_MARK,
    score: median,
    details:
      chosen.reasoning +
      ` [${verdicts.length}/${SAMPLES} samples, scores ${scores.map((s) => s.toFixed(2)).join("/")}` +
      (spread > 0.3 ? ", judges disagree: review by hand" : "") +
      (errors.length ? `, ${errors.length} failed` : "") + "]",
    evidence: { model: JUDGE_MODEL, scores, errors },
  };
}
