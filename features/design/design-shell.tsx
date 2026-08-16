"use client";

import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/nextjs";
import { useState, type FormEvent } from "react";

type Theme = "dark" | "light";
type IconName =
  | "activity"
  | "arrowUp"
  | "chevron"
  | "layers"
  | "menu"
  | "moon"
  | "panel"
  | "plus"
  | "send"
  | "settings"
  | "sun";

type Model = Readonly<{
  id: string;
  name: string;
  shortName: string;
  subtitle: string;
  wins: number;
  votes: number;
}>;

const iconPaths: Record<IconName, string> = {
  activity: "M4 12h3l2-7 4 14 2-7h5M4 19h16M4 5h16",
  arrowUp: "M12 19V5m0 0L6 11m6-6 6 6",
  chevron: "m7 10 5 5 5-5",
  layers: "m12 3 8 4.5-8 4.5-8-4.5L12 3Zm-8 9 8 4.5 8-4.5M4 16l8 4.5 8-4.5",
  menu: "M4 7h16M4 12h16M4 17h16",
  moon: "M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z",
  panel:
    "M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13ZM9 4v16",
  plus: "M12 5v14M5 12h14",
  send: "m21 3-7.5 18-3.75-7.75L2 9.5 21 3ZM9.75 13.25 21 3",
  settings:
    "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm0-5v2m0 13v2m9-8.5h-2m-14 0H3m15.36-6.36-1.42 1.42M7.06 16.94l-1.42 1.42m0-12.72 1.42 1.42m9.88 9.88 1.42 1.42",
  sun: "M12 3v2m0 14v2M5.64 5.64l1.42 1.42m9.88 9.88 1.42 1.42M3 12h2m14 0h2M5.64 18.36l1.42-1.42m9.88-9.88 1.42-1.42M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
};

const navItems = [
  { label: "Arena", icon: "activity" as const, active: true },
  { label: "Leaderboard", icon: "layers" as const, active: false },
  { label: "Models", icon: "panel" as const, active: false },
];

const models: readonly Model[] = [
  {
    id: "alpha",
    name: "Model Alpha",
    shortName: "A",
    subtitle: "General reasoning",
    wins: 0,
    votes: 0,
  },
  {
    id: "beta",
    name: "Model Beta",
    shortName: "B",
    subtitle: "Fast and concise",
    wins: 0,
    votes: 0,
  },
  {
    id: "gamma",
    name: "Model Gamma",
    shortName: "G",
    subtitle: "Long-context thinker",
    wins: 0,
    votes: 0,
  },
];

const placeholderThreads = [
  { id: "example-1", title: "A useful first comparison", meta: "Example · Today" },
  { id: "example-2", title: "Speed versus depth", meta: "Example · Yesterday" },
] as const;

const metrics = [
  { label: "TTFT", value: "—" },
  { label: "Speed", value: "—" },
  { label: "Tokens", value: "—" },
  { label: "Cost", value: "$0.0000" },
];

type IconProps = Readonly<{
  name: IconName;
  size?: number;
}>;

