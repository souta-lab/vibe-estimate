#!/usr/bin/env bun
import { estimateAll, estimateOne, loadModels, OUTPUT_RATIO, ROUNDS, type EstimateInput, type TaskType } from "./estimate";

const usage = `Usage:
  vibe-estimate estimate --files 120 --loc 8000 --task feature [--model <id>]
  vibe-estimate models
  vibe-estimate serve [--port 3939]`;
const money = (n: number) => `$${n.toFixed(2)}`;
function positive(value: string | undefined, name: string): number {
  if (!value || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0)
    throw new Error(`${name} must be a positive integer`);
  return Number(value);
}
function inputFrom(get: (key: string) => string | undefined): EstimateInput {
  const task = get("task");
  if (!task || !Object.hasOwn(ROUNDS, task)) throw new Error("task must be feature, bugfix, refactor, or tests");
  return { files: positive(get("files"), "files"), loc: positive(get("loc"), "loc"), task: task as TaskType };
}
function table(rows: string[][]): void {
  const widths = rows[0]!.map((_, i) => Math.max(...rows.map(row => row[i]!.length)));
  for (const row of rows) console.log(row.map((cell, i) => cell.padEnd(widths[i]!)).join(" | ").trimEnd());
}

try {
  const [command, ...args] = process.argv.slice(2);
  const allowed = command === "estimate" ? ["files", "loc", "task", "model"] : command === "serve" ? ["port"] : command === "models" ? [] : null;
  if (!allowed) throw new Error("Unknown or missing command");
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]!.slice(2), value = args[i + 1];
    if (!args[i]!.startsWith("--") || !allowed.includes(key) || !value || value.startsWith("--") || flags.has(key))
      throw new Error(`Invalid argument: ${args[i]}`);
    flags.set(key, value);
  }
  const data = loadModels();
  if (command === "models") {
    console.log(`Prices as of ${data.asOf} (${data.currency})`);
    table([["ID", "Model", "Input / 1M", "Output / 1M", "tok/s"], ...data.models.map(m => [m.id, m.name, money(m.inputPer1M), money(m.outputPer1M), String(m.outputTokensPerSec)])]);
  } else if (command === "estimate") {
    const input = inputFrom(key => flags.get(key));
    const id = flags.get("model");
    if (id) {
      const model = data.models.find(m => m.id === id);
      if (!model) throw new Error(`Unknown model: ${id}\nAvailable ids: ${data.models.map(m => m.id).join(", ")}`);
      const result = estimateOne(input, model);
      console.log(`${model.name} (${model.id})\nFiles: ${input.files}; LOC: ${input.loc}; task: ${input.task}`);
      const read = input.files * 900 + input.loc * 0.3;
      console.log(`Read tokens: ${read}; input per round: ${6000 + read}; rounds: ${ROUNDS[input.task]}`);
      console.log(`Input = (6000 + ${read}) × ${ROUNDS[input.task]} × 1.25`);
      console.log(`Output = (${input.loc} × ${OUTPUT_RATIO[input.task]} + ${input.files} × 60) × (1 + 0.3 × ${ROUNDS[input.task] - 1})`);
      console.log(`Cost = input / 1M × ${money(model.inputPer1M)} + output / 1M × ${money(model.outputPer1M)}`);
      console.log(`Minutes = max(1, output / ${model.outputTokensPerSec} / 60 × 1.8)`);
      table([["Range", "Input tok", "Output tok", "Cost", "Minutes"], ...(["low", "likely", "high"] as const).map(key => { const e = result[key]; return [key, String(e.inputTokens), String(e.outputTokens), money(e.costUsd), e.minutes.toFixed(1)]; })]);
      if (model.notes) console.log(model.notes);
    } else {
      table([["Model", "Cost low–high (likely)", "Time likely", "Input tok", "Output tok"], ...estimateAll(input, data.models).map(e => [e.likely.modelName, `${money(e.low.costUsd)}–${money(e.high.costUsd)} (likely ${money(e.likely.costUsd)})`, `${e.likely.minutes.toFixed(1)} min`, String(e.likely.inputTokens), String(e.likely.outputTokens)])]);
    }
  } else {
    const port = positive(flags.get("port") ?? "3939", "port");
    if (port > 65535) throw new Error("port must be at most 65535");
    Bun.serve({ port, async fetch(request) {
      const url = new URL(request.url);
      if (request.method !== "GET") return Response.json({ error: "Not found" }, { status: 404 });
      if (url.pathname === "/") return new Response(Bun.file(new URL("../web/index.html", import.meta.url)), { headers: { "Content-Type": "text/html; charset=utf-8" } });
      if (url.pathname === "/api/models") return Response.json(loadModels());
      if (url.pathname === "/api/estimate") {
        try { return Response.json(estimateAll(inputFrom(key => url.searchParams.get(key) ?? undefined), loadModels().models)); }
        catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }
      }
      return Response.json({ error: "Not found" }, { status: 404 });
    } });
    console.log(`vibe-estimate listening on http://localhost:${port}`);
  }
} catch (error) {
  console.error(`${(error as Error).message}\n\n${usage}`);
  process.exitCode = 1;
}
