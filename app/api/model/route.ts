import { NextRequest } from "next/server";
import {
  protectModelRequest,
  protectRequest,
  toArcjetDenialResponse,
} from "@/features/arcjet/arcjet";
import {
  createModelConnectionStream,
  parseModelConnectionRequest,
} from "@/features/model-connection/model-connection";

export const runtime = "nodejs";

const INVALID_REQUEST_MESSAGE =
  "Send a non-empty prompt and a free-tier model, then try again.";
const REQUEST_TOO_LARGE_MESSAGE =
  "This request is too large. Shorten the prompt and try again.";
const MAX_REQUEST_BODY_BYTES = 128_000;

type ParsedRequestBody =
  | Readonly<{ type: "body"; value: unknown }>
  | Readonly<{ type: "invalid" }>
  | Readonly<{ type: "too-large" }>;

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

const parseRequestBody = async (
  request: Request,
): Promise<ParsedRequestBody> => {
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

export async function POST(request: NextRequest): Promise<Response> {
  if (hasOversizedContentLength(request)) {
    return Response.json(
      { message: REQUEST_TOO_LARGE_MESSAGE },
      { status: 413 },
    );
  }

  const earlyArcjetDecision = await protectRequest(request);
  const earlyDenialResponse = toArcjetDenialResponse(earlyArcjetDecision);

  if (earlyDenialResponse !== null) {
    return earlyDenialResponse;
  }

  const parsedBody = await parseRequestBody(request.clone());

  if (parsedBody.type === "too-large") {
    return Response.json(
      { message: REQUEST_TOO_LARGE_MESSAGE },
      { status: 413 },
    );
  }

  if (parsedBody.type === "invalid") {
    return Response.json(
      { message: INVALID_REQUEST_MESSAGE },
      { status: 400 },
    );
  }

  const connectionRequest = parseModelConnectionRequest(parsedBody.value);

  if (connectionRequest === null) {
    return Response.json(
      { message: INVALID_REQUEST_MESSAGE },
      { status: 400 },
    );
  }

  const arcjetDecision = await protectModelRequest(
    request,
    connectionRequest.prompt,
  );
  const denialResponse = toArcjetDenialResponse(arcjetDecision);

  if (denialResponse !== null) {
    return denialResponse;
  }

  let stream: ReadableStream<Uint8Array>;

  try {
    stream = createModelConnectionStream(connectionRequest, request.signal);
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
