import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import {
  DataModelError,
  getThreadById,
  serializeThread,
  updateThreadVisibility,
} from "@/features/data-model/data-model";

export const runtime = "nodejs";

type RouteContext = Readonly<{
  params: Promise<Readonly<{ threadId: string }>>;
}>;

const dataModelErrorResponse = (error: DataModelError): Response =>
  Response.json(
    { message: error.message },
    { status: error.code === "NOT_FOUND" ? 404 : 400 },
  );

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { userId } = await auth();

  if (!userId) {
    return Response.json(
      { message: "Sign in to view your saved threads." },
      { status: 401 },
    );
  }

  const { threadId } = await context.params;

  try {
    const thread = await getThreadById(threadId, userId);

    if (thread === null || thread.ownerId !== userId) {
      return Response.json(
        { message: "That thread could not be found." },
        { status: 404 },
      );
    }

    return Response.json(serializeThread(thread), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Thread load failed", {
      error: error instanceof Error ? error.message : "Unknown thread load error",
    });
    return Response.json(
      { message: "That thread could not be loaded right now. Try again." },
      { status: 503 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();

  if (!userId) {
    return Response.json(
      { message: "Sign in to change thread visibility." },
      { status: 401 },
    );
  }

  const { threadId } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { message: "Choose a visibility setting and try again." },
      { status: 400 },
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as { isPublic?: unknown }).isPublic !== "boolean"
  ) {
    return Response.json(
      { message: "Choose a visibility setting and try again." },
      { status: 400 },
    );
  }

  try {
    return Response.json(
      await updateThreadVisibility({
        userId,
        threadId,
        isPublic: (body as { isPublic: boolean }).isPublic,
      }),
    );
  } catch (error) {
    if (error instanceof DataModelError) {
      return dataModelErrorResponse(error);
    }
    console.error("Thread visibility update failed", {
      error: error instanceof Error ? error.message : "Unknown visibility error",
    });
    return Response.json(
      { message: "Thread visibility could not be changed right now. Try again." },
      { status: 503 },
    );
  }
}
