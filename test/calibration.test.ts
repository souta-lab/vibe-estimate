import { describe, expect, test } from "bun:test";
import { estimateOne, loadModels } from "../src/estimate";

// Calibration fixture: anonymized shapes of real agent runs measured on
// 2026-11-13 (one night, one operator, one Codex model). Only task shape and
// total token counts are recorded — no prompts, code, or file contents.
// "actual" is the total (input + output) token count the agent reported.
// The scope for fixes/reviews is the touched/reviewed working set.
const model = loadModels().models.find(m => m.id === "gpt-5.1-codex")!;

const runs = [
  { name: "greenfield Rust CLI (five commands, SQLite store)", task: "feature", files: 6, loc: 562, actual: 18973 },
  { name: "greenfield TypeScript CLI (markdown queue tool)", task: "feature", files: 3, loc: 307, actual: 20029 },
  { name: "single-file shell launcher fix (spec-driven)", task: "bugfix", files: 1, loc: 172, actual: 29677 },
  { name: "docs/code-comment alignment fix", task: "docs", files: 2, loc: 881, actual: 10087 },
  { name: "read-only review of a branch diff", task: "bugfix", files: 20, loc: 5229, actual: 44128 },
] as const;

describe("calibration against measured runs", () => {
  for (const run of runs) {
    test(run.name, () => {
      const e = estimateOne({ files: run.files, loc: run.loc, task: run.task }, model);
      const likelyTotal = e.likely.inputTokens + e.likely.outputTokens;
      // Likely estimate lands within ±50% of the measured total...
      expect(Math.abs(likelyTotal - run.actual) / run.actual).toBeLessThanOrEqual(0.5);
      // ...and the measured total falls inside the low–high band.
      expect(run.actual).toBeGreaterThanOrEqual(e.low.inputTokens + e.low.outputTokens);
      expect(run.actual).toBeLessThanOrEqual(e.high.inputTokens + e.high.outputTokens);
    });
  }
});
