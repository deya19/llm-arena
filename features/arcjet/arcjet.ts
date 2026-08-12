import arcjet, {
  createRemoteClient,
  detectBot,
  detectPromptInjection,
  shield,
  slidingWindow,
  type ArcjetDecision,
} from "@arcjet/next";

const requiredEnvironmentVariable = (name: string): string => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

export const validateArcjetEnvironment = (): void => {
  requiredEnvironmentVariable("ARCJET_KEY");
};

const aj = arcjet({
  key: requiredEnvironmentVariable("ARCJET_KEY"),
  client: createRemoteClient({ timeout: 5000 }),
  rules: [shield({ mode: "LIVE" })],
})
  .withRule(
    detectBot({
      mode: "LIVE",
      deny: ["CATEGORY:BOTNET"],
    }),
  )
  .withRule(detectPromptInjection({ mode: "LIVE" }))
  .withRule(
    slidingWindow({
      mode: "LIVE",
      interval: "1m",
      max: 10,
    }),
  );

export const protectModelRequest = (
  request: Request,
  prompt: string,
): Promise<ArcjetDecision> =>
  aj.protect(request, {
    detectPromptInjectionMessage: prompt,
  });

export const toArcjetDenialResponse = (
  decision: ArcjetDecision,
): Response | null => {
  if (!decision.isDenied()) {
    if (decision.isErrored()) {
      console.error("Arcjet protection failed open");
    }

    return null;
  }

  if (decision.reason.isRateLimit()) {
    return Response.json(
      { message: "Too many requests right now. Try again shortly." },
      { status: 429 },
    );
  }

  if (decision.reason.isPromptInjection()) {
    return Response.json(
      { message: "This prompt cannot be processed. Try a different request." },
      { status: 400 },
    );
  }

  return Response.json(
    { message: "This request was blocked. Try again." },
    { status: 403 },
  );
};
