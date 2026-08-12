import { validateArcjetEnvironment } from "@/features/arcjet/arcjet";
import { validateModelConnectionEnvironment } from "@/features/model-connection/model-connection";

export function register(): void {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    validateArcjetEnvironment();
    validateModelConnectionEnvironment();
  }
}
