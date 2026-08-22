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

const arcjetClient = createRemoteClient({ timeout: 5000 });

const baseArcjet = arcjet({
  key: requiredEnvironmentVariable("ARCJET_KEY"),
  client: arcjetClient,
  rules: [shield({ mode: "LIVE" })],
});

const requestArcjet = baseArcjet
  .withRule(
    detectBot({
      mode: "LIVE",
      deny: ["CATEGORY:BOTNET"],
    }),
  )
  .withRule(
    slidingWindow({
      mode: "LIVE",
      interval: "1m",
      max: 10,
    }),
  );

const promptArcjet = arcjet({
  key: requiredEnvironmentVariable("ARCJET_KEY"),
  client: arcjetClient,
  rules: [detectPromptInjection({ mode: "LIVE" })],
});

export const protectRequest = (request: Request): Promise<ArcjetDecision> =>
  requestArcjet.protect(request);

export const protectModelRequest = (
  request: Request,
  prompt: string,
): Promise<ArcjetDecision> =>
  promptArcjet.protect(request, {
    detectPromptInjectionMessage: prompt,
  });

export const toArcjetDenialResponse = (decision: ArcjetDecision): Response | null => {
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
