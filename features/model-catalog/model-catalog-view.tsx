"use client";

import { useCallback, useEffect, useState } from "react";
import type { ModelCatalogEntry } from "@/features/model-catalog/model-catalog";

const formatContextLength = (contextLength: number): string =>
  `${contextLength.toLocaleString()} tokens`;

const modelMark = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

type CatalogPayload = Readonly<{
  models?: ModelCatalogEntry[];
  message?: string;
}>;

type CatalogStatus = "loading" | "ready" | "error";

type ModelCatalogViewProps = Readonly<{
  initialModels?: readonly ModelCatalogEntry[];
  initialError?: string | null;
}>;

export function ModelCatalogView({
  initialError = null,
  initialModels = [],
}: ModelCatalogViewProps) {
  const [models, setModels] = useState<readonly ModelCatalogEntry[]>(initialModels);
  const [status, setStatus] = useState<CatalogStatus>(
    initialError === null && initialModels.length > 0 ? "ready" : "loading",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError);

  const loadCatalog = useCallback(async (): Promise<void> => {
    setStatus("loading");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/models");
      const payload = (await response.json()) as CatalogPayload;

      if (!response.ok || !Array.isArray(payload.models)) {
        throw new Error(
          payload.message ?? "The model catalog is unavailable right now.",
        );
      }

      setModels(payload.models);
      setStatus("ready");
    } catch {
      setModels([]);
      setErrorMessage("The model catalog is unavailable right now. Try again.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    const loadTask = window.setTimeout(() => {
      void loadCatalog();
    }, 0);

    return () => window.clearTimeout(loadTask);
  }, [loadCatalog]);

  return (
    <div className="models-page-content">
      <header className="models-page-heading">
        <div>
          <p className="arena-kicker">OpenRouter catalog</p>
          <h1>Models worth comparing.</h1>
          <p>
            Browse the live free-tier catalog by context window before you bring a model
            into the arena.
          </p>
        </div>
        <span className="models-live-badge">
          <span aria-hidden="true" className="arena-status-dot" />
          Live free tier
        </span>
      </header>

      <div aria-live="polite" className="models-catalog-status">
        {status === "loading" ? <CatalogLoading /> : null}
        {status === "error" ? (
          <div className="models-error" role="alert">
            <div>
              <strong>{errorMessage}</strong>
              <span>OpenRouter did not return a usable catalog.</span>
            </div>
            <button className="models-retry-button" onClick={loadCatalog} type="button">
              Retry catalog
            </button>
          </div>
        ) : null}
        {status === "ready" && models.length === 0 ? (
          <div className="models-empty-state">
            <strong>No free-tier models are available right now.</strong>
            <span>Try again shortly to refresh the live catalog.</span>
            <button className="models-retry-button" onClick={loadCatalog} type="button">
              Refresh catalog
            </button>
          </div>
        ) : null}
      </div>

      {status === "ready" && models.length > 0 ? (
        <div className="models-catalog-grid">
          {models.map((model) => (
            <article className="models-catalog-card" key={model.id}>
              <div className="models-catalog-card-header">
                <span aria-hidden="true" className="models-model-mark">
                  {modelMark(model.name)}
                </span>
                <span className="models-free-label">Free tier</span>
              </div>
              <h2>{model.name}</h2>
              <p className="models-model-id">{model.id}</p>
              <dl className="models-model-details">
                <div>
                  <dt>Context window</dt>
                  <dd>{formatContextLength(model.contextLength)}</dd>
                </div>
                <div>
                  <dt>Pricing</dt>
                  <dd>$0.0000</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CatalogLoading() {
  return (
    <div className="models-loading-grid" aria-label="Loading model catalog">
      {["loading-one", "loading-two", "loading-three"].map((key) => (
        <div className="models-loading-card" key={key}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
