# PostHog Self-driving Setup Report

_LLM Arena · 2026-08-11_

## Summary

PostHog Self-driving has been configured for LLM Arena. GitHub is connected so Self-driving can research findings in your code; 6 signal sources are wired to the inbox; 5 scouts are enabled (general + 4 specialists); and 2 Replay Vision scanners are armed and waiting for recordings. Findings will start appearing in your [Self-driving inbox](https://us.posthog.com/project/552554/inbox) within ~30 minutes of the first scout runs firing.

---

## AI data processing

**Status:** Approved (enforced by the wizard before this run started).

---

## GitHub

| | |
|---|---|
| **Account** | deya19 |
| **Integration ID** | 211784 |
| **Status** | Connected during this run |

Self-driving uses this to research findings in your repository and open draft fix PRs.

---

## Products enabled

The `products-enable` API tool was not available on this deploy. Products must be switched on manually in PostHog settings (see Follow-ups).

| Product | Status | Notes |
|---|---|---|
| Session Replay | Not enabled (manual step needed) | Settings → Session replay → "Record user sessions" |
| Error Tracking | Not enabled (manual step needed) | Settings → Error tracking → "Enable exception autocapture" |
| Support (Conversations) | Not enabled (manual step needed) | Product sidebar → Support |

**posthog.init() check:** No `posthog.init()` call was found in the repo — PostHog JS is installed as a dependency but not yet initialized. No client-side overrides to fix, but initialization itself is a required follow-up before any product data flows.

**Support note:** Once Conversations is enabled, tickets only reach the inbox after you connect an inbound channel (email, inbox, or Slack) in PostHog.

---

## Signal sources

| source\_product | source\_type | Action | Notes |
|---|---|---|---|
| `signals_scout` | `cross_source_issue` | On by default | Scout gate — no config row needed; scout findings reach the inbox automatically |
| `health_checks` | `health_issue` | Created, enabled | ID: 019ff092-8a3a-7648-9f62-a98e41557ead |
| `error_tracking` | `issue_created` | Created, enabled | ID: 019ff092-8e61-738c-8c5f-e12d76b79b0f |
| `error_tracking` | `issue_reopened` | Created, enabled | ID: 019ff092-911b-7f6d-acc6-d0197ed9e322 |
| `error_tracking` | `issue_spiking` | Created, enabled | ID: 019ff092-93f5-7c52-813a-a7f7dc7861f4 |
| `session_replay` | `session_analysis_cluster` | Created, enabled | ID: 019ff092-998e-73f9-a359-219a8d3282ff — default sample rate 10% |
| `conversations` | `ticket` | Created, enabled | ID: 019ff092-9c6a-778f-85ce-2bdf25f3d895 — dormant until an inbound channel is connected |
| `llm_analytics` | — | Skipped | Internal-only, not a user-facing responder |
| `logs` | — | Skipped | Not a v1 responder |
| `replay_vision` | — | Skipped | Self-authorizing via `emits_signals` on each scanner; no config row needed |

---

## Connected tools

The connected-tools ask was declined ("None of these"). No external issue tracker, error tracker, or support desk was connected.

| Tool | Status |
|---|---|
| All external tools | Not used — user declined |

---

## Scout troop

**Run budget:** 100 runs/day max · 0 used today · 100 remaining  
**Early-access banner:** "Scouts are in early access. Each project gets up to 100 scout runs a day. Contact team-self-driving@posthog.com if you need more."

### Enabled (5 of 27)

| Scout | Reason kept on |
|---|---|
| `signals-scout-general` | Always on — watches cross-product correlations and surfaces no specialist covers |
| `signals-scout-ai-observability` | LLM Arena's core product surface: every model call is an AI generation event; scope.md explicitly plans PostHog LLM analytics for token/latency/cost per call |
| `signals-scout-product-analytics` | Prompt → answer → vote funnel explicitly planned in scope; will watch saved funnel insights once they're created |
| `signals-scout-health-checks` | PostHog not yet initialized in the app; instrumentation gaps expected on a fresh project |
| `signals-scout-observability-gaps` | Product events planned but not yet captured; this scout will flag uncovered event volumes once events start flowing |

### Disabled (22 of 27)

| Scout | Reason |
|---|---|
| `signals-scout-error-tracking` | Covered by the native error-tracking signal source (step 4) — duplicate |
| `signals-scout-session-replay` | Covered by the native session-replay signal source (step 4) — duplicate |
| `signals-scout-web-analytics` | No UTM/referrer tracking in scope for current build phase |
| `signals-scout-feature-flags` | No feature flags in scope yet |
| `signals-scout-experiments` | No A/B experiments in scope yet |
| `signals-scout-surveys` | Surveys not in scope |
| `signals-scout-revenue-analytics` | No payment SDK or revenue data |
| `signals-scout-logs` | PostHog logs product not in use |
| `signals-scout-csp-violations` | No CSP reporting configured |
| `signals-scout-customer-analytics` | No group/accounts analytics |
| `signals-scout-data-pipelines` | No CDP destinations or hog flows |
| `signals-scout-data-warehouse` | No warehouse sources connected |
| `signals-scout-anomaly-detection` | Not in top 5 — enable if dashboards accumulate later |
| `signals-scout-apm` | No OpenTelemetry spans |
| `signals-scout-conversations` | No Conversations data yet |
| `signals-scout-inbox-validation` | Fresh setup — no resolved reports to validate |
| `signals-scout-insight-alerts` | No insight alerts configured yet |
| `signals-scout-mcp-tool-calls` | No MCP tool-call telemetry in scope |
| `signals-scout-replay-vision` | No accumulated observations yet (scanners created this run) |
| `signals-scout-skills-store` | Not applicable to this project |
| `signals-scout-tasks` | Not applicable at this stage |
| `signals-scout-web-vitals` | No Core Web Vitals captured yet |

**Re-enable follow-ups:** Enable `signals-scout-web-analytics` if UTM/referrer tracking is added; `signals-scout-feature-flags` when flags are introduced; `signals-scout-experiments` when A/B tests start.

---

## Custom scouts

**Gap analysis performed.** One candidate survived all three filters (watchable, uncovered, quality bar):

- **Arena vote funnel** (`signals-scout-arena-vote-funnel`) — would watch the prompt→answer→vote conversion rate and speak up when the 7-day vote-to-prompt ratio drops more than 15% below its 14-day baseline. Not covered by `signals-scout-product-analytics` (which reads saved funnel insights — none exist on a fresh project) or `signals-scout-ai-observability` (which watches LLM performance metrics, not product-funnel conversion). **Proposed, declined by user.**

Surfaces ruled out:
- **Model performance regressions** — covered by `signals-scout-ai-observability` (watches cost, latency, errors per model)
- **Model error rates** — covered by ai-observability + error-tracking native source
- **Leaderboard integrity** — not ready; couldn't define a concrete discriminator without seeing the vote data first
- **Arcjet rate-limit signals** — not watchable without specific PostHog events

**Custom scouts created:** None (user declined the proposal).

**Noise escape hatch:** If any scout turns noisy, set `emit: false` on its config in PostHog to switch it to dry-run — it keeps running and logging but writes nothing to the inbox.

---

## Replay Vision scanners

A scanner is an LLM that watches individual session recordings on a schedule and pushes what it finds directly to the Self-driving inbox. Findings arrive at half weight; a report is promoted when corroborating findings reach a full weight — so two scanners with disjoint queries provide independent coverage.

Both scanners use `model: gemini-3.6-flash` and `emits_signals: true`. The project has no recordings yet; scanners are armed and start working the day recordings begin.

| Scanner | Query scope | Sampling | Est. credits/month | Status |
|---|---|---|---|---|
| **Broken experiences** | Sessions entering the arena root path (`$entry_pathname = "/"`) — where the prompt submission and vote completion flow live | 0.5 (50% of matching sessions) | 0 (no recordings yet) | Created — ID: 019ff09e-dc8b-73ad-8998-8b84594f062e |
| **User frustration** | Sessions containing a `$rageclick` event (any URL) | 1.0 (all rage-click sessions — gate is narrow so this is cheap) | 0 (no recordings yet) | Created — ID: 019ff09e-ea34-74f6-b038-0dad6e5f7383 |

**Why `/` for scanner 1:** The arena is the app's only page and its key completion flow (prompt → model responses → vote) all happens at the root path. There is no separate `/checkout` or `/signup` path at this stage.

**Why the queries don't overlap:** Scanner 1 filters by URL (entry path = `/`); scanner 2 filters by behavior (`$rageclick`). Rage-click sessions that also entered via `/` will be seen by both, but rage-click sessions are a narrow slice and the overlap at these defaults is acceptable. Neither query was widened.

**Spend note:** The `creating-replay-vision-scanners` sizing skill was not available on this deploy, so credit spend was not formally verified. At these defaults (scoped query + sampling_rate ≤ 0.5) projected spend is negligible until the project has significant recording volume.

---

## Follow-ups

- [ ] **Enable Session Replay** in PostHog: Settings → Session replay → "Record user sessions"
- [ ] **Enable Error Tracking** in PostHog: Settings → Error tracking → "Enable exception autocapture"
- [ ] **Enable Support (Conversations)** in PostHog: Product sidebar → Support
- [ ] **Initialize PostHog JS** in the app — `posthog.init()` is missing; no events will flow until the SDK is initialized (check `features/` or `app/layout.tsx` for where to add it)
- [ ] **Connect an inbound channel** for Support (email, inbox, or Slack) in PostHog so tickets reach the inbox — the `conversations/ticket` source is enabled but dormant until a channel exists
- [ ] **Revisit the vote funnel scout** (`signals-scout-arena-vote-funnel`) once the arena is instrumented and the prompt→vote funnel events are flowing — the proposed scout body is ready to create if engagement drops become hard to diagnose
- [ ] **Enable `signals-scout-web-analytics`** if UTM or referrer tracking is added
- [ ] **Enable `signals-scout-feature-flags`** when feature flags are introduced
- [ ] **Enable `signals-scout-experiments`** when A/B tests are started
- [ ] **Verify Replay Vision credit spend** once recordings exist — open the scanner pages in PostHog to see estimated monthly credits after the first sweep

---

## What happens next

- The scout coordinator picks up the 5 enabled scouts within **~30 minutes** and fires their first runs
- Each run draws from the 100-run daily budget; at 5 scouts the troop uses about 5% of the daily budget
- Findings cluster into reports in your [Self-driving inbox](https://us.posthog.com/project/552554/inbox)
- Actionable reports can trigger automatic fix tasks — Self-driving opens a draft PR per fixable issue
- Replay Vision scanners start observing the moment session recordings exist; each observation costs 15 credits
