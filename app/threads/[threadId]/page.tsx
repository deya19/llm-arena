import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  protectPublicThreadRequest,
  toArcjetDenialResponse,
} from "@/features/arcjet/arcjet";
import { ArenaWorkbench } from "@/features/arena/arena-workbench";
import { DesignShell } from "@/features/design/design-shell";
import { getPublicThreadById } from "@/features/data-model/data-model";

type PublicThreadPageProps = Readonly<{
  params: Promise<Readonly<{ threadId: string }>>;
}>;

export default async function PublicThreadPage({ params }: PublicThreadPageProps) {
  const { threadId } = await params;
  const requestHeaders = await headers();
  const request = new Request(
    `http://localhost/threads/${encodeURIComponent(threadId)}`,
    { headers: requestHeaders },
  );
  const arcjetDecision = await protectPublicThreadRequest(request);

  if (toArcjetDenialResponse(arcjetDecision) !== null) {
    notFound();
  }

  const { userId } = await auth();
  const thread = await getPublicThreadById(threadId, userId);

  if (thread === null) {
    notFound();
  }

  return (
    <DesignShell
      activeThreadId={userId === thread.owner.id ? thread.id : null}
      contextSubtitle={userId === thread.owner.id ? "Saved thread" : "Public thread"}
      contextTitle={thread.title ?? "Shared comparison"}
    >
      <ArenaWorkbench
        publicThreadId={thread.id}
        readOnly={userId !== thread.owner.id}
        threadId={null}
      />
    </DesignShell>
  );
}
