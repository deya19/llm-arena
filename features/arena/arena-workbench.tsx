"use client";

import { SignInButton, useAuth } from "@clerk/nextjs";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { captureAnalyticsEvent } from "@/features/analytics/browser-analytics";
import type { ModelCatalogEntry } from "@/features/model-catalog/model-catalog";
import { ModelPicker } from "@/features/model-catalog/model-picker";

const SAFE_ERROR_MESSAGE = "The model could not answer right now. Try again.";

type ResponseStatus =
  | "idle"
  | "preparing"
  | "streaming"
  | "completed"
  | "failed"
  | "cancelled";

type ResponseState = Readonly<{
  status: ResponseStatus;
  messageId: string | null;
  text: string;
  error: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  timeToFirstTokenMs: number | null;
  durationMs: number | null;
  tokensPerSecond: number | null;
}>;

type StreamEvent =
  | Readonly<{ type: "text"; model: string; text: string }>
  | Readonly<{
      type: "finish";
      model: string;
      usage: Readonly<{
        inputTokens: number | null;
        outputTokens: number | null;
        totalTokens: number | null;
      }>;
      timeToFirstTokenMs: number | null;
      durationMs: number;
      tokensPerSecond: number | null;
    }>
  | Readonly<{ type: "error"; model: string; message: string }>;

type PreparedTurnResponse = Readonly<{
  threadId: string;
  turnId: string;
  messages: readonly Readonly<{ id: string; model: string }>[];
}>;

type ConversationSnapshot = Readonly<{
  prompt: string;
  models: readonly ModelCatalogEntry[];
  responses: Readonly<Record<string, ResponseState>>;
  winnerId: string | null;
}>;

type HistoricalThread = Readonly<{
  id: string;
  title: string | null;
  isPublic?: boolean;
  turns: readonly Readonly<{
    id: string;
    prompt: string;
    messages: readonly Readonly<{
      id: string;
      model: string;
      role: string;
      status: string;
      content: string;
      inputTokens: number | null;
      outputTokens: number | null;
      totalTokens: number | null;
      timeToFirstTokenMs: number | null;
      durationMs: number | null;
      tokensPerSecond: number | null;
    }>[];
    winnerId: string | null;
  }>[];
}>;

type ArenaWorkbenchProps = Readonly<{
  threadId: string | null;
  publicThreadId?: string;
  readOnly?: boolean;
  onThreadCreated?: () => void;
}>;

const historicalModel = (id: string): ModelCatalogEntry => ({
  id,
  name: id,
  contextLength: 0,
  promptPriceUsd: 0,
  completionPriceUsd: 0,
});

const snapshotsForThread = (
  thread: HistoricalThread,
): readonly ConversationSnapshot[] =>
  thread.turns.map((turn) => {
    const assistantMessages = turn.messages.filter(
      (message) => message.role === "ASSISTANT",
    );
    const models = assistantMessages.map((message) => historicalModel(message.model));
    const responses = Object.fromEntries(
      assistantMessages.map((message) => [
        message.model,
        {
          status: responseStatusFor(message.status),
          messageId: message.id,
          text: message.status === "FAILED" ? "" : message.content,
          error: message.status === "FAILED" ? message.content : null,
          inputTokens: message.inputTokens,
          outputTokens: message.outputTokens,
          totalTokens: message.totalTokens,
          timeToFirstTokenMs: message.timeToFirstTokenMs,
          durationMs: message.durationMs,
          tokensPerSecond: message.tokensPerSecond,
        } satisfies ResponseState,
      ]),
    );
    const winner = assistantMessages.find((message) => message.id === turn.winnerId);

    return {
      prompt: turn.prompt,
      models,
      responses,
      winnerId: winner?.model ?? null,
    };
  });

const emptyResponse = (): ResponseState => ({
  status: "idle",
  messageId: null,
  text: "",
  error: null,
  inputTokens: null,
  outputTokens: null,
  totalTokens: null,
  timeToFirstTokenMs: null,
  durationMs: null,
  tokensPerSecond: null,
});

