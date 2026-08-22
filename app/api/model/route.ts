import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import {
  trackModelResponseCompleted,
  trackModelResponseFailed,
} from "@/features/analytics/analytics";
import {
  completeAssistantMessage,
  DataModelError,
  failAssistantMessage,
  getModelTurnContext,
  getPendingAssistantMessage,
} from "@/features/data-model/data-model";
import {
  protectModelRequest,
  protectRequest,
  toArcjetDenialResponse,
} from "@/features/arcjet/arcjet";
import {
  CLIENT_ERROR_MESSAGE,
  createModelConnectionStream,
} from "@/features/model-connection/model-connection";

export const runtime = "nodejs";

const INVALID_REQUEST_MESSAGE = "Send a prepared model response request and try again.";
const REQUEST_TOO_LARGE_MESSAGE =
  "This request is too large. Shorten the prompt and try again.";
const MAX_REQUEST_BODY_BYTES = 128_000;
const MAX_ID_LENGTH = 200;
const FREE_MODEL_SUFFIX = ":free";

type ParsedRequestBody =
  | Readonly<{ type: "body"; value: unknown }>
  | Readonly<{ type: "invalid" }>
  | Readonly<{ type: "too-large" }>;

type ModelStreamRequest = Readonly<{
  threadId: string;
  turnId: string;
  messageId: string;
  model: string;
}>;

const hasOversizedContentLength = (request: Request): boolean => {
  const contentLength = request.headers.get("content-length");

  if (contentLength === null) {
    return false;
  }

  if (!/^\d+$/.test(contentLength)) {
    return true;
  }

  const length = Number(contentLength);
  return !Number.isSafeInteger(length) || length > MAX_REQUEST_BODY_BYTES;
};

