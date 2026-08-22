import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { trackVoteCast } from "@/features/analytics/analytics";
import { castVote, DataModelError } from "@/features/data-model/data-model";
import { protectRequest, toArcjetDenialResponse } from "@/features/arcjet/arcjet";

export const runtime = "nodejs";

const INVALID_REQUEST_MESSAGE = "Choose a completed model response and try again.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseVoteRequest = (
  value: unknown,
): Readonly<{
  threadId: string;
  turnId: string;
  messageId: string;
}> | null => {
  if (!isRecord(value)) {
    return null;
  }

  const fields = ["threadId", "turnId", "messageId"] as const;
  const values = fields.map((field) => value[field]);

  if (values.some((field) => typeof field !== "string" || field.trim().length === 0)) {
    return null;
  }

  const [threadId, turnId, messageId] = values as [string, string, string];

  return {
    threadId: threadId.trim(),
    turnId: turnId.trim(),
    messageId: messageId.trim(),
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
    return Response.json(
      { message: "Sign in to vote for a model response." },
      { status: 401 },
    );
  }

  const arcjetDecision = await protectRequest(request);
  const denialResponse = toArcjetDenialResponse(arcjetDecision);

  if (denialResponse !== null) {
    return denialResponse;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: INVALID_REQUEST_MESSAGE }, { status: 400 });
  }

  const voteRequest = parseVoteRequest(body);

  if (voteRequest === null) {
    return Response.json({ message: INVALID_REQUEST_MESSAGE }, { status: 400 });
  }

  try {
    const result = await castVote({ userId, ...voteRequest });
    trackVoteCast(userId, {
      ...voteRequest,
      result: result.type,
    });

    return Response.json(result, { status: result.type === "created" ? 201 : 200 });
  } catch (error) {
    if (error instanceof DataModelError) {
      return dataModelErrorResponse(error);
    }

    console.error("Vote request failed", {
      error: error instanceof Error ? error.message : "Unknown vote error",
    });

    return Response.json(
      { message: "The vote could not be saved right now. Try again." },
      { status: 503 },
    );
  }
}
