import { readFileSync } from "node:fs";

export type TaskType = "feature" | "bugfix" | "refactor" | "tests" | "docs";
export interface EstimateInput { files: number; loc: number; task: TaskType }
export interface Model {
  id: string; name: string; provider: string;
  inputPer1M: number; outputPer1M: number; outputTokensPerSec: number; notes: string;
}
export interface ModelTable { asOf: string; currency: string; models: Model[] }
export interface Estimate {
  modelId: string; modelName: string; inputTokens: number; outputTokens: number;
  costUsd: number; minutes: number;
}
export interface RangedEstimate { low: Estimate; likely: Estimate; high: Estimate }

export function loadModels(): ModelTable {
  return JSON.parse(readFileSync(new URL("../data/models.json", import.meta.url), "utf8"));
}

// Coefficients recalibrated in v0.2 against measured agent runs (see the
// calibration section of the README): at small scopes the per-round context
// dominates and per-file reads are far cheaper than v0.1 assumed, because the
// agent skims and greps instead of reading every file end to end.
export const SYSTEM_OVERHEAD_TOKENS = 5000;
export const READ_TOKENS_PER_FILE = 150;
export const READ_TOKENS_PER_LOC = 0.3;
export const EDIT_TOKENS_PER_FILE = 60;
export const ROUNDS: Record<TaskType, number> = { feature: 3, bugfix: 4, refactor: 3, tests: 2, docs: 2 };
export const OUTPUT_RATIO: Record<TaskType, number> = { feature: 0.9, bugfix: 0.35, refactor: 1.1, tests: 0.7, docs: 0.2 };

export function estimateOne(input: EstimateInput, model: Model): RangedEstimate {
  const rounds = ROUNDS[input.task];
  // System prompt + tool definitions are resent each round. Reading depends on
  // files and LOC; 1.25 models conversation-history growth across rounds.
  const readTokens = input.files * READ_TOKENS_PER_FILE + input.loc * READ_TOKENS_PER_LOC;
  const perRoundInput = SYSTEM_OVERHEAD_TOKENS + readTokens;
  const inputTokens = perRoundInput * rounds * 1.25;
  // Generated tokens per LOC plus edit overhead per file; later rounds regenerate
  // or fix up output at 30% per additional round.
  const baseOutput = input.loc * OUTPUT_RATIO[input.task] + input.files * EDIT_TOKENS_PER_FILE;
  const outputTokens = baseOutput * (1 + 0.3 * (rounds - 1));
  const scaled = (factor: number): Estimate => {
    const i = inputTokens * factor;
    const o = outputTokens * factor;
    return {
      modelId: model.id, modelName: model.name,
      inputTokens: Math.round(i), outputTokens: Math.round(o),
      costUsd: Number((i / 1e6 * model.inputPer1M + o / 1e6 * model.outputPer1M).toFixed(4)),
      // 1.8 includes tool calls, file reads and latency; minimum one minute.
      minutes: Math.max(1, o / model.outputTokensPerSec / 60 * 1.8),
    };
  };
  // Scale raw counts before rounding; recompute cost and time for each bound.
  return { low: scaled(0.6), likely: scaled(1), high: scaled(1.8) };
}

export function estimateAll(input: EstimateInput, models: Model[]): RangedEstimate[] {
  return models.map(model => estimateOne(input, model)).sort((a, b) => a.likely.costUsd - b.likely.costUsd);
}
