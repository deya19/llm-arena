import posthog from "posthog-js";

type AnalyticsValue = string | number | boolean | null;
type AnalyticsProperties = Readonly<Record<string, AnalyticsValue>>;

export type AnalyticsEvent =
  | "page_viewed"
  | "arena_viewed"
  | "leaderboard_viewed"
  | "leaderboard_scope_changed"
  | "model_picker_opened"
  | "model_selection_changed"
  | "thread_opened"
  | "public_thread_viewed"
  | "shared_link_opened"
  | "signed_up"
  | "new_thread_started"
  | "share_link_copied"
  | "thread_visibility_changed"
  | "sign_in_prompted"
  | "prompt_validation_failed"
  | "comparison_started"
  | "comparison_cancelled"
  | "comparison_start_failed"
  | "model_stream_started"
  | "model_stream_failed"
  | "model_stream_cancelled"
  | "model_catalog_loaded"
  | "model_catalog_failed"
  | "model_catalog_retry_clicked"
  | "model_picker_closed"
  | "model_search_used"
  | "model_selection_limit_reached"
  | "thread_load_failed"
  | "thread_load_retry_clicked"
  | "thread_cache_restored"
  | "follow_up_prompt_submitted"
  | "share_attempted"
  | "share_failed"
  | "vote_attempted"
  | "vote_succeeded"
  | "vote_duplicate"
  | "vote_failed"
  | "navigation_clicked"
  | "theme_changed";

export const captureAnalyticsEvent = (
  event: AnalyticsEvent,
  properties: AnalyticsProperties = {},
): void => {
  if (typeof window === "undefined" || !posthog.__loaded) {
    return;
  }

  posthog.capture(event, properties);
};
