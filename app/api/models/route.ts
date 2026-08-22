import { getModelCatalog } from "@/features/model-catalog/model-catalog";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const models = await getModelCatalog();

    return Response.json(
      { models },
      {
        headers: {
          "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (error) {
    console.error("Model catalog request failed", {
      error: error instanceof Error ? error.message : "Unknown catalog error",
    });

    return Response.json(
      { message: "The model catalog is unavailable right now. Try again." },
      { status: 503 },
    );
  }
}
