import { ArenaWorkbench } from "@/features/arena/arena-workbench";
import { DesignShell } from "@/features/design/design-shell";

export default function Home() {
  return (
    <DesignShell>
      <ArenaWorkbench />
    </DesignShell>
  );
}
