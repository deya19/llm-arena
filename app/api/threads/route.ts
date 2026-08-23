import { auth } from "@clerk/nextjs/server";
import { listThreadsForUser } from "@/features/data-model/data-model";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const { userId } = await auth();

  if (!userId) {
    return Response.json(
      { message: "Sign in to view your saved threads." },
      { status: 401 },
    );
  }

  try {
    const threads = await listThreadsForUser(userId);
    return Response.json(threads, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Thread history failed", {
      error: error instanceof Error ? error.message : "Unknown thread history error",
    });
    return Response.json(
      { message: "Saved threads are unavailable right now. Try again." },
      { status: 503 },
    );
  }
}
