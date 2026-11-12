import { describe, expect, test } from "bun:test";
import { estimateAll, estimateOne, loadModels } from "../src/estimate";

const models = loadModels().models;
const sonnet = models.find(m => m.id === "claude-sonnet-4.5")!;
const input = { files: 10, loc: 1000, task: "feature" as const };
describe("estimator", () => {
  test("cost grows with LOC and file count", () => {
    for (const model of models) {
      const base = estimateOne(input, model).likely.costUsd;
      expect(estimateOne({ ...input, loc: 2000 }, model).likely.costUsd).toBeGreaterThan(base);
      expect(estimateOne({ ...input, files: 20 }, model).likely.costUsd).toBeGreaterThan(base);
    }
  });
  test("ranges are ordered for every model and task", () => {
    for (const model of models) for (const task of ["feature", "bugfix", "refactor", "tests", "docs"] as const) {
      const { low, likely, high } = estimateOne({ ...input, task }, model);
      for (const key of ["costUsd", "minutes"] as const) {
        expect(low[key]).toBeLessThanOrEqual(likely[key]);
        expect(likely[key]).toBeLessThanOrEqual(high[key]);
      }
    }
  });
  test("task output ratios and bugfix rounds", () => {
    const bugfix = estimateOne({ ...input, task: "bugfix" }, sonnet).likely;
    expect(estimateOne({ ...input, task: "refactor" }, sonnet).likely.outputTokens).toBeGreaterThan(bugfix.outputTokens);
    expect(bugfix.inputTokens).toBeGreaterThan(estimateOne(input, sonnet).likely.inputTokens);
  });
  test("hand-computed Sonnet feature case", () => {
    const rounds = 3;
    const read = 10 * 150 + 1000 * 0.3;
    const expectedInput = (5000 + read) * rounds * 1.25;
    const expectedOutput = (1000 * 0.9 + 10 * 60) * (1 + 0.3 * (rounds - 1));
    const result = estimateOne(input, sonnet);
    for (const [key, factor] of [["low", 0.6], ["likely", 1], ["high", 1.8]] as const) {
      expect(result[key].inputTokens).toBe(Math.round(expectedInput * factor));
      expect(result[key].outputTokens).toBe(Math.round(expectedOutput * factor));
      expect(result[key].costUsd).toBe(Number((expectedInput * factor / 1e6 * 3 + expectedOutput * factor / 1e6 * 15).toFixed(4)));
      expect(result[key].minutes).toBe(Math.max(1, expectedOutput * factor / 75 / 60 * 1.8));
    }
  });
  test("all eight models sorted by likely cost with positive finite values", () => {
    const results = estimateAll(input, models);
    expect(results).toHaveLength(8);
    expect(new Set(results.map(e => e.likely.modelId)).size).toBe(8);
    results.forEach((result, i) => {
      if (i) expect(result.likely.costUsd).toBeGreaterThanOrEqual(results[i-1]!.likely.costUsd);
      for (const estimate of Object.values(result)) for (const key of ["inputTokens", "outputTokens", "costUsd", "minutes"] as const) {
        expect(Number.isFinite(estimate[key])).toBe(true);
        expect(estimate[key]).toBeGreaterThan(0);
      }
    });
  });
});
