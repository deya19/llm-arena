import { NextRequest } from "next/server";
import {
  toArcjetDenialResponse,
  protectModelRequest,
} from "@/features/arcjet/arcjet";
import {
  createModelConnectionStream,
  parseModelConnectionRequest,
} from "@/features/model-connection/model-connection";

export const runtime = "nodejs";

const INVALID_REQUEST_MESSAGE =
  "Send a non-empty prompt and a free-tier model, then try again.";

export async function POST(request: NextRequest): Promise<Response> {
  const bodyRequest = request.clone();
  let body: unknown;

  try {
    body = await bodyRequest.json();
  } catch {
    return Response.json(
      { message: INVALID_REQUEST_MESSAGE },
      { status: 400 },
    );
  }

  const connectionRequest = parseModelConnectionRequest(body);

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