function Icon({ name, size = 18 }: IconProps) {
  return (
    <svg aria-hidden="true" fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <path
        d={iconPaths[name]}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function ModelCard({ model }: Readonly<{ model: Model }>) {
  return (
    <article className="arena-response-card" data-status="idle">
      <header className="arena-response-header">
        <div className="arena-model-identity">
          <span aria-hidden="true" className="arena-model-avatar">
            {model.shortName}
          </span>
          <div>
            <h3>{model.name}</h3>
            <p>{model.subtitle}</p>
          </div>
        </div>
        <span className="arena-status-pill">
          <span aria-hidden="true" className="arena-status-dot" />
          Ready
        </span>
      </header>

      <div className="arena-response-body" aria-live="polite">
        <span className="arena-response-mark" aria-hidden="true">
          {model.shortName}
        </span>
        <p>Response will stream here.</p>
        <span>Send a prompt to start the comparison.</span>
      </div>

      <footer className="arena-response-footer">
        <dl className="arena-metrics" aria-label={`${model.name} metrics`}>
          {metrics.map((metric) => (
            <div key={metric.label}>
              <dt>{metric.label}</dt>
              <dd className={metric.label === "Cost" ? "is-cost" : undefined}>
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>
        <button className="arena-vote-button" disabled type="button">
          Vote after response
        </button>
      </footer>
    </article>
  );
}

export function DesignShell() {
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<Theme>("dark");
  const [prompt, setPrompt] = useState("");
  const [notice, setNotice] = useState("Three columns. One prompt. No guesswork.");

  const themeLabel = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    setNotice(
      prompt.trim().length > 0
        ? "Draft captured. Streaming will connect in the arena loop."
        : "Add a prompt when you are ready to compare responses.",
    );
  };

  const toggleTheme = (): void => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  };

  return (
    <div className="arena-shell" data-sidebar-open={isSidebarOpen}>
      <a className="arena-skip-link" href="#main-content">
        Skip to main content
      </a>

      <button
        aria-label="Close sidebar"
        className={`arena-sidebar-scrim ${isSidebarOpen ? "is-visible" : ""}`}
        onClick={() => setIsSidebarOpen(false)}
        type="button"
      />

      <aside className={`arena-sidebar ${isSidebarOpen ? "is-open" : ""}`}>
        <div className="arena-brand">
          <span className="arena-brand-mark" aria-hidden="true">
            L
          </span>
          <div>
            <p className="arena-brand-name">LLM Arena</p>
            <p className="arena-brand-caption">Compare what works</p>
          </div>
        </div>

        <nav aria-label="Primary navigation" className="arena-nav">
          <p className="arena-sidebar-label">Workspace</p>
          {navItems.map((item) => (
            <button
              aria-current={item.active ? "page" : undefined}
              className={`arena-nav-item ${item.active ? "is-active" : ""}`}
              key={item.label}
              onClick={() => {
                if (!item.active) {
                  setNotice(`${item.label} is coming in a later slice.`);
                }
              }}
              type="button"
            >
              <Icon name={item.icon} size={17} />
              <span>{item.label}</span>
              {item.active ? <span className="arena-nav-pulse" /> : null}
            </button>
          ))}
        </nav>

        <div className="arena-thread-list">
          <div className="arena-thread-heading">
            <p className="arena-sidebar-label">Recent threads</p>
            <span className="arena-thread-count">—</span>
          </div>
          <button
            className="arena-new-thread"
            onClick={() => {
              setPrompt("");
              setNotice("New thread ready for your prompt.");
            }}
            type="button"
          >
            <span className="arena-new-thread-icon" aria-hidden="true">
              <Icon name="plus" size={14} />
            </span>
            <span>New thread</span>
          </button>
          <div
            aria-label="Example thread history"
            className="arena-thread-history"
            role="list"
          >
            {placeholderThreads.map((thread) => (
              <div className="arena-thread-item" key={thread.id} role="listitem">
                <span className="arena-thread-item-title">{thread.title}</span>
                <span className="arena-thread-item-meta">{thread.meta}</span>
              </div>
            ))}
          </div>
          <p className="arena-thread-empty">
            Example history only. Your saved threads will appear here once persistence
            is connected.
          </p>
        </div>

        <div className="arena-sidebar-footer">
          <button
            aria-label={themeLabel}
            aria-pressed={theme === "light"}
            className="arena-utility-button"
            onClick={toggleTheme}
            type="button"
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} size={17} />
            <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
          {isAuthLoaded && isSignedIn ? (
            <div className="arena-user-card">
              <span className="arena-user-avatar" aria-hidden="true">
                ✓
              </span>
              <div>
                <p>Signed-in workspace</p>
                <span>Clerk account</span>
              </div>
              <button
                aria-label="Open workspace settings"
                className="arena-settings"
                type="button"
              >
                <Icon name="settings" size={16} />
              </button>
            </div>
          ) : null}
          {isAuthLoaded && !isSignedIn ? (
            <div className="arena-user-card arena-guest-card">
              <span className="arena-user-avatar" aria-hidden="true">
                G
              </span>
              <div>
                <p>Guest workspace</p>
                <span>Sign in to save threads</span>
              </div>
              <div className="arena-auth-actions">
                <SignInButton mode="modal">
                  <button className="arena-sign-in-button" type="button">
                    Sign in
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="arena-sign-up-button" type="button">
                    Join
                  </button>
                </SignUpButton>
              </div>
            </div>
          ) : null}
        </div>
      </aside>

      <div className="arena-main-column">
        <header className="arena-topbar">
          <div className="arena-breadcrumb">
            <button
              aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
              className="arena-icon-button arena-sidebar-toggle"
              onClick={() => setIsSidebarOpen((open) => !open)}
              type="button"
            >
              <Icon name={isSidebarOpen ? "panel" : "menu"} size={19} />
            </button>
            <span className="arena-breadcrumb-overline">Workspace</span>
            <Icon name="chevron" size={14} />
            <div className="arena-thread-context">
              <strong>New comparison</strong>
              <span>Preview thread</span>
            </div>
          </div>
          <div className="arena-topbar-actions">
            <div
              aria-label="Placeholder model win records"
              className="arena-model-records"
            >
              {models.map((model) => (
                <div
                  className="arena-model-record"
                  key={model.id}
                  title={`${model.name} record`}
                >
                  <span className="arena-record-avatar" aria-hidden="true">
                    {model.shortName}
                  </span>
                  <span className="arena-record-score">
                    <strong>
                      {model.wins}/{model.votes}
                    </strong>
                    <small>record</small>
                  </span>
                </div>
              ))}
            </div>
            <span className="arena-tier-indicator">
              <span aria-hidden="true" className="arena-status-dot" />
              Free tier
            </span>
            <span className="arena-topbar-divider" aria-hidden="true" />
            <button
              aria-label={themeLabel}
              aria-pressed={theme === "light"}
              className="arena-icon-button"
              onClick={toggleTheme}
              type="button"
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
            </button>
            {isAuthLoaded && isSignedIn ? (
              <UserButton
                appearance={{
                  elements: { avatarBox: "arena-clerk-avatar" },
                }}
              />
            ) : null}
            {isAuthLoaded && !isSignedIn ? (
              <SignInButton mode="modal">
                <button className="arena-topbar-sign-in" type="button">
                  Sign in
                </button>
              </SignInButton>
            ) : null}
          </div>
        </header>

        <main className="arena-main" id="main-content">
          <section className="arena-hero" aria-labelledby="arena-heading">
            <div>
              <p className="arena-kicker">The comparison workbench</p>
              <h1 id="arena-heading">
                Ask once.
                <span>See what wins.</span>
              </h1>
              <p className="arena-hero-copy">
                Put the same prompt in front of up to three models. Keep every response,
                measure the difference, and vote with evidence.
              </p>
            </div>
            <div className="arena-hero-note" aria-label="Arena setup">
              <span className="arena-hero-note-number">01</span>
              <div>
                <span>Current view</span>
                <strong>New comparison</strong>
              </div>
            </div>
          </section>

          <section aria-labelledby="prompt-heading" className="arena-composer-wrap">
            <form className="arena-composer" onSubmit={handleSubmit}>
              <div className="arena-composer-topline">
                <div className="arena-composer-label" id="prompt-heading">
                  <span aria-hidden="true" className="arena-live-dot" />
                  Your prompt
                </div>
                <span className="arena-composer-limit">Up to 20,000 characters</span>
              </div>
              <label className="arena-prompt-field">
                <span className="sr-only">Prompt</span>
                <textarea
                  aria-describedby="composer-notice"
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Ask anything worth comparing..."
                  rows={3}
                  value={prompt}
                />
              </label>
              <div className="arena-composer-actions">
                <div className="arena-model-chips" aria-label="Selected models">
                  {models.map((model) => (
                    <span className="arena-model-chip" key={model.id}>
                      <span aria-hidden="true">{model.shortName}</span>
                      {model.name}
                    </span>
                  ))}
                  <button
                    className="arena-add-model"
                    onClick={() =>
                      setNotice("Model selection opens in the next slice.")
                    }
                    type="button"
                  >
                    <Icon name="plus" size={14} />
                    Add model
                  </button>
                </div>
                <button className="arena-submit-button" type="submit">
                  Compare models
                  <span aria-hidden="true" className="arena-submit-icon">
                    <Icon name="arrowUp" size={16} />
                  </span>
                </button>
              </div>
              <div
                className="arena-composer-footnote"
                id="composer-notice"
                aria-live="polite"
              >
                <span>{notice}</span>
                <span className="arena-shortcut">Shift + Enter for a new line</span>
              </div>
            </form>
          </section>

          <section aria-labelledby="responses-heading" className="arena-comparison">
            <div className="arena-section-heading">
              <div>
                <p className="arena-kicker">Live comparison</p>
                <h2 id="responses-heading">Three viewpoints, one thread.</h2>
              </div>
              <button
                className="arena-metrics-toggle"
                onClick={() =>
                  setNotice("Metrics will populate after the first response.")
                }
                type="button"
              >
                <Icon name="activity" size={16} />
                Metrics visible
              </button>
            </div>
            <div className="arena-response-grid">
              {models.map((model) => (
                <ModelCard key={model.id} model={model} />
              ))}
            </div>
          </section>

          <footer className="arena-page-footer">
            <span>Built for honest comparisons.</span>
            <span className="arena-footer-rule" aria-hidden="true" />
            <span>Measured per call · cost $0.0000</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
