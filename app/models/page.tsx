import { ModelCatalogView } from "@/features/model-catalog/model-catalog-view";
import { DesignShell } from "@/features/design/design-shell";

export default function ModelsPage() {
  return (
    <DesignShell
      activeNav="models"
      contextSubtitle="Live catalog"
      contextTitle="Models"
    >
      <ModelCatalogView />
    </DesignShell>
  );
}
