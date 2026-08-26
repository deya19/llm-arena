import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import {
  protectPublicThreadRequest,
  toArcjetDenialResponse,
} from "@/features/arcjet/arcjet";
import { getPublicThreadById, serializeThread } from "@/features/data-model/data-model";

export const runtime = "nodejs";

type RouteContext = Readonly<{
  params: Promise<Readonly<{ threadId: string }>>;
}>;

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const arcjetDecision = await protectPublicThreadRequest(request);
  const denialResponse = toArcjetDenialResponse(arcjetDecision);

  if (denialResponse !== null) {
    return denialResponse;
  }

  const { userId } = await auth();
  const { threadId } = await context.params;

  try {
    const thread = await getPublicThreadById(threadId, userId);

    if (thread === null) {
      return Response.json(
        { message: "That thread could not be found." },
        { status: 404 },
      );
    }

    return Response.json(serializeThread(thread), {
      headers: { "Cache-Control": "private, max-age=0, must-revalidate" },
    });
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
