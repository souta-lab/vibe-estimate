# vibe-estimate

<p align="center">
  <img src="assets/logo.png" alt="vibe-estimate logo" width="160">
</p>

Estimate API-key-based vibe coding costs and time across eight LLM coding models, with a dependency-free Bun CLI and web UI.

![Bun](https://img.shields.io/badge/Bun-runtime-black) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6) ![License MIT](https://img.shields.io/badge/License-MIT-green) ![Prices as of 2026-11](https://img.shields.io/badge/prices--as--of-2026--11-blue)

## 🧭 Table of contents

- [✨ Features](#-features)
- [🚀 Install & Usage](#-install--usage)
- [🧮 How the estimate works](#-how-the-estimate-works)
- [📏 Calibration](#-calibration)
- [💲 Model prices](#-model-prices)
- [🌐 Web UI](#-web-ui)
- [🧪 Tests](#-tests)
- [📁 Project structure](#-project-structure)
- [📄 License](#-license)

## ✨ Features

- Compare all eight models, sorted by likely cost, or inspect one detailed estimate.
- Low, likely, and high estimates for tokens, USD cost, and wall-clock time.
- Local web UI with live updates and an offline fallback.
- TypeScript on Bun, zero runtime dependencies; no API key or provider calls needed.

## 🚀 Install & Usage

Install [Bun](https://bun.sh), then run from this checkout; no dependency installation is needed:

```sh
bun run src/cli.ts estimate --files 120 --loc 8000 --task feature
bun run src/cli.ts estimate --files 120 --loc 8000 --task feature --model claude-sonnet-4.5
bun run src/cli.ts models
bun run src/cli.ts serve --port 3939
```

To register the CLI locally, run `bun link`. The bin entry supports:

```sh
vibe-estimate estimate --files 120 --loc 8000 --task feature
vibe-estimate estimate --files 120 --loc 8000 --task feature --model claude-sonnet-4.5
vibe-estimate models
vibe-estimate serve
vibe-estimate serve --port 3939
```

Files and LOC must be positive safe integers. Task must be `feature`, `bugfix`, `refactor`, `tests`, or `docs`. Missing or invalid CLI arguments exit with status 1 and usage text. Unknown model IDs also list available IDs. `bun start` runs the CLI; supply a command after it.

## 🧮 How the estimate works

Scope means the files and lines of code the agent is expected to work with, rather than just the lines it will change.

| Task | Rounds | Output tokens per LOC |
| --- | ---: | ---: |
| feature | 3 | 0.9 |
| bugfix | 4 | 0.35 |
| refactor | 3 | 1.1 |
| tests | 2 | 0.7 |
| docs | 2 | 0.2 |

Constants and full formula:

```text
SYSTEM_OVERHEAD_TOKENS = 5000
READ_TOKENS_PER_FILE = 150
READ_TOKENS_PER_LOC = 0.3
EDIT_TOKENS_PER_FILE = 60

readTokens = files × 150 + loc × 0.3
perRoundInput = 5000 + readTokens
inputTokens = perRoundInput × rounds × 1.25
baseOutput = loc × taskOutputRatio + files × 60
outputTokens = baseOutput × (1 + 0.3 × (rounds - 1))
costUsd = inputTokens / 1,000,000 × inputPer1M
        + outputTokens / 1,000,000 × outputPer1M
minutes = max(1, outputTokens / outputTokensPerSec / 60 × 1.8)
```

The system prompt and tool definitions are resent each round. The ×1.25 factor models conversation-history growth, the 30% per extra round models regeneration and fix-ups, and the time multiplier ×1.8 accounts for tool calls, file reads, and latency. Speed values are assumptions, not throughput guarantees.

This is a heuristic, not a quote. Context selection, caching, retries, reasoning tokens, tool execution, and agent behavior can change actual usage substantially. Low estimates multiply raw input and output tokens by ×0.6; high estimates multiply them by ×1.8. Each bound recomputes cost and time, retaining the one-minute minimum. Returned token counts are rounded to integers and costs to four decimal places; displays format dollars to two decimals. Time and cost use the raw scaled token counts before rounding.

`estimateOne` and `estimateAll` are pure functions. `loadModels()` is the separate filesystem helper, resolving the table relative to the module so it works from any directory.

## 📏 Calibration

v0.2 recalibrated the coefficients against real agent runs instead of guesses. The sample is small and specific: 8 measured Codex runs from a single night (2026-11-13), one operator, one model (`gpt-6.1-sol` via Codex), all at small scopes. Treat the fit as indicative for tasks of this size, not as a general law.

The fit set is the 5 runs whose work is code-shaped (scope = files and LOC of the working set). Errors are for the likely estimate of total (input + output) tokens:

| Run (anonymized shape) | Task | Files | LOC | Actual tokens | v0.1 error | v0.2 error |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Greenfield Rust CLI (5 commands, SQLite store) | feature | 6 | 562 | 18,973 | +136% | +27% |
| Greenfield TypeScript CLI (queue tool) | feature | 3 | 307 | 20,029 | +68% | +7% |
| Single-file shell launcher fix (spec-driven) | bugfix | 1 | 172 | 29,677 | +18% | −12% |
| Docs/code-comment alignment fix | docs | 2 | 881 | 10,087 | +308% | +42% |
| Read-only review of a branch diff | bugfix | 20 | 5,229 | 44,128 | +203% | +21% |

What changed and why:

- `READ_TOKENS_PER_FILE` 900 → 150 and `SYSTEM_OVERHEAD_TOKENS` 6000 → 5000. At these scopes the per-round context dominates; agents skim, grep, and read selectively rather than reading every file end to end, so the v0.1 per-file charge overshot by 2–4×.
- New `docs` task type (2 rounds, output ratio 0.2). A spec-driven documentation fix measured far below every code task type; v0.1 had no fitting category for it.
- Rounds, the ×1.25 history-growth factor, the ×0.6/×1.8 range factors, and prices are unchanged — the measured totals already fell inside the low–high band for all 5 fit runs. `test/calibration.test.ts` pins this fixture so future coefficient changes must keep the fit.

Out of fit: the same night produced 3 document-generation runs from a written brief (actuals 61,743 / 95,155 / 144,099 tokens). Two can be expressed as corpus files/prose lines and land at −55% / −71% under this model; the third read a JSON-heavy corpus that files/LOC cannot express at all. Prose generation re-reads its corpus across many turns at roughly per-token cost, which a code-oriented files/LOC model structurally underestimates. Document generation is therefore uncalibrated — do not use these estimates for it.

Extrapolation warning: the fit covers working sets up to ~5,200 LOC. Behavior on large codebases is unvalidated.

## 💲 Model prices

Prices as of 2026-11, from public pricing pages; edit data/models.json to update. Values below use the supplied pricing snapshot. All prices are USD per million tokens.

| Model | Input / 1M | Output / 1M | Output tok/s | Notes |
| --- | ---: | ---: | ---: | --- |
| Claude Opus 4.5 | $5.00 | $25.00 | 55 | |
| Claude Sonnet 4.5 | $3.00 | $15.00 | 75 | |
| GPT-5.1 | $1.25 | $10.00 | 90 | |
| GPT-5.1 Codex | $1.25 | $10.00 | 90 | Codex variant, priced as GPT-5.1 |
| Gemini 3 Pro | $2.00 | $12.00 | 110 | Standard tier, prompts up to 200k tokens |
| DeepSeek V4 Pro | $0.66 | $1.98 | 70 | Off-peak rate; peak is 2x |
| DeepSeek V4.1 Flash | $0.15 | $0.60 | 100 | Off-peak rate; peak is 2x |
| Codestral 2508 | $0.30 | $0.90 | 130 | |

## 🌐 Web UI

Run `bun run src/cli.ts serve`, then open <http://localhost:3939>. Change files, LOC, or task to compare live low/likely/high costs and likely minutes. The page is self-contained with a dark theme and no external resources.

The primary path uses `GET /api/models` and `GET /api/estimate?files=120&loc=8000&task=feature`. Invalid estimate inputs return JSON with status 400; unknown routes and non-GET requests return JSON with status 404.

You can also open `web/index.html` directly with `file://`. Failed fetches switch to its embedded pricing snapshot and JavaScript estimator. `data/models.json` is the editable pricing source of truth; when updating prices, refresh the embedded JSON snapshot in `web/index.html` and this README's table. Keep the offline formulas in sync with `src/estimate.ts`.

## 🧪 Tests

```sh
bun test
```

Tests cover monotonic cost growth, range ordering for every model and task, task differences, a hand-derived golden case, sorted finite positive estimates for all eight models, and the calibration fixture (`test/calibration.test.ts`) that keeps the likely estimate within ±50% of the measured runs.

## 📁 Project structure

```text
vibe-estimate/
├── assets/logo.png        # Project logo
├── data/models.json       # Editable price source
├── src/estimate.ts        # Pure estimator and separate price loader
├── src/cli.ts             # CLI and Bun HTTP server
├── web/index.html         # Self-contained UI and offline snapshot
├── test/estimate.test.ts  # Bun tests
├── test/calibration.test.ts # Measured-run calibration fixture
├── package.json
├── tsconfig.json
├── .gitignore
├── README.md
└── LICENSE
```

## 📄 License

[MIT](LICENSE) © 2026 souta-lab.
