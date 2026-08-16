import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText, type LanguageModelUsage } from "ai";

const CLIENT_ERROR_MESSAGE = "The model could not answer right now. Try again.";
const MAX_PROMPT_LENGTH = 20_000;
const MAX_MODEL_LENGTH = 200;
const FREE_MODEL_SUFFIX = ":free";

const requiredEnvironmentVariable = (name: string): string => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

export const validateModelConnectionEnvironment = (): void => {
  requiredEnvironmentVariable("OPENROUTER_API_KEY");
};

const getOpenRouter = () =>
  createOpenRouter({
    apiKey: requiredEnvironmentVariable("OPENROUTER_API_KEY"),
  });

export type ModelConnectionRequest = Readonly<{
  model: string;
  prompt: string;
}>;

type UsageSnapshot = Readonly<{
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}>;

type StreamEvent =
  | Readonly<{
      type: "text";
      model: string;
      text: string;
    }>
  | Readonly<{
      type: "finish";
      model: string;
      usage: UsageSnapshot;
      timeToFirstTokenMs: number | null;
      durationMs: number;
      tokensPerSecond: number | null;
    }>
  | Readonly<{
      type: "error";
      model: string;
      message: string;
    }>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseModel = (value: unknown): string | null => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_MODEL_LENGTH ||
    !value.endsWith(FREE_MODEL_SUFFIX)
  ) {
    return null;
  }

  return value;
};

export const parseModelConnectionRequest = (
  value: unknown,
): ModelConnectionRequest | null => {
  if (!isRecord(value) || typeof value.prompt !== "string") {
    return null;
  }

  const prompt = value.prompt.trim();
  const model = parseModel(value.model);

  if (prompt.length === 0 || prompt.length > MAX_PROMPT_LENGTH || model === null) {
    return null;
  }

  return { model, prompt };
};

const round = (value: number): number => Math.round(value * 100) / 100;

const toUsageSnapshot = (usage: LanguageModelUsage): UsageSnapshot => ({
  inputTokens: usage.inputTokens ?? null,
  outputTokens: usage.outputTokens ?? null,
  totalTokens: usage.totalTokens ?? null,
});

const toTokensPerSecond = (
  outputTokens: number | null,
  timeToFirstTokenMs: number | null,
  durationMs: number,
): number | null => {
  if (
    outputTokens === null ||
    outputTokens <= 0 ||
    timeToFirstTokenMs === null ||
    durationMs <= timeToFirstTokenMs
  ) {
    return null;
  }

  return round(outputTokens / ((durationMs - timeToFirstTokenMs) / 1000));
};

const encodeEvent = (event: StreamEvent): Uint8Array =>
  new TextEncoder().encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);

const errorEvent = (model: string): StreamEvent => ({
  type: "error",
  model,
  message: CLIENT_ERROR_MESSAGE,
});

export const createModelConnectionStream = (
  request: ModelConnectionRequest,
  signal: AbortSignal,
): ReadableStream<Uint8Array> => {
  const startedAt = performance.now();
  const result = streamText({
    model: getOpenRouter()(request.model),
    prompt: request.prompt,
    abortSignal: signal,
  });

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let timeToFirstTokenMs: number | null = null;
      let isClosed = false;

      const enqueue = (event: StreamEvent): void => {
        if (!isClosed) {
          controller.enqueue(encodeEvent(event));
        }
      };

      const close = (): void => {
        if (!isClosed) {
          isClosed = true;
          controller.close();
        }
      };

      try {
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            if (timeToFirstTokenMs === null && part.text.length > 0) {
              timeToFirstTokenMs = round(performance.now() - startedAt);
            }

            if (part.text.length > 0) {
              enqueue({
                type: "text",
                model: request.model,
                text: part.text,
              });
            }
          }

          if (part.type === "finish") {
            const durationMs = round(performance.now() - startedAt);
            const usage = toUsageSnapshot(part.totalUsage);

            enqueue({
              type: "finish",
              model: request.model,
              usage,
              timeToFirstTokenMs,
              durationMs,
              tokensPerSecond: toTokensPerSecond(
                usage.outputTokens,
                timeToFirstTokenMs,
                durationMs,
              ),
            });
          }

          if (part.type === "error") {
            console.error("Model provider stream failed", {
              model: request.model,
              error:
                part.error instanceof Error
                  ? part.error.message
                  : "Unknown provider error",
            });
            enqueue(errorEvent(request.model));
            close();
            return;
          }
        }

        close();
      } catch (error) {
        if (!signal.aborted) {
          console.error("Model provider stream failed", {
            model: request.model,
            error: error instanceof Error ? error.message : "Unknown provider error",
          });
          enqueue(errorEvent(request.model));
        }

        close();
      }
    },
  });
};

export { CLIENT_ERROR_MESSAGE };