const parseRequestBody = async (request: Request): Promise<ParsedRequestBody> => {
  if (request.body === null) {
    return { type: "invalid" };
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bodyText = "";
  let bodyBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      bodyBytes += value.byteLength;

      if (bodyBytes > MAX_REQUEST_BODY_BYTES) {
        await reader.cancel();
        return { type: "too-large" };
      }

      bodyText += decoder.decode(value, { stream: true });
    }

    bodyText += decoder.decode();
  } catch {
    return { type: "invalid" };
  } finally {
    reader.releaseLock();
  }

  try {
    return { type: "body", value: JSON.parse(bodyText) };
  } catch {
    return { type: "invalid" };
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseModelStreamRequest = (value: unknown): ModelStreamRequest | null => {
  if (!isRecord(value)) {
    return null;
  }

  const fields = ["threadId", "turnId", "messageId", "model"] as const;
  const values = fields.map((field) => value[field]);

  if (
    values.some(
      (field) =>
        typeof field !== "string" ||
        field.trim().length === 0 ||
        field.length > MAX_ID_LENGTH,
    )
  ) {
    return null;
  }

  const [threadId, turnId, messageId, model] = values as [
    string,
    string,
    string,
    string,
  ];

  if (!model.endsWith(FREE_MODEL_SUFFIX)) {
    return null;
  }

  return {
    threadId: threadId.trim(),
    turnId: turnId.trim(),
    messageId: messageId.trim(),
    model: model.trim(),
  };
};

const dataModelErrorResponse = (error: DataModelError): Response => {
  const status =
    error.code === "NOT_FOUND" ? 404 : error.code === "INVALID_STATE" ? 409 : 400;

  return Response.json({ message: error.message }, { status });
};

export async function POST(request: NextRequest): Promise<Response> {
  const { userId } = await auth();

  if (!userId) {
    return Response.json({ message: "Sign in to compare models." }, { status: 401 });
  }

  if (hasOversizedContentLength(request)) {
    return Response.json({ message: REQUEST_TOO_LARGE_MESSAGE }, { status: 413 });
  }

  const earlyArcjetDecision = await protectRequest(request);
  const earlyDenialResponse = toArcjetDenialResponse(earlyArcjetDecision);

  if (earlyDenialResponse !== null) {
    return earlyDenialResponse;
  }

  const parsedBody = await parseRequestBody(request.clone());

  if (parsedBody.type === "too-large") {
    return Response.json({ message: REQUEST_TOO_LARGE_MESSAGE }, { status: 413 });
  }

  if (parsedBody.type === "invalid") {
    return Response.json({ message: INVALID_REQUEST_MESSAGE }, { status: 400 });
  }

  const streamRequest = parseModelStreamRequest(parsedBody.value);

  if (streamRequest === null) {
    return Response.json({ message: INVALID_REQUEST_MESSAGE }, { status: 400 });
  }

  let pendingMessage: Awaited<ReturnType<typeof getPendingAssistantMessage>>;
  let turnContext: Awaited<ReturnType<typeof getModelTurnContext>>;

  try {
    pendingMessage = await getPendingAssistantMessage({ userId, ...streamRequest });

    if (pendingMessage === null) {
      return Response.json(
        { message: "This model response is no longer available. Start again." },
        { status: 409 },
      );
    }

    turnContext = await getModelTurnContext({ userId, ...streamRequest });
  } catch (error) {
    if (error instanceof DataModelError) {
      return dataModelErrorResponse(error);
    }

    console.error("Model turn lookup failed", {
      error: error instanceof Error ? error.message : "Unknown turn lookup error",
    });
    return Response.json(
      { message: "The comparison could not be loaded right now. Try again." },
      { status: 503 },
    );
  }

  const arcjetDecision = await protectModelRequest(request, turnContext.prompt);
  const denialResponse = toArcjetDenialResponse(arcjetDecision);

  if (denialResponse !== null) {
    return denialResponse;
  }

  let stream: ReadableStream<Uint8Array>;

  try {
    stream = createModelConnectionStream(
      {
        model: pendingMessage.model,
        prompt: turnContext.prompt,
        history: turnContext.history,
      },
      request.signal,
      {
        onFinish: async (finish) => {
          try {
            await completeAssistantMessage({
              threadId: pendingMessage.threadId,
              turnId: pendingMessage.turnId,
              messageId: pendingMessage.id,
              content: finish.content,
              inputTokens: finish.usage.inputTokens,
              outputTokens: finish.usage.outputTokens,
              totalTokens: finish.usage.totalTokens,
              timeToFirstTokenMs: finish.timeToFirstTokenMs,
              durationMs: finish.durationMs,
              tokensPerSecond: finish.tokensPerSecond,
            });
            trackModelResponseCompleted(userId, {
              threadId: pendingMessage.threadId,
              turnId: pendingMessage.turnId,
              messageId: pendingMessage.id,
              model: pendingMessage.model,
              inputTokens: finish.usage.inputTokens,
              outputTokens: finish.usage.outputTokens,
              totalTokens: finish.usage.totalTokens,
              timeToFirstTokenMs: finish.timeToFirstTokenMs,
              durationMs: finish.durationMs,
              tokensPerSecond: finish.tokensPerSecond,
            });
          } catch (error) {
            console.error("Completed model response could not be persisted", {
              model: pendingMessage.model,
              error:
                error instanceof Error ? error.message : "Unknown persistence error",
            });
          }
        },
        onError: async () => {
          try {
            await failAssistantMessage({
              threadId: pendingMessage.threadId,
              turnId: pendingMessage.turnId,
              messageId: pendingMessage.id,
              message: CLIENT_ERROR_MESSAGE,
            });
            trackModelResponseFailed(userId, {
              threadId: pendingMessage.threadId,
              turnId: pendingMessage.turnId,
              messageId: pendingMessage.id,
              model: pendingMessage.model,
            });
          } catch (error) {
            console.error("Failed model response could not be persisted", {
              model: pendingMessage.model,
              error:
                error instanceof Error ? error.message : "Unknown persistence error",
            });
          }
        },
      },
    );
  } catch (error) {
    console.error("Model connection is not configured", {
      error: error instanceof Error ? error.message : "Unknown configuration error",
    });
    return Response.json(
      { message: "The model service is not configured right now. Try again later." },
      { status: 503 },
    );
  }

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
