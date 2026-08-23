import { NextRequest } from "next/server";
import { getPublicThreadById } from "@/features/data-model/data-model";
import { protectRequest, toArcjetDenialResponse } from "@/features/arcjet/arcjet";

export const runtime = "nodejs";

type RouteContext = Readonly<{
  params: Promise<Readonly<{ threadId: string }>>;
}>;

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const arcjetDecision = await protectRequest(request);
  const denialResponse = toArcjetDenialResponse(arcjetDecision);

  if (denialResponse !== null) {
    return denialResponse;
  }

  const { threadId } = await context.params;

  try {
    const thread = await getPublicThreadById(threadId);

    if (thread === null) {
      return Response.json(
        { message: "That thread could not be found." },
        { status: 404 },
      );
    }

    return Response.json(
      {
        id: thread.id,
        title: thread.title,
        isPublic: thread.isPublic,
        turns: thread.turns.map((turn) => ({
          id: turn.id,
          position: turn.position,
          prompt: turn.prompt,
          messages: turn.messages.map((message) => ({
            id: message.id,
            model: message.model,
            role: message.role,
            status: message.status,
            content: message.content,
            inputTokens: message.inputTokens,
            outputTokens: message.outputTokens,
            totalTokens: message.totalTokens,
            timeToFirstTokenMs: message.timeToFirstTokenMs,
            durationMs: message.durationMs,
            tokensPerSecond: message.tokensPerSecond,
          })),
          winnerId:
            thread.votes.find((vote) => vote.turnId === turn.id)?.messageId ?? null,
        })),
      },
      {
        headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
      },
    );
  } catch (error) {
    console.error("Public thread load failed", {
      error: error instanceof Error ? error.message : "Unknown public thread error",
    });
    return Response.json(
      { message: "That thread could not be loaded right now. Try again." },
      { status: 503 },
    );
  }
}
