# Scope: LLM Arena

Send one prompt, watch up to three AI models answer it at the same time, and vote for the best one. Over time those votes and the real per-call numbers, speed, tokens, cost, build an honest leaderboard of which model is actually worth using.

Build it in a thin, working slice first, one prompt actually reaching a model and coming back, before making any single part of it fuller. Then thicken it piece by piece. Before building anything, decide what you're doing and why in a few plain sentences, then build it, and if the plan turns out wrong once it's actually built, say so and fix the plan too, not just the code.

Whenever a "build it" style step actually gets underway, break it into its own short list of what's genuinely being done, and check each part off as it's finished, right in this file. That way this file can be opened fresh, in a brand new conversation, and it's obvious what's already done and what's still left, without anyone re-explaining the feature from scratch.

## Stack

Already decided, nothing open here: Next.js (App Router), TypeScript, Tailwind, shadcn for components (card, button, popover, loading skeleton, and whatever else the UI actually needs as it gets built), Prisma with Postgres, Clerk for auth, Arcjet in front of the endpoint, PostHog for analytics and observability.

## Sketches

There are rough hand-drawn sketches for the arena screen, the leaderboard, and the models page. Treat them as structure only, where things sit, what exists on the page, not as the final design or the actual colors, all of that is already decided elsewhere in this file. If something in a sketch genuinely contradicts what's written here, stop and ask which one actually wins rather than guessing.

## At a glance

| #   | Feature                                     | Phase      | Status      |
| --- | ------------------------------------------- | ---------- | ----------- |
| 1   | Connecting to a model                       | Foundation | complete    |
| 2   | Coding standards & tooling                  | Foundation | not started |
| 3   | Data model                                  | Foundation | complete    |
| 4   | Design & look                               | Foundation | not started |
| 5   | Model picker                                | Slice 1    | not started |
| 6   | Send a prompt, parallel streams, and voting | Slice 1    | not started |
| 7   | App shell & thread history                  | Slice 2    | not started |
| 8   | Public thread visibility & sharing          | Slice 3    | not started |
| 9   | Leaderboard: global & personal              | Slice 4    | not started |

## Foundation

### 1. How the app actually connects to a model

The Next.js project itself gets created manually first, `create-next-app`, fast and simple, no reason to spend agent time or tokens on something that easy.

Use the Vercel AI SDK with `@openrouter/ai-sdk-provider` for all model calls, keeping the OpenRouter key and provider setup on the server. The connection layer owns request validation, streaming, cancellation, usage metadata, and normalized client-safe errors.

Each selected model gets its own request and its own upstream OpenRouter stream. The browser will later open up to three independent streams, so a slow or failed model cannot terminate the other models' streams. The first thin slice proves one prompt can reach one configured free-tier model and stream its response back; model selection and three-model fan-out belong to later features.

`OPENROUTER_API_KEY` is required at startup. Provider failures are logged on the server and exposed to the client only as a plain retryable message. Final usage and timing metadata are preserved for the response UI and the future PostHog per-call LLM analytics. Prisma and Arcjet are integrated at their foundation boundaries; Clerk and PostHog remain pending until their corresponding features are built.

- [x] Decide the approach
- [x] Write the spec

Build checklist:

- [x] Add server-side OpenRouter configuration and startup validation
- [x] Add one-model free-tier streaming route with independent cancellation and safe errors
- [x] Preserve final usage and timing events for the future arena UI
- [x] Verify lint, typecheck, build, and a real request

Lint, typecheck, and build pass. A real request reached the configured OpenRouter free-tier model, streamed the response back, and preserved usage and timing metadata. The credential blocker is resolved; this foundation feature is complete.

### 2. Coding standards & tooling

Write down the real conventions for this project once it actually exists, then install linting, formatting, and a pre-commit hook that actually enforces them.

- [ ] Decide the approach
- [ ] Install lint, format, and whatever else is needed, and write it up in a coding-standards doc

### 3. Data model

The core things every feature depends on: users tied to Clerk, threads, each model's own messages inside a thread, and votes. A vote should only ever be possible on a turn where two or more models actually answered.

Decision: Use Clerk's stable user ID as the local `User` primary key. Store a thread's ordered prompts as `Turn` records, each model's prompt/answer history and measured usage as `Message` records, and votes as one unique choice per user per turn. The composite message/turn relation keeps a vote tied to the selected message's turn; application logic will enforce that only completed assistant messages on turns with at least two completed answers can be voted on.

- [x] Decide the approach
- [x] Build the schema and Prisma config
- [x] Run the initial migration and generate the client

Build checklist:

- [x] Add Clerk-backed users, threads, ordered turns, per-model messages, and votes
- [x] Add usage, latency, token-rate, and zero-cost fields to model messages
- [x] Add Prisma 7 schema and datasource configuration
- [x] Apply the initial migration to the configured Postgres database
- [x] Generate and verify the Prisma client

### 4. Design & look

