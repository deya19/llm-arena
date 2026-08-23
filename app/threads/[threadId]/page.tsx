import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { ArenaWorkbench } from "@/features/arena/arena-workbench";
import { DesignShell } from "@/features/design/design-shell";
import { getPublicThreadById } from "@/features/data-model/data-model";

type PublicThreadPageProps = Readonly<{
  params: Promise<Readonly<{ threadId: string }>>;
}>;

export default async function PublicThreadPage({ params }: PublicThreadPageProps) {
  const { threadId } = await params;
  const [{ userId }, thread] = await Promise.all([
    auth(),
    getPublicThreadById(threadId),
  ]);

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
