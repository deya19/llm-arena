import { auth } from "@clerk/nextjs/server";
import { DesignShell } from "@/features/design/design-shell";
import { getLeaderboard } from "@/features/data-model/data-model";
import { LeaderboardView } from "@/features/leaderboard/leaderboard-view";

export default async function LeaderboardPage() {
  const { userId } = await auth();
  const data = await Promise.all([
    getLeaderboard(),
    userId === null ? Promise.resolve(null) : getLeaderboard(userId),
  ]).catch(() => null);

  return (
    <DesignShell
      activeNav="leaderboard"
      contextSubtitle="Live voting record"
      contextTitle="Leaderboard"
    >
      <LeaderboardView
        globalEntries={data?.[0] ?? []}
        initialError={data === null ? "unavailable" : null}
        personalEntries={data?.[1] ?? null}
      />
    </DesignShell>
  );
}
