import { validateArcjetEnvironment } from "@/features/arcjet/arcjet";
import { validateClerkEnvironment } from "@/features/auth/auth";
import { validateModelConnectionEnvironment } from "@/features/model-connection/model-connection";
import { validateDatabaseEnvironment } from "@/lib/prisma";

export function register(): void {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    validateArcjetEnvironment();
    validateClerkEnvironment();
    validateDatabaseEnvironment();
    validateModelConnectionEnvironment();
  }
}