A coffee or dark brown background, warm, not neutral gray or true black. One accent color, rust, used only for things you interact with, buttons, links, focus states, the win-rate bar, never as decoration. Because the background and the accent are both warm tones from the same family, the accent has to stay clearly brighter and more saturated than the background, enough that a button never blends into the page behind it, that's a real risk with two warm colors this close and worth checking by eye, not just by the numbers. Blue, indigo, and purple are never the accent, under any circumstance. Green is reserved only for marking a winner, red only for errors, never reused for anything else. Contrast should genuinely hold up in both light and dark mode, not just look fine at a glance.

- [ ] Decide the approach
- [ ] Build it

## Slice 1: Core arena loop

### 5. Model picker

An "Add model" popover pulling OpenRouter's live free-tier list, sorted by context window, capped at three models, defaulting to all three selected, with removable chips next to the prompt box. Also render that same catalog as a simple `/models` page, name, context window, and pricing for each one, so anyone can browse the full list without opening the picker.

- [ ] Decide the approach
- [ ] Build it

### 6. Send a prompt, parallel streams, and voting

The heart of the product. One prompt goes to every selected model at once, each streaming and failing independently, so one being slow or down never blocks the others. Each answer shows its own real time-to-first-token, tokens per second, and total tokens. No cost shown, every model here is free tier, so it would always read zero. A vote only exists once two or more models have answered, and picking one writes exactly one vote and marks that answer as the winner, while every answer stays visible the whole time. A follow-up continues each model's own separate conversation.

Arcjet sits in front of this endpoint before any model is ever called: rate limiting, bot protection, and a shield against prompt injection, plus a real limit on how much one person can use across all three models at once, not just a limit on the endpoint overall.

Every prompt sent, every answer finishing, and every vote cast should be tracked as a real PostHog event, so there's an honest funnel from prompt to answer to vote. A model failing should also be logged properly on the server, not just shown to the user and forgotten. Separately from that funnel, every actual model call should also be wrapped so PostHog captures its own real tokens, cost, and latency per call, that's PostHog's own LLM analytics, not the same thing as the funnel events or the numbers already shown on the response card.

Decision: Use the request-based `@arcjet/next` client at the API boundary. Keep a live Shield rule on the shared client, then layer live bot detection, prompt-injection detection, and a ten-request-per-minute IP sliding window with `withRule()`. The Decide client uses a five-second timeout so local development does not turn ordinary network latency into an error decision. Denials return a plain client-safe message; Arcjet evaluation errors fail open as recommended by the SDK so a temporary Arcjet outage does not take down model access. `ARCJET_KEY` is local-only in `.env.local`, and `ARCJET_ENV=development` is needed for local IP fingerprinting.

- [x] Decide the approach
- [x] Build it

Build checklist:

- [x] Create the `llm-arena` Arcjet site and add the local `ARCJET_KEY`
- [x] Add the shared Arcjet client with live Shield, bot, prompt-injection, and rate-limit rules
- [x] Protect `/api/model` before the OpenRouter stream starts
- [x] Map rate-limit, prompt-injection, and other denials to safe responses
- [x] Run lint, strict typecheck, and production build
- [x] Confirm a live Arcjet rate-limit denial in the Console after the decision service is reachable

A controlled test with one stable IP sent 12 sequential requests. Requests 1–10 were allowed, and requests 11–12 returned HTTP 429 with the safe rate-limit message. Arcjet reported `max: 10`, `remaining: 0`, and `DENY` for the final requests. The route parses a request clone so Arcjet receives the untouched `NextRequest` for body processing. Prompt-injection evaluation still returned an Arcjet service error during this test and failed open; that is separate from the verified rate-limit rule.

## Slice 2: App shell & thread history

### 7. App shell & thread history

The frame everything else sits inside: a top bar and sidebar that stay in place while the page scrolls, the thread's name, and each model's win record shown right there (shrinking down to a small dot and number if it gets crowded). The sidebar lists a signed-in user's own past threads so the tool actually feels usable across visits, not just in one sitting.

- [ ] Decide the approach
- [ ] Build it

## Slice 3: Public visibility & sharing

### 8. Public thread visibility & sharing

Anyone should be able to open a thread's link and see it, without an account, that's what actually makes it shareable. Only sending a prompt and voting need sign-in. A made-up or deleted thread just shows a plain not-found page either way. The thread's real owner sees everything everyone else sees, plus the ability to actually use it.

- [ ] Decide the approach
- [ ] Build it

## Slice 4: Leaderboard

### 9. Leaderboard: global & personal

Two leaderboards from the same votes, one for everyone, one just for the signed-in user. Each row's win rate is the big, bold number, in the accent color, with a small bar next to it, always written as "won 4 of 5," never a bare percentage or a made-up score. Smaller, quieter numbers underneath for average speed and time-to-first-token, each clearly labeled. No cost or "cheapest" stat, every model is free, so that number never means anything here. First place gets a subtle highlight, nobody else does.

- [ ] Decide the approach
- [ ] Build it

## Not doing right now

Kept here so the plan stays honest about what's deliberately left out.

- A "fastest" label on the leaderboard, tagging whichever model already has the best average speed, only for models with enough votes to mean anything. Nice to have, not required.
- Giving each model's own little icon a distinct look instead of plain gray. Nice to have, not required.
- Privacy policy and terms pages.
- Rich link previews when a thread gets shared somewhere.
- Any kind of admin or moderation page.
- A public API for the leaderboard data. Nobody's asked for this.
