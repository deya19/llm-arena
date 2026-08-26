"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, type ReactNode } from "react";
import { captureAnalyticsEvent } from "@/features/analytics/browser-analytics";

const posthogKey =
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim() ||
  process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
const posthogHost =
  process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";

let isPostHogInitialized = false;

const initializePostHog = (): boolean => {
  if (isPostHogInitialized || posthogKey === undefined) {
    return isPostHogInitialized;
  }

  posthog.init(posthogKey, {
    api_host: posthogHost,
    autocapture: false,
    capture_pageleave: true,
    capture_pageview: false,
    persistence: "localStorage+cookie",
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: ".posthog-mask",
    },
  });
  isPostHogInitialized = true;
  return true;
};

const SIGNUP_TRACKING_WINDOW_MS = 24 * 60 * 60 * 1000;
const SIGNUP_TRACKING_KEY = "llm-arena:signup-tracked";

function PostHogIdentity() {
  const { isLoaded, userId } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const identifiedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isPostHogInitialized) {
      return;
    }

    if (userId !== null) {
      if (identifiedUserId.current !== userId) {
        posthog.identify(userId);
        identifiedUserId.current = userId;
      }
      return;
    }

    if (identifiedUserId.current !== null) {
      posthog.reset();
      identifiedUserId.current = null;
    }
  }, [isLoaded, userId]);

  useEffect(() => {
    if (!isPostHogInitialized) {
      return;
    }

    captureAnalyticsEvent("page_viewed", {
      path: pathname,
      has_query: searchParams.toString().length > 0,
    });
  }, [pathname, searchParams]);

  return null;
}

function SignupObservation() {
  const { isLoaded, user } = useUser();

  useEffect(() => {
    if (
      !isLoaded ||
      user === null ||
      !isPostHogInitialized ||
      user.createdAt === null
    ) {
      return;
    }

    const accountAge = Date.now() - user.createdAt.getTime();
    if (accountAge < 0 || accountAge > SIGNUP_TRACKING_WINDOW_MS) {
      return;
    }

    if (window.localStorage.getItem(SIGNUP_TRACKING_KEY) !== null) {
      return;
    }

    captureAnalyticsEvent("signed_up", { source: "clerk" });
    window.localStorage.setItem(SIGNUP_TRACKING_KEY, user.id);
  }, [isLoaded, user]);

  return null;
}

export function PostHogAnalyticsProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const initialized = initializePostHog();

  if (!initialized) {
    return children;
  }

  return (
    <PostHogProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogIdentity />
        <SignupObservation />
      </Suspense>
      {children}
    </PostHogProvider>
  );
}
