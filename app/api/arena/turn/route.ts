import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { trackPromptSubmitted } from "@/features/analytics/analytics";
import { DataModelError, prepareTurnForUser } from "@/features/data-model/data-model";
import {
  protectModelRequest,
  protectRequest,
  toArcjetDenialResponse,
} from "@/features/arcjet/arcjet";

export const runtime = "nodejs";

const MAX_REQUEST_BODY_BYTES = 128_000;
const MAX_PROMPT_LENGTH = 20_000;
const MAX_MODEL_LENGTH = 200;
const FREE_MODEL_SUFFIX = ":free";
const INVALID_REQUEST_MESSAGE =
  "Send a non-empty prompt and up to three free-tier models, then try again.";

type TurnRequest = Readonly<{
  threadId: string | null;
  prompt: string;
  models: readonly string[];
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseTurnRequest = (value: unknown): TurnRequest | null => {
  if (
    !isRecord(value) ||
    typeof value.prompt !== "string" ||
    !Array.isArray(value.models)
  ) {
    return null;
  }

  const prompt = value.prompt.trim();
  const models = value.models.filter(
    (model): model is string =>
      typeof model === "string" &&
      model.length > 0 &&
      model.length <= MAX_MODEL_LENGTH &&
      model.endsWith(FREE_MODEL_SUFFIX),
  );
  const threadId =
    value.threadId === undefined || value.threadId === null
      ? null
      : typeof value.threadId === "string" && value.threadId.trim().length > 0
        ? value.threadId.trim()
        : null;
  const uniqueModels = [...new Set(models)];

  if (
    prompt.length === 0 ||
    prompt.length > MAX_PROMPT_LENGTH ||
    uniqueModels.length === 0 ||
    uniqueModels.length > 3 ||
    uniqueModels.length !== value.models.length ||
    (value.threadId !== undefined && value.threadId !== null && threadId === null)
  ) {
    return null;
  }

  return { threadId, prompt, models: uniqueModels };
};

const dataModelErrorResponse = (error: DataModelError): Response => {
  const status =
    error.code === "NOT_FOUND" ? 404 : error.code === "INVALID_STATE" ? 409 : 400;

  return Response.json({ message: error.message }, { status });
};

export async function POST(request: NextRequest): Promise<Response> {
  const { userId } = await auth();

  if (!userId) {
    return Response.json(
      { message: "Sign in to send a prompt and compare models." },
      { status: 401 },
    );
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && Number(contentLength) > MAX_REQUEST_BODY_BYTES) {
    return Response.json(
      { message: "This request is too large. Shorten the prompt and try again." },
      { status: 413 },
    );
  }

  const earlyArcjetDecision = await protectRequest(request);
  const earlyDenialResponse = toArcjetDenialResponse(earlyArcjetDecision);

  if (earlyDenialResponse !== null) {
    return earlyDenialResponse;
  }

  let parsedBody: unknown;
  try {
    parsedBody = await request.clone().json();
  } catch {
    return Response.json({ message: INVALID_REQUEST_MESSAGE }, { status: 400 });
  }

  const turnRequest = parseTurnRequest(parsedBody);

  if (turnRequest === null) {
    return Response.json({ message: INVALID_REQUEST_MESSAGE }, { status: 400 });
  }

  const promptArcjetDecision = await protectModelRequest(request, turnRequest.prompt);
  const promptDenialResponse = toArcjetDenialResponse(promptArcjetDecision);

  if (promptDenialResponse !== null) {
    return promptDenialResponse;
  }

  try {
    const preparedTurn = await prepareTurnForUser({
      userId,
      ...turnRequest,
    });
    trackPromptSubmitted(userId, {
      threadId: preparedTurn.threadId,
      turnId: preparedTurn.turnId,
      modelCount: preparedTurn.messages.length,
    });

    return Response.json(preparedTurn, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof DataModelError) {
      return dataModelErrorResponse(error);
    }

    console.error("Turn preparation failed", {
      error: error instanceof Error ? error.message : "Unknown turn error",
    });

    return Response.json(
      { message: "The comparison could not be started right now. Try again." },
      { status: 503 },
    );
  }
}
