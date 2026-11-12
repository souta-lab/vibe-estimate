# vibe-estimate

Estimate API-key-based vibe coding costs and time across eight LLM coding models, with a dependency-free Bun CLI and web UI.

![Bun](https://img.shields.io/badge/Bun-runtime-black) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6) ![License MIT](https://img.shields.io/badge/License-MIT-green) ![Prices as of 2026-11](https://img.shields.io/badge/prices--as--of-2026--11-blue)

## 🧭 Table of contents

- [✨ Features](#-features)
- [🚀 Install & Usage](#-install--usage)
- [🧮 How the estimate works](#-how-the-estimate-works)
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

Files and LOC must be positive safe integers. Task must be `feature`, `bugfix`, `refactor`, or `tests`. Missing or invalid CLI arguments exit with status 1 and usage text. Unknown model IDs also list available IDs. `bun start` runs the CLI; supply a command after it.

## 🧮 How the estimate works

Scope means the files and lines of code the agent is expected to work with, rather than just the lines it will change.

| Task | Rounds | Output tokens per LOC |
| --- | ---: | ---: |
| feature | 3 | 0.9 |
| bugfix | 4 | 0.35 |
| refactor | 3 | 1.1 |
| tests | 2 | 0.7 |

Constants and full formula:

```text
SYSTEM_OVERHEAD_TOKENS = 6000
READ_TOKENS_PER_FILE = 900
READ_TOKENS_PER_LOC = 0.3
EDIT_TOKENS_PER_FILE = 60

readTokens = files × 900 + loc × 0.3
perRoundInput = 6000 + readTokens
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

Tests cover monotonic cost growth, range ordering for every model and task, task differences, a hand-derived golden case, and sorted finite positive estimates for all eight models.

## 📁 Project structure

```text
vibe-estimate/
├── data/models.json       # Editable price source
├── src/estimate.ts        # Pure estimator and separate price loader
├── src/cli.ts             # CLI and Bun HTTP server
├── web/index.html         # Self-contained UI and offline snapshot
├── test/estimate.test.ts  # Bun tests
├── package.json
├── tsconfig.json
├── .gitignore
├── README.md
└── LICENSE
```

## 📄 License

[MIT](LICENSE) © 2026 souta-lab.
