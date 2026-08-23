"use client";

import { use, useState } from "react";
import { ArenaWorkbench } from "@/features/arena/arena-workbench";
import { DesignShell } from "@/features/design/design-shell";

type HomeProps = Readonly<{
  searchParams: Promise<Readonly<{ threadId?: string | string[] }>>;
}>;

export default function Home({ searchParams }: HomeProps) {
  const params = use(searchParams);
  const requestedThreadId = Array.isArray(params.threadId)
    ? (params.threadId[0] ?? null)
    : (params.threadId ?? null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    requestedThreadId,
  );
  const [activeThreadTitle, setActiveThreadTitle] = useState(
    requestedThreadId === null ? "New comparison" : "Saved thread",
  );
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [newThreadKey, setNewThreadKey] = useState(0);

  const handleNewThread = (): void => {
    setActiveThreadId(null);
    setActiveThreadTitle("New comparison");
    setNewThreadKey((key) => key + 1);
  };

  const handleThreadSelect = (threadId: string, title: string): void => {
    setActiveThreadId(threadId);
    setActiveThreadTitle(title);
  };

  return (
    <DesignShell
      activeThreadId={activeThreadId}
      contextSubtitle={activeThreadId === null ? "Preview thread" : "Saved thread"}
      contextTitle={activeThreadTitle}
      historyRefreshKey={historyRefreshKey}
      onNewThread={handleNewThread}
      onThreadSelect={handleThreadSelect}
    >
      <ArenaWorkbench
        key={newThreadKey}
        onThreadCreated={() => setHistoryRefreshKey((key) => key + 1)}
        threadId={activeThreadId}
      />
    </DesignShell>
  );
}
