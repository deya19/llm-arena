"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { ModelCatalogEntry } from "@/features/model-catalog/model-catalog";

const MAX_SELECTED_MODELS = 3;

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

type ModelPickerProps = Readonly<{
  onCatalogChange?: (models: readonly ModelCatalogEntry[]) => void;
  onSelectedIdsChange?: Dispatch<SetStateAction<readonly string[]>>;
  selectedIds?: readonly string[];
}>;

const noopSetSelectedIds: Dispatch<SetStateAction<readonly string[]>> = () => undefined;

export function ModelPicker({
  onCatalogChange,
  onSelectedIdsChange = noopSetSelectedIds,
  selectedIds = [],
}: ModelPickerProps = {}) {
  const [models, setModels] = useState<readonly ModelCatalogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const loadCatalog = useCallback(async (): Promise<void> => {
    setIsLoading(true);
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
      onCatalogChange?.(payload.models);
      onSelectedIdsChange((currentIds) => {
        const availableIds = new Set(payload.models?.map((model) => model.id));
        const existingIds = currentIds.filter((id) => availableIds.has(id));

        return existingIds.length > 0
          ? existingIds
          : (payload.models?.slice(0, MAX_SELECTED_MODELS).map((model) => model.id) ??
              []);
      });
    } catch {
      setModels([]);
      onCatalogChange?.([]);
      onSelectedIdsChange([]);
      setErrorMessage("The model catalog is unavailable right now.");
    } finally {
      setIsLoading(false);
    }
  }, [onCatalogChange, onSelectedIdsChange]);

  useEffect(() => {
    const loadTask = window.setTimeout(() => {
      void loadCatalog();
    }, 0);

    return () => window.clearTimeout(loadTask);
  }, [loadCatalog]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent): void => {
      if (pickerRef.current?.contains(event.target as Node) === false) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const selectedModels = useMemo(
    () =>
      selectedIds
        .map((id) => models.find((model) => model.id === id))
        .filter((model): model is ModelCatalogEntry => model !== undefined),
    [models, selectedIds],
  );
  const normalizedSearch = search.trim().toLowerCase();
  const filteredModels = models.filter(
    (model) =>
      normalizedSearch.length === 0 ||
      model.name.toLowerCase().includes(normalizedSearch) ||
      model.id.toLowerCase().includes(normalizedSearch),
  );
  const isAtLimit = selectedIds.length >= MAX_SELECTED_MODELS;

  const toggleModel = (modelId: string): void => {
    onSelectedIdsChange((currentIds) => {
      if (currentIds.includes(modelId)) {
        return currentIds.filter((id) => id !== modelId);
      }

      if (currentIds.length >= MAX_SELECTED_MODELS) {
        return currentIds;
      }

      return [...currentIds, modelId];
    });
  };

  return (
    <div className="arena-model-picker" ref={pickerRef}>
      <div className="arena-model-chips" aria-label="Selected models">
        {isLoading && selectedModels.length === 0 ? (
          <span className="arena-model-picker-status">Loading models…</span>
        ) : null}
        {!isLoading && selectedModels.length === 0 ? (
          <span className="arena-model-picker-status">Select a model to compare</span>
        ) : null}
        {selectedModels.map((model) => (
          <button
            aria-label={`Remove ${model.name}`}
            className="arena-model-chip"
            key={model.id}
            onClick={() => toggleModel(model.id)}
            type="button"
          >
            <span aria-hidden="true">{modelMark(model.name)}</span>
            {model.name}
            <b aria-hidden="true">×</b>
          </button>
        ))}
        <button
          aria-controls="model-picker-popover"
          aria-expanded={isOpen}
          className="arena-add-model"
          disabled={isLoading || isAtLimit}
          onClick={() => setIsOpen((open) => !open)}
          type="button"
        >
          + Add model
        </button>
      </div>

      {isOpen ? (
        <div
          aria-label="Choose models"
          className="arena-model-popover"
          id="model-picker-popover"
          role="dialog"
        >
          <div className="arena-model-popover-heading">
            <div>
              <strong>Add models</strong>
              <span>Choose up to three free-tier models.</span>
            </div>
            <span className="arena-model-popover-count">
              {selectedIds.length}/{MAX_SELECTED_MODELS}
            </span>
          </div>
          <label className="arena-model-search">
            <span className="sr-only">Search models</span>
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or ID"
              type="search"
              value={search}
            />
          </label>
          {errorMessage ? (
            <div className="arena-model-picker-error" role="alert">
              <span>{errorMessage}</span>
              <button onClick={loadCatalog} type="button">
                Retry
              </button>
            </div>
          ) : null}
          {!errorMessage && filteredModels.length > 0 ? (
            <div
              aria-label="Available free-tier models"
              aria-multiselectable="true"
              className="arena-model-options"
              role="listbox"
            >
              {filteredModels.map((model) => {
                const isSelected = selectedIds.includes(model.id);
                const isDisabled = isAtLimit && !isSelected;

                return (
                  <button
                    aria-selected={isSelected}
                    className={`arena-model-option ${isSelected ? "is-selected" : ""}`}
                    disabled={isDisabled}
                    key={model.id}
                    onClick={() => toggleModel(model.id)}
                    role="option"
                    title={isDisabled ? "Remove a selected model first" : model.id}
                    type="button"
                  >
                    <span aria-hidden="true" className="arena-model-option-mark">
                      {modelMark(model.name)}
                    </span>
                    <span className="arena-model-option-copy">
                      <strong>{model.name}</strong>
                      <small>
                        {formatContextLength(model.contextLength)} · $0.0000
                      </small>
                    </span>
                    <span aria-hidden="true" className="arena-model-option-check">
                      {isSelected ? "✓" : "+"}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
          {!errorMessage && filteredModels.length === 0 ? (
            <p className="arena-model-picker-empty">
              No free-tier models match that search.
            </p>
          ) : null}
          {isAtLimit ? (
            <p className="arena-model-picker-hint">
              Three models selected. Remove one to choose another.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