const responseStatusFor = (status: string): ResponseStatus => {
  switch (status) {
    case "PENDING":
      return "preparing";
    case "STREAMING":
      return "streaming";
    case "COMPLETED":
      return "completed";
    case "FAILED":
      return "failed";
    default:
      return "failed";
  }
};

const formatMetric = (value: number | null, suffix = ""): string =>
  value === null ? "—" : `${value}${suffix}`;

const modelMark = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

const parseStreamEvent = (block: string): StreamEvent | null => {
  const dataLine = block.split(/\r?\n/).find((line) => line.startsWith("data:"));

  if (dataLine === undefined) {
    return null;
  }

  try {
    const event = JSON.parse(dataLine.slice(5).trim()) as StreamEvent;

    return typeof event.type === "string" ? event : null;
  } catch {
    return null;
  }
};

const readStreamEvents = async (
  response: Response,
  onEvent: (event: StreamEvent) => void,
): Promise<void> => {
  if (response.body === null) {
    throw new Error(SAFE_ERROR_MESSAGE);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/);

    buffer = blocks.pop() ?? "";
    blocks.map(parseStreamEvent).forEach((event) => {
      if (event !== null) {
        onEvent(event);
      }
    });

    if (done) {
      const finalEvent = parseStreamEvent(buffer);
      if (finalEvent !== null) {
        onEvent(finalEvent);
      }
      return;
    }
  }
};

function ResponseCard({
  completedModelCount,
  isSignedIn,
  isWinner,
  model,
  onVote,
  response,
  isHistorical = false,
}: Readonly<{
  completedModelCount: number;
  isSignedIn: boolean;
  isWinner: boolean;
  model: ModelCatalogEntry;
  onVote: () => void;
  response: ResponseState;
  isHistorical?: boolean;
}>) {
  const canVote =
    isSignedIn &&
    !isHistorical &&
    response.status === "completed" &&
    completedModelCount >= 2;
  const statusLabel =
    response.status === "preparing"
      ? "Preparing"
      : response.status === "streaming"
        ? "Streaming"
        : response.status === "completed"
          ? "Complete"
          : response.status === "failed"
            ? "Failed"
            : response.status === "cancelled"
              ? "Cancelled"
              : "Ready";

  return (
    <article
      className={`arena-response-card ${isWinner ? "is-winner" : ""}`}
      data-status={response.status}
    >
      <header className="arena-response-header">
        <div className="arena-model-identity">
          <span aria-hidden="true" className="arena-model-avatar">
            {modelMark(model.name)}
          </span>
          <div>
            <h3>{model.name}</h3>
            <p>{model.id}</p>
          </div>
        </div>
        <span className="arena-status-pill">
          <span aria-hidden="true" className="arena-status-dot" />
          {statusLabel}
        </span>
      </header>

      <div className="arena-response-body" aria-live="polite">
        {response.text.length > 0 ? (
          <p className="arena-response-text posthog-mask">{response.text}</p>
        ) : response.error !== null ? (
          <p className="arena-response-error">{response.error}</p>
        ) : (
          <>
            <span className="arena-response-mark" aria-hidden="true">
              {modelMark(model.name)}
            </span>
            <p>
              {response.status === "streaming"
                ? "Waiting for the first tokens…"
                : "Ready for your prompt."}
            </p>
            <span>Each model receives its own independent stream.</span>
          </>
        )}
      </div>

      <footer className="arena-response-footer">
        <dl className="arena-metrics" aria-label={`${model.name} metrics`}>
          <div>
            <dt>TTFT</dt>
            <dd>{formatMetric(response.timeToFirstTokenMs, "ms")}</dd>
          </div>
          <div>
            <dt>Speed</dt>
            <dd>{formatMetric(response.tokensPerSecond, " tok/s")}</dd>
          </div>
          <div>
            <dt>Tokens</dt>
            <dd>{formatMetric(response.totalTokens)}</dd>
          </div>
          <div>
            <dt>Cost</dt>
            <dd className="is-cost">$0.0000</dd>
          </div>
        </dl>
        <button
          className="arena-vote-button"
          disabled={!canVote || isWinner}
          onClick={onVote}
          type="button"
        >
          {isWinner
            ? "Winner"
            : isHistorical
              ? "Previous response"
              : !isSignedIn
                ? "Sign in to vote"
                : canVote
                  ? "Vote for this response"
                  : "Vote after two responses"}
        </button>
      </footer>
    </article>
  );
}

