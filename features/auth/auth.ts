const requiredEnvironmentVariable = (name: string): string => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

export const validateClerkEnvironment = (): void => {
  requiredEnvironmentVariable("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  requiredEnvironmentVariable("CLERK_SECRET_KEY");
};
