import { PostHog } from "posthog-node";

type AnalyticsProperties = Readonly<Record<string, string | number | boolean | null>>;

const posthogKey =
  process.env.POSTHOG_API_KEY?.trim() || process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
const posthogHost = process.env.POSTHOG_HOST?.trim() || "https://us.i.posthog.com";
const posthog =
  posthogKey === undefined ? null : new PostHog(posthogKey, { host: posthogHost });

const capture = (
  distinctId: string,
  event: string,
  properties: AnalyticsProperties,
): void => {
  if (posthog === null) {
    return;
  }

  posthog.capture({ distinctId, event, properties });
};

export const trackPromptSubmitted = (
  userId: string,
  properties: Readonly<{
    threadId: string;
    turnId: string;
    modelCount: number;
  }>,
): void => {
  capture(userId, "prompt_submitted", properties);
};

export const trackModelResponseCompleted = (
  userId: string,
  properties: Readonly<{
    threadId: string;
    turnId: string;
    messageId: string;
    model: string;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    timeToFirstTokenMs: number | null;
    durationMs: number;
    tokensPerSecond: number | null;
  }>,
): void => {
  capture(userId, "model_response_completed", properties);
  capture(userId, "$ai_generation", {
    $ai_model: properties.model,
    $ai_provider: "openrouter",
    $ai_input_tokens: properties.inputTokens,
    $ai_output_tokens: properties.outputTokens,
    $ai_total_tokens: properties.totalTokens,
    $ai_latency: properties.durationMs / 1000,
    $ai_time_to_first_token: properties.timeToFirstTokenMs,
    $ai_tokens_per_second: properties.tokensPerSecond,
    $ai_total_cost_usd: 0,
  });
};

export const trackModelResponseFailed = (
  userId: string,
  properties: Readonly<{
    threadId: string;
    turnId: string;
    messageId: string;
    model: string;
  }>,
): void => {
  capture(userId, "model_response_failed", properties);
};

export const trackVoteCast = (
  userId: string,
  properties: Readonly<{
    threadId: string;
    turnId: string;
    messageId: string;
    result: "created" | "already-voted";
  }>,
): void => {
  capture(userId, "vote_cast", properties);
};
