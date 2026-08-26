"use client";

import { SignInButton } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { captureAnalyticsEvent } from "@/features/analytics/browser-analytics";
import type { LeaderboardEntry } from "@/features/data-model/data-model";

type LeaderboardViewProps = Readonly<{
  globalEntries: readonly LeaderboardEntry[];
  personalEntries: readonly LeaderboardEntry[] | null;
  initialError?: string | null;
}>;

type LeaderboardMode = "global" | "personal";

const modelMark = (model: string): string =>
  model
    .replace(/:free$/, "")
    .split(/[\s/:-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

const modelName = (model: string): string =>
  model.replace(/:free$/, "").replace(/\//g, " / ");

const formatMilliseconds = (value: number | null): string =>
  value === null ? "—" : `${Math.round(value).toLocaleString()} ms`;

const formatSpeed = (value: number | null): string =>
  value === null ? "—" : `${value.toFixed(1)} tok/s`;

const formatRate = (value: number): string => `${Math.round(value * 100)}%`;

export function LeaderboardView({
  globalEntries,
  initialError = null,
  personalEntries,
}: LeaderboardViewProps) {
  const [mode, setMode] = useState<LeaderboardMode>("global");
  const entries = mode === "global" ? globalEntries : (personalEntries ?? []);

  useEffect(() => {
    captureAnalyticsEvent("leaderboard_viewed", {
      has_personal_data: personalEntries !== null,
    });
  }, [personalEntries]);
  const isPersonalAvailable = personalEntries !== null;

  return (
    <div className="leaderboard-page-content">
      <header className="leaderboard-heading">
        <div>
          <p className="arena-kicker">The honest record</p>
          <h1>Leaderboard</h1>
          <p>
            Every model&apos;s real record, from actual head-to-head votes. No made-up
            scores, no cost rankings.
          </p>
        </div>
        <span className="leaderboard-free-note">All models · free tier</span>
      </header>

      <div aria-label="Leaderboard scope" className="leaderboard-toggle" role="group">
        <button
          aria-pressed={mode === "global"}
          className={mode === "global" ? "is-active" : undefined}
          onClick={() => {
            captureAnalyticsEvent("leaderboard_scope_changed", { scope: "global" });
            setMode("global");
          }}
          type="button"
        >
          Global
        </button>
        <button
          aria-pressed={mode === "personal"}
          className={mode === "personal" ? "is-active" : undefined}
          onClick={() => {
            captureAnalyticsEvent("leaderboard_scope_changed", { scope: "personal" });
            setMode("personal");
          }}
          type="button"
        >
          Personal
        </button>
      </div>

      {initialError !== null ? (
        <div className="leaderboard-message" role="alert">
          <strong>Leaderboard data is unavailable right now.</strong>
          <span>Try refreshing the page in a moment.</span>
        </div>
      ) : mode === "personal" && !isPersonalAvailable ? (
        <div className="leaderboard-message">
          <strong>Sign in to see your personal record.</strong>
          <span>Your votes will appear here once you start comparing models.</span>
          <SignInButton mode="modal">
            <button className="leaderboard-sign-in" type="button">
              Sign in to continue
            </button>
          </SignInButton>
        </div>
      ) : (
        <section
          aria-labelledby="leaderboard-section-heading"
          className="leaderboard-section"
        >
          <div className="leaderboard-section-heading">
            <div>
              <p className="arena-kicker">
                {mode === "global" ? "Global ranking" : "Your ranking"}
              </p>
              <h2 id="leaderboard-section-heading">
                {mode === "global"
                  ? "Every vote, every user."
                  : "Your votes, your record."}
              </h2>
            </div>
            <span>
              {entries.length} {entries.length === 1 ? "model" : "models"}
            </span>
          </div>
          {entries.length > 0 ? (
            <div className="leaderboard-table-wrap">
              <table className="leaderboard-table">
                <caption className="sr-only">
                  {mode === "global" ? "Global model rankings" : "Your model rankings"}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Model</th>
                    <th scope="col">Win rate</th>
                    <th scope="col">Avg. time to first token</th>
                    <th scope="col">Avg. tokens/sec</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, index) => (
                    <tr
                      className={index === 0 ? "is-first" : undefined}
                      key={entry.model}
                    >
                      <td className="leaderboard-rank">{index + 1}</td>
                      <th scope="row">
                        <span aria-hidden="true" className="leaderboard-model-mark">
                          {modelMark(entry.model)}
                        </span>
                        <span className="leaderboard-model-name">
                          {modelName(entry.model)}
                        </span>
                      </th>
                      <td>
                        <div className="leaderboard-rate">
                          <strong>{formatRate(entry.winRate)}</strong>
                          <div aria-hidden="true" className="leaderboard-bar">
                            <span style={{ width: `${entry.winRate * 100}%` }} />
                          </div>
                          <small>
                            won {entry.wins} of {entry.appearances}
                          </small>
                        </div>
                      </td>
                      <td className="leaderboard-metric">
                        {formatMilliseconds(entry.averageTimeToFirstToken)}
                      </td>
                      <td className="leaderboard-metric">
                        {formatSpeed(entry.averageSpeed)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="leaderboard-empty">
              <strong>No votes recorded yet.</strong>
              <span>
                Compare at least two models and cast a vote to start the record.
              </span>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
