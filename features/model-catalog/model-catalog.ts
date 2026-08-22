const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const FREE_MODEL_SUFFIX = ":free";
const CATALOG_REVALIDATION_SECONDS = 300;

export type ModelCatalogEntry = Readonly<{
  id: string;
  name: string;
  contextLength: number;
  promptPriceUsd: number;
  completionPriceUsd: number;
}>;

export class ModelCatalogError extends Error {
  constructor(message = "The model catalog is unavailable right now.") {
    super(message);
    this.name = "ModelCatalogError";
  }
}

type RecordValue = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null;

const requiredOpenRouterApiKey = (): string => {
  const value = process.env.OPENROUTER_API_KEY?.trim();

  if (!value) {
    throw new ModelCatalogError();
  }

  return value;
};

const finiteNumber = (value: unknown): number | null => {
  if (
    value === null ||
    value === undefined ||
    (typeof value !== "number" && typeof value !== "string")
  ) {
    return null;
  }

  const number = typeof value === "number" ? value : Number(value);

  return Number.isFinite(number) ? number : null;
};

const parseCatalogEntry = (value: unknown): ModelCatalogEntry | null => {
  if (!isRecord(value) || typeof value.id !== "string") {
    return null;
  }

  const id = value.id.trim();
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const contextLength = finiteNumber(value.context_length);
  const pricing = isRecord(value.pricing) ? value.pricing : null;
  const promptPriceUsd = finiteNumber(pricing?.prompt);
  const completionPriceUsd = finiteNumber(pricing?.completion);

  if (
    id.length === 0 ||
    !id.endsWith(FREE_MODEL_SUFFIX) ||
    contextLength === null ||
    contextLength <= 0 ||
    promptPriceUsd === null ||
    completionPriceUsd === null ||
    promptPriceUsd !== 0 ||
    completionPriceUsd !== 0
  ) {
    return null;
  }

  return {
    id,
    name: name.length > 0 ? name : id,
    contextLength,
    promptPriceUsd,
    completionPriceUsd,
  };
};

const sortCatalog = (models: readonly ModelCatalogEntry[]): ModelCatalogEntry[] =>
  [...models].sort(
    (left, right) =>
      right.contextLength - left.contextLength ||
      left.name.localeCompare(right.name) ||
      left.id.localeCompare(right.id),
  );

export const getModelCatalog = async (): Promise<ModelCatalogEntry[]> => {
  let response: Response;

  try {
    response = await fetch(OPENROUTER_MODELS_URL, {
      headers: {
        Authorization: `Bearer ${requiredOpenRouterApiKey()}`,
      },
      next: { revalidate: CATALOG_REVALIDATION_SECONDS },
    });
  } catch {
    throw new ModelCatalogError();
  }

  if (!response.ok) {
    throw new ModelCatalogError();
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new ModelCatalogError();
  }

  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new ModelCatalogError();
  }

  return sortCatalog(
    payload.data
      .map(parseCatalogEntry)
      .filter((model): model is ModelCatalogEntry => model !== null),
  );
};
