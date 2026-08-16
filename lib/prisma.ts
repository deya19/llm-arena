import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const requiredDatabaseUrl = (): string => {
  const value = process.env.DATABASE_URL?.trim();

  if (!value) {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }

  return value;
};

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const validateDatabaseEnvironment = (): void => {
  requiredDatabaseUrl();
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: requiredDatabaseUrl() }),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