function ThreadLoadingState() {
  return (
    <div
      aria-label="Loading saved thread"
      className="arena-conversation-loading"
      role="status"
    >
      <span className="arena-loading-line is-wide" />
      <span className="arena-loading-line" />
      <span className="arena-loading-line is-short" />
      <strong>Loading saved thread…</strong>
    </div>
  );
}

function ConversationTree({
  isHistorical = false,
  isSignedIn,
  onVote,
  snapshot,
}: Readonly<{
  isHistorical?: boolean;
  isSignedIn: boolean;
  onVote: (messageId: string, modelId: string) => void;
  snapshot: ConversationSnapshot;
}>) {
  const completedModelCount = snapshot.models.filter(
    (model) => snapshot.responses[model.id]?.status === "completed",
  ).length;

  return (
    <div className={`arena-tree ${isHistorical ? "is-historical" : ""}`}>
      <div className="arena-user-node">
        <span aria-hidden="true" className="arena-user-node-avatar">
          Y
        </span>
        <div>
          <span className="arena-node-label">You</span>
          <p className="posthog-mask">{snapshot.prompt}</p>
        </div>
      </div>
      <div aria-hidden="true" className="arena-tree-trunk" />
      <div className="arena-branch-grid">
        {snapshot.models.map((model) => (
          <div className="arena-branch" key={model.id}>
            <span aria-hidden="true" className="arena-branch-line" />
            <ResponseCard
              completedModelCount={completedModelCount}
              isHistorical={isHistorical}
              isSignedIn={isSignedIn}
              isWinner={snapshot.winnerId === model.id}
              model={model}
              onVote={() => {
                const messageId = snapshot.responses[model.id]?.messageId;
                if (messageId !== null && messageId !== undefined) {
                  onVote(messageId, model.id);
                }
              }}
              response={snapshot.responses[model.id] ?? emptyResponse()}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ArenaWorkbench({
  threadId: requestedThreadId,
  publicThreadId,
  readOnly = false,
  onThreadCreated,
}: ArenaWorkbenchProps) {
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth();
  const loadedThreadId = publicThreadId ?? requestedThreadId;
  const [catalogModels, setCatalogModels] = useState<readonly ModelCatalogEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [submittedPrompt, setSubmittedPrompt] = useState<string | null>(null);
  const [submittedModels, setSubmittedModels] = useState<readonly ModelCatalogEntry[]>(
    [],
  );
  const [conversationHistory, setConversationHistory] = useState<
    readonly ConversationSnapshot[]
  >([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [turnId, setTurnId] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, ResponseState>>({});
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [notice, setNotice] = useState("Three columns. One prompt. No guesswork.");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [threadLoadAttempt, setThreadLoadAttempt] = useState(0);
  const [isThreadLoading, setIsThreadLoading] = useState(loadedThreadId !== null);
  const [isThreadLoadFailed, setIsThreadLoadFailed] = useState(false);
  const controllers = useRef(new Map<string, AbortController>());
  const threadCache = useRef(new Map<string, HistoricalThread>());
  const wasCancelled = useRef(false);

  useEffect(() => {
    captureAnalyticsEvent("arena_viewed", {
      public_thread: publicThreadId !== undefined,
    });
  }, [publicThreadId]);

  useEffect(() => {
    if (loadedThreadId === null) {
      return;
    }

    let isCurrent = true;
    const cachedThread = threadCache.current.get(loadedThreadId);
    if (cachedThread === undefined) {
      queueMicrotask(() => {
        if (isCurrent) {
          setIsThreadLoading(true);
          setIsThreadLoadFailed(false);
        }
      });
    }
    const endpoint =
      publicThreadId === undefined ? "/api/threads" : "/api/public/threads";
    const threadPromise =
      cachedThread === undefined
        ? fetch(`${endpoint}/${encodeURIComponent(loadedThreadId)}`).then(
            async (response) => {
              const payload = (await response.json()) as unknown;
              if (!response.ok) throw new Error("thread unavailable");
              return payload as HistoricalThread;
            },
          )
        : Promise.resolve(cachedThread);

    threadPromise
      .then((thread) => {
        if (!isCurrent) return;
        threadCache.current.set(thread.id, thread);
        if (cachedThread !== undefined) {
          captureAnalyticsEvent("thread_cache_restored");
        }
        const snapshots = snapshotsForThread(thread);
        const currentSnapshot = snapshots.at(-1);
        setThreadId(thread.id);
        setConversationHistory(snapshots.slice(0, -1));
        setSubmittedPrompt(currentSnapshot?.prompt ?? null);
        setSubmittedModels(currentSnapshot?.models ?? []);
        setResponses(currentSnapshot?.responses ?? {});
        setWinnerId(currentSnapshot?.winnerId ?? null);
        setTurnId(thread.turns.at(-1)?.id ?? null);
        setIsThreadLoading(false);
        setIsThreadLoadFailed(false);
        if (cachedThread === undefined) {
          captureAnalyticsEvent("thread_opened", {
            public_thread: publicThreadId !== undefined,
            turn_count: thread.turns.length,
          });
          if (publicThreadId !== undefined) {
            captureAnalyticsEvent("public_thread_viewed", {
              turn_count: thread.turns.length,
            });
            captureAnalyticsEvent("shared_link_opened", {
              turn_count: thread.turns.length,
            });
          }
        }
        setNotice(
          publicThreadId === undefined
            ? "Saved thread loaded. Continue the comparison whenever you are ready."
            : isSignedIn === true
              ? "Public thread loaded. Vote when at least two responses are complete."
              : "Public thread loaded. Sign in to vote for a response.",
        );
      })
      .catch(() => {
        if (isCurrent) {
          captureAnalyticsEvent("thread_load_failed");
          setIsThreadLoading(false);
          setIsThreadLoadFailed(true);
          setNotice("That thread could not be loaded. Try again.");
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [isSignedIn, loadedThreadId, publicThreadId, threadLoadAttempt]);

  const selectedModels = catalogModels.filter((model) =>
    selectedIds.includes(model.id),
  );
  const activeModels = submittedPrompt === null ? selectedModels : submittedModels;
  const completedModelCount = activeModels.filter(
    (model) => responses[model.id]?.status === "completed",
  ).length;

  const updateResponse = (
    modelId: string,
    update: (response: ResponseState) => ResponseState,
  ): void => {
    setResponses((currentResponses) => ({
      ...currentResponses,
      [modelId]: update(currentResponses[modelId] ?? emptyResponse()),
    }));
  };

  const cancelStreams = (): void => {
    controllers.current.forEach((controller) => controller.abort());
    controllers.current.clear();
  };

  const streamModel = async (
    prepared: Readonly<{ id: string; model: string }>,
    nextTurnId: string,
    nextThreadId: string,
  ): Promise<void> => {
    const controller = new AbortController();
    controllers.current.set(prepared.model, controller);
    updateResponse(prepared.model, (response) => ({
      ...response,
      messageId: prepared.id,
      status: "streaming",
    }));

    captureAnalyticsEvent("model_stream_started", { model: prepared.model });
    try {
      const response = await fetch("/api/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messageId: prepared.id,
          model: prepared.model,
          threadId: nextThreadId,
          turnId: nextTurnId,
        }),
      });

      if (!response.ok) {
        throw new Error(SAFE_ERROR_MESSAGE);
      }

      await readStreamEvents(response, (event) => {
        if (event.type === "text") {
          updateResponse(prepared.model, (current) => ({
            ...current,
            text: current.text + event.text,
            status: "streaming",
          }));
        }

        if (event.type === "finish") {
          updateResponse(prepared.model, (current) => ({
            ...current,
            status: "completed",
            inputTokens: event.usage.inputTokens,
            outputTokens: event.usage.outputTokens,
            totalTokens: event.usage.totalTokens,
            timeToFirstTokenMs: event.timeToFirstTokenMs,
            durationMs: event.durationMs,
            tokensPerSecond: event.tokensPerSecond,
          }));
        }

        if (event.type === "error") {
          updateResponse(prepared.model, (current) => ({
            ...current,
            status: "failed",
            error: event.message,
          }));
        }
      });
    } catch {
      const isCancelled = controller.signal.aborted;
      captureAnalyticsEvent(
        isCancelled ? "model_stream_cancelled" : "model_stream_failed",
        { model: prepared.model },
      );
      updateResponse(prepared.model, (current) => ({
        ...current,
        status: isCancelled ? "cancelled" : "failed",
        error: isCancelled ? "Response cancelled." : SAFE_ERROR_MESSAGE,
      }));
    } finally {
      controllers.current.delete(prepared.model);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (!isAuthLoaded || !isSignedIn) {
      captureAnalyticsEvent("sign_in_prompted", { action: "send_prompt" });
      setNotice("Sign in to send a prompt and compare models.");
      return;
    }

    if (prompt.trim().length === 0) {
      captureAnalyticsEvent("prompt_validation_failed", { reason: "empty_prompt" });
      setNotice("Add a prompt when you are ready to compare responses.");
      return;
    }

    if (selectedModels.length === 0) {
      captureAnalyticsEvent("prompt_validation_failed", { reason: "no_models" });
      setNotice("Select at least one model before comparing.");
      return;
    }

    if (submittedPrompt !== null) {
      captureAnalyticsEvent("follow_up_prompt_submitted", {
        model_count: selectedModels.length,
      });
      setConversationHistory((currentHistory) => [
        ...currentHistory,
        {
          prompt: submittedPrompt,
          models: submittedModels,
          responses,
          winnerId,
        },
      ]);
    }

    cancelStreams();
    wasCancelled.current = false;
    setIsSubmitting(true);
    setSubmittedPrompt(prompt.trim());
    setSubmittedModels(selectedModels);
    setPrompt("");
    setWinnerId(null);
    setNotice("Preparing an independent stream for each selected model.");
    setResponses(
      Object.fromEntries(selectedModels.map((model) => [model.id, emptyResponse()])),
    );

    try {
      const response = await fetch("/api/arena/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          models: selectedModels.map((model) => model.id),
          prompt: prompt.trim(),
          threadId,
        }),
      });
      const payload = (await response.json()) as
        | PreparedTurnResponse
        | Readonly<{ message?: string }>;

      if (!response.ok || !("messages" in payload)) {
        throw new Error("message" in payload ? payload.message : SAFE_ERROR_MESSAGE);
      }

      captureAnalyticsEvent("comparison_started", {
        model_count: payload.messages.length,
      });
      threadCache.current.delete(payload.threadId);
      if (threadId === null) {
        onThreadCreated?.();
      }
      setThreadId(payload.threadId);
      setTurnId(payload.turnId);
      setNotice("Responses are streaming independently.");
      await Promise.allSettled(
        payload.messages.map((message) =>
          streamModel(message, payload.turnId, payload.threadId),
        ),
      );
      if (!wasCancelled.current) {
        setNotice("Every response is visible. Vote when at least two have finished.");
      }
    } catch {
      captureAnalyticsEvent("comparison_start_failed");
      setNotice("The comparison could not be started right now. Try again.");
      setResponses((currentResponses) =>
        Object.fromEntries(
          Object.entries(currentResponses).map(([modelId, response]) => [
            modelId,
            { ...response, status: "failed", error: SAFE_ERROR_MESSAGE },
          ]),
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = (): void => {
    wasCancelled.current = true;
    captureAnalyticsEvent("comparison_cancelled");
    cancelStreams();
    setIsSubmitting(false);
    setNotice("Comparison cancelled. You can send the prompt again.");
  };

  const handleVote = async (messageId: string, modelId: string): Promise<void> => {
    if (threadId === null || turnId === null) {
      setNotice("Start a comparison before voting.");
      return;
    }

    captureAnalyticsEvent("vote_attempted");
    try {
      const response = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, threadId, turnId }),
      });

      if (!response.ok) {
        throw new Error(SAFE_ERROR_MESSAGE);
      }

      const result = (await response.json()) as Readonly<{ type?: string }>;
      captureAnalyticsEvent(
        result.type === "already-voted" ? "vote_duplicate" : "vote_succeeded",
      );
      threadCache.current.delete(threadId);
      setWinnerId(modelId);
      setNotice("Vote saved. The other responses remain visible for comparison.");
    } catch {
      captureAnalyticsEvent("vote_failed");
      setNotice("The vote could not be saved right now. Try again.");
    }
  };

  return (
    <>
      <section className="arena-conversation" aria-labelledby="arena-heading">
        <div className="arena-conversation-heading">
          <div>
            <p className="arena-kicker">Conversation</p>
            <h1 id="arena-heading">Compare answers in one thread.</h1>
          </div>
          <span className="arena-turn-count">
            {completedModelCount}/{activeModels.length || 3} answered
          </span>
        </div>

        {conversationHistory.map((snapshot, index) => (
          <ConversationTree
            isHistorical
            isSignedIn={isSignedIn === true}
            key={`${snapshot.prompt}-${index}`}
            onVote={() => undefined}
            snapshot={snapshot}
          />
        ))}
        {isThreadLoading ? (
          <ThreadLoadingState />
        ) : submittedPrompt !== null ? (
          <div aria-live="polite">
            <ConversationTree
              isSignedIn={isSignedIn === true}
              onVote={(messageId, modelId) => {
                void handleVote(messageId, modelId);
              }}
              snapshot={{
                prompt: submittedPrompt,
                models: activeModels,
                responses,
                winnerId,
              }}
            />
          </div>
        ) : conversationHistory.length === 0 ? (
          <div className="arena-conversation-empty" role="status">
            <span aria-hidden="true" className="arena-empty-mark">
              ↗
            </span>
            <strong>Start a conversation with up to three models.</strong>
            <span>
              Every answer will branch from your prompt and stay visible here.
            </span>
          </div>
        ) : null}
      </section>

      {readOnly ? (
        <div className="arena-composer-footnote" aria-live="polite" role="status">
          <span>{notice}</span>
          {isThreadLoadFailed ? (
            <button
              className="arena-private-button"
              onClick={() => {
                captureAnalyticsEvent("thread_load_retry_clicked");
                setIsThreadLoading(true);
                setIsThreadLoadFailed(false);
                setThreadLoadAttempt((attempt) => attempt + 1);
              }}
              type="button"
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : (
        <section aria-labelledby="prompt-heading" className="arena-composer-wrap">
          <form className="arena-composer" onSubmit={handleSubmit}>
            <div className="arena-composer-topline">
              <label className="arena-composer-label" htmlFor="arena-prompt">
                <span aria-hidden="true" className="arena-live-dot" />
                Message LLM Arena
              </label>
              <span className="arena-composer-limit">Up to 20,000 characters</span>
            </div>
            <label className="arena-prompt-field">
              <span className="sr-only">Prompt</span>
              <textarea
                aria-describedby="composer-notice"
                id="arena-prompt"
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Ask anything worth comparing..."
                rows={3}
                value={prompt}
              />
            </label>
            <div className="arena-composer-actions">
              <ModelPicker
                onCatalogChange={setCatalogModels}
                onSelectedIdsChange={setSelectedIds}
                selectedIds={selectedIds}
              />
              {!isAuthLoaded || !isSignedIn ? (
                <SignInButton mode="modal">
                  <button
                    className="arena-submit-button"
                    disabled={!isAuthLoaded || selectedModels.length === 0}
                    type="button"
                  >
                    Sign in to send
                    <span aria-hidden="true" className="arena-submit-icon">
                      <span>↑</span>
                    </span>
                  </button>
                </SignInButton>
              ) : isSubmitting ? (
                <button
                  className="arena-cancel-button"
                  onClick={handleCancel}
                  type="button"
                >
                  Stop streams
                </button>
              ) : (
                <button
                  className="arena-submit-button"
                  disabled={selectedModels.length === 0}
                  type="submit"
                >
                  Send
                  <span aria-hidden="true" className="arena-submit-icon">
                    <span>↑</span>
                  </span>
                </button>
              )}
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
      )}

      <footer className="arena-page-footer">
        <span>Built for honest comparisons.</span>
        <span className="arena-footer-rule" aria-hidden="true" />
        <span>Measured per call · cost $0.0000</span>
      </footer>
    </>
  );
}
