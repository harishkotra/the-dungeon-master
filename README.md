# The Dungeon Master 🐉

**An AI-powered text adventure where a large language model is the game.** You pick a world and a difficulty, type free-text actions ("look around", "take the sword", "barge through the door"), and an LLM dungeon master narrates the consequences — tracking your health, inventory, location and quest flags across the whole run. Every playthrough is different.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [The API contract](#the-api-contract)
- [How state tracking works](#how-state-tracking-works)
- [Getting started](#getting-started)
- [Forking & contributing](#forking--contributing)
- [Feature ideas](#feature-ideas)
- [Project structure](#project-structure)

---

## Features

| | |
|---|---|
| 🎲 **Five worlds** | Fantasy, Sci-Fi, Horror, Pirate and Western — each with its own setting seed, win condition and accent color that re-tints the entire UI. |
| ⚙️ **Three difficulties** | Easy / Normal / Hard are injected into the system prompt as behavioral guidance (HP loss, clue generosity, hazard cunning). |
| 📜 **Streaming narration** | The DM's prose streams in token-by-token with a blinking caret and a "The DM deliberates…" indicator. |
| 🎒 **Live character sheet** | HP gauge (animated, color-coded), inventory list, location, turn counter and quest flags — all parsed from the model's own state line, never hardcoded. |
| 💀 **Win / lose detection** | `YOU WIN` / `GAME OVER` markers (or HP ≤ 0) trigger an ending screen with a run summary: turns taken, items found, final location. |
| 💡 **Hint system** | A "no spoilers" nudge request that goes through the same DM turn loop. |
| 💾 **Resume on refresh** | The entire save — conversation, state, turn count — lives in `localStorage` under `dm.save.v1`. |
| 🛡️ **Graceful failure** | Network errors roll back the turn so you can retry your action; a missing `STATE:` line keeps the previous state and the game continues. |

## Tech stack

- **[React 19](https://react.dev)** — UI, with hooks-only state management (no Redux/Zustand needed at this size).
- **[TypeScript](https://www.typescriptlang.org)** in strict mode — `tsc -b` runs before every build.
- **[Vite 7](https://vite.dev)** — dev server, production bundler, and (critically) the **API proxy** that sidesteps CORS.
- **Zero runtime dependencies beyond React** — no UI kit, no state library, no markdown renderer. All styling is hand-rolled CSS using modern platform features:
  - `@property` to register `--accent` as a real `<color>` so theme changes **interpolate** instead of snapping;
  - `color-mix(in srgb, …)` for derived tints (borders, glows, chips) from a single accent variable;
  - `prefers-reduced-motion` gates on every animation.
- **Fonts:** Cinzel (engraved display), EB Garamond (narration prose), JetBrains Mono (the "machine" voice — stats, chips, state).

## Architecture

```
┌────────────────────────── Browser ──────────────────────────┐
│                                                             │
│  StartScreen ──▶ App (turn loop) ──▶ GameOverScreen         │
│                     │                                       │
│        ┌────────────┼─────────────┐                         │
│        ▼            ▼             ▼                         │
│   Sidebar      History log   Composer (action / hint)       │
│                                                             │
│  src/lib/game.ts        src/lib/chatClient.ts               │
│  · genre defs           · streamChat()                      │
│  · systemPrompt()       · stripStats()                      │
│  · splitDMReply()       · listModels()                      │
│  · trimForApi()                                             │
│        │                        │                           │
│        └────── localStorage ◄───┘                           │
│              (dm.save.v1)                                   │
└──────────────────────────┬──────────────────────────────────┘
                           │  POST /api/chat  (same-origin)
                           ▼
┌───────────────────── Vite dev/preview ──────────────────────┐
│  proxy: /api ──▶ https://chatjimmy.ai                       │
│  (the API sends no CORS headers, so the browser must        │
│   never talk to it cross-origin)                            │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌──────────────────── chatjimmy.ai ───────────────────────────┐
│  POST /api/chat   → plain-text chunked stream, terminated   │
│                     by a <|stats|>{…}<|/stats|> sentinel    │
│  GET  /api/models → { data: [{ id: "llama3.1-8B" }] }       │
└─────────────────────────────────────────────────────────────┘
```

### The turn loop

One DM turn is: inject state → send history → stream reply → parse state → persist.

```
player action ──▶ systemPrompt(genre, difficulty, state)
                   + trimmed history (first message + last ~20)
                   + user turn
                        │
                        ▼  streamChat(onDelta → patch last message)
                 raw reply text
                        │
                        ▼  splitDMReply()
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
   narration      STATE: HP=80,     "GAME OVER" /
   (rendered)     inventory=[…]     "YOU WIN" marker
                  → new GameState   → ending screen
                        │
                        ▼
              localStorage save
```

## The API contract

The chat endpoint is **not** OpenAI-compatible and **not** SSE-framed,
despite returning `content-type: text/event-stream`. The body is raw
text chunks concatenated in order, terminated by a stats sentinel:

```
POST /api/chat
{
  "chatOptions": { "selectedModel": "llama3.1-8B" },
  "messages": [
    { "role": "system", "content": "…DM prompt + CURRENT STATE block…" },
    { "role": "user",   "content": "look around" }
  ],
  "stream": true
}

response body (plain text chunks):
  You push open the door. A cold draught…<|stats|>{"done":true,…}<|/stats|>
```

The client (`src/lib/chatClient.ts`) handles all of this:

```ts
export async function streamChat({ messages, model, onDelta, signal }: StreamChatOptions) {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatOptions: { selectedModel: model }, messages, stream: true }),
    signal,
  })
  if (!res.ok) return parseError(res)

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let raw = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    raw += decoder.decode(value, { stream: true })
    onDelta?.(stripStats(raw))          // sentinel stripped on every frame
  }
  return stripStats(raw + decoder.decode())
}
```

## How state tracking works

Every DM reply must end with a machine-readable line (enforced by the system prompt, which also injects the *current* state so the model can diff against it):

```
STATE: HP=80, inventory=[rusty key, torch], location=cave entrance, flags={door_open:false}
```

`splitDMReply()` finds the **last** `STATE:` line (the model occasionally
emits more than one), parses it, and strips it from the narration:

```ts
export function splitDMReply(raw: string): SplitReply {
  const matches = [...raw.matchAll(/^[ \t*>]*STATE\s*:[^\n]*/gim)]
  let narration = raw
  let nextState: GameState | null = null

  if (matches.length > 0) {
    const last = matches[matches.length - 1]
    nextState = parseStateLine(last[0])
    narration = (raw.slice(0, last.index) + raw.slice(last.index + last[0].length)).trim()
  }

  let outcome: Outcome | null = null
  if (/\bYOU\s+WIN\b/i.test(narration)) outcome = 'win'
  else if (/\bGAME\s+OVER\b/i.test(narration)) outcome = 'lose'
  else if (nextState && nextState.hp <= 0) outcome = 'lose'

  return { narration, nextState, outcome }
}
```

**Failure modes are handled:** if the line is missing or malformed, the
previous `GameState` is kept and the game continues; HP is clamped to
0–100; unknown flag values fall back to strings.

## Getting started

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # tsc -b && vite build → dist/
pnpm preview    # serve the production build on :4173
```

Requirements: Node 18+ and pnpm (or npm — any package manager works).

## Forking & contributing

1. **Fork** the repo, then:
   ```bash
   git clone https://github.com/harishkotra/the-dungeon-master.git
   cd the-dungeon-master
   pnpm install
   pnpm dev
   ```
2. **Branch** with a descriptive name: `feat/dice-rolls`, `fix/hp-clamping`.
3. **Make your change.** The codebase is small and documented:
   - game rules & parsing → `src/lib/game.ts`
   - API transport → `src/lib/chatClient.ts`
   - screens & components → `src/App.tsx`, `src/components/`
   - theme → `src/styles.css` (all colors derive from `--accent`)
4. **Verify:** `pnpm build` must pass (it runs `tsc -b` first). Test at
   least one full game loop against the live endpoint.
5. **Open a PR** describing what changed and why. Screenshots welcome
   for UI changes.

### Feature ideas (good first issues)

- **Dice mechanics** — ask the DM to end each reply with a `ROLL: d20+2=14` line and gate risky actions on it.
- **Character classes / races** — extend the start screen and seed the system prompt with class abilities.
- **ASCII map panel** — parse a `MAP:` line into a small grid in the sidebar.
- **Multiple save slots** — the save key is already versioned (`dm.save.v1`); add slot selection.
- **Model picker** — `listModels()` is already implemented but unused; wire it to a dropdown.
- **Sound design** — subtle ambient loop per genre, muted by default.
- **Export transcript** — download the run as Markdown.
- **Tests** — `game.ts` parsing logic is pure and trivially unit-testable; that's the highest-value first test.

## Project structure

```
├── index.html                  # fonts, favicon, root
├── vite.config.ts              # React plugin + /api proxy (dev & preview)
├── tsconfig.json               # strict TS, bundler resolution
├── src/
│   ├── main.tsx                # entry
│   ├── App.tsx                 # screen state machine + turn loop
│   ├── styles.css              # the whole theme (candlelit table)
│   ├── components/
│   │   ├── StartScreen.tsx     # genre + difficulty picker
│   │   ├── Sidebar.tsx         # character sheet (HP / inventory / flags)
│   │   └── GameOverScreen.tsx  # ending overlay + run summary
│   └── lib/
│       ├── chatClient.ts       # shared API client (streaming + sentinel)
│       └── game.ts             # genres, DM prompt, STATE parser, trimming
└── README.md
```