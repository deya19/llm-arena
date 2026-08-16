import {
  MessageRole,
  MessageStatus,
  Prisma,
  type Message,
  type Thread,
  type Turn,
  type User,
  type Vote,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type DataModelErrorCode = "INVALID_INPUT" | "NOT_FOUND" | "INVALID_STATE";

export class DataModelError extends Error {
  readonly code: DataModelErrorCode;

  constructor(code: DataModelErrorCode, message: string) {
    super(message);
    this.name = "DataModelError";
    this.code = code;
  }
}

export type CreateThreadInput = Readonly<{
  ownerId: string;
  prompt: string;
  title?: string | null;
}>;

export type AppendTurnInput = Readonly<{
  threadId: string;
  prompt: string;
}>;

export type CreateAssistantMessagesInput = Readonly<{
  threadId: string;
  turnId: string;
  models: readonly string[];
}>;

export type CompleteAssistantMessageInput = Readonly<{
  threadId: string;
  turnId: string;
  messageId: string;
  content: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  timeToFirstTokenMs: number | null;
  durationMs: number | null;
  tokensPerSecond: number | null;
}>;

export type FailAssistantMessageInput = Readonly<{
  threadId: string;
  turnId: string;
  messageId: string;
  message: string;
}>;

export type CastVoteInput = Readonly<{
  userId: string;
  threadId: string;
  turnId: string;
  messageId: string;
}>;

export type VoteResult =
  | Readonly<{ type: "created"; vote: Vote }>
  | Readonly<{ type: "already-voted"; vote: Vote }>;

const requireValue = (value: string, message: string): string => {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new DataModelError("INVALID_INPUT", message);
  }

  return normalized;
};

const normalizeModels = (models: readonly string[]): string[] => {
  const normalizedModels = models.map((model) =>
    requireValue(model, "At least one model is required."),
  );
  const uniqueModels = [...new Set(normalizedModels)];

  if (uniqueModels.length === 0) {
    throw new DataModelError("INVALID_INPUT", "At least one model is required.");
  }

  return uniqueModels;
};

const assertTurnBelongsToThread: (
  turn: Readonly<{ threadId: string }> | null,
  threadId: string,
) => asserts turn is Readonly<{ threadId: string }> = (turn, threadId) => {
  if (turn === null || turn.threadId !== threadId) {
    throw new DataModelError("NOT_FOUND", "The requested thread turn was not found.");
  }
};

export const ensureUser = async (userId: string): Promise<User> => {
  const normalizedUserId = requireValue(userId, "A user is required.");

  return prisma.user.upsert({
    where: { id: normalizedUserId },
    update: {},
    create: { id: normalizedUserId },
  });
};

export const createThreadWithFirstTurn = async (
  input: CreateThreadInput,
): Promise<Readonly<{ thread: Thread; turn: Turn }>> => {
  const ownerId = requireValue(input.ownerId, "A thread owner is required.");
  const prompt = requireValue(input.prompt, "A non-empty prompt is required.");
  const title = input.title?.trim() || null;

  return prisma.$transaction(async (tx) => {
    await tx.user.upsert({
      where: { id: ownerId },
      update: {},
      create: { id: ownerId },
    });

    const thread = await tx.thread.create({
      data: {
        ownerId,
        title,
      },
    });
    const turn = await tx.turn.create({
      data: {
        threadId: thread.id,
        position: 0,
        prompt,
      },
    });

    return { thread, turn };
  });
};

export const appendTurn = async (input: AppendTurnInput): Promise<Turn> => {
  const threadId = requireValue(input.threadId, "A thread is required.");
  const prompt = requireValue(input.prompt, "A non-empty prompt is required.");

  return prisma.$transaction(async (tx) => {
    const lockedThreads = await tx.$queryRaw<ReadonlyArray<{ id: string }>>(
      Prisma.sql`
        SELECT "id"
        FROM "threads"
        WHERE "id" = ${threadId}
        FOR UPDATE
      `,
    );

    if (lockedThreads.length === 0) {
      throw new DataModelError("NOT_FOUND", "The requested thread was not found.");
    }

    const latestTurn = await tx.turn.aggregate({
      where: { threadId },
      _max: { position: true },
    });
    const turn = await tx.turn.create({
      data: {
        threadId,
        position: (latestTurn._max.position ?? -1) + 1,
        prompt,
      },
    });

    await tx.thread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });

    return turn;
  });
};

export const createPendingAssistantMessages = async (
  input: CreateAssistantMessagesInput,
): Promise<Message[]> => {
  const threadId = requireValue(input.threadId, "A thread is required.");
  const turnId = requireValue(input.turnId, "A thread turn is required.");
  const models = normalizeModels(input.models);

  return prisma.$transaction(async (tx) => {
    const turn = await tx.turn.findUnique({
      where: { id: turnId },
      select: { threadId: true },
    });
    assertTurnBelongsToThread(turn, threadId);

    return Promise.all(
      models.map((model) =>
        tx.message.create({
          data: {
            threadId,
            turnId,
            model,
            role: MessageRole.ASSISTANT,
            status: MessageStatus.PENDING,
            content: "",
            costUsd: 0,
          },
        }),
      ),
    );
  });
};

type MessageTransition = Readonly<{
  status: MessageStatus;
  content: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  timeToFirstTokenMs: number | null;
  durationMs: number | null;
  tokensPerSecond: number | null;
}>;

const transitionPendingAssistantMessage = async (
  input: Readonly<{
    threadId: string;
    turnId: string;
    messageId: string;
    transition: MessageTransition;
  }>,
): Promise<Message> => {
  const threadId = requireValue(input.threadId, "A thread is required.");
  const turnId = requireValue(input.turnId, "A thread turn is required.");
  const messageId = requireValue(input.messageId, "A message is required.");

  return prisma.$transaction(async (tx) => {
    const result = await tx.message.updateMany({
      where: {
        id: messageId,
        threadId,
        turnId,
        role: MessageRole.ASSISTANT,
        status: MessageStatus.PENDING,
      },
      data: {
        ...input.transition,
        completedAt: new Date(),
        costUsd: 0,
      },
    });

    if (result.count !== 1) {
      throw new DataModelError(
        "INVALID_STATE",
        "The model response is no longer waiting for completion.",
      );
    }

    await tx.thread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });

    return tx.message.findUniqueOrThrow({
      where: {
        id_turnId: {
          id: messageId,
          turnId,
        },
      },
    });
  });
};

export const completeAssistantMessage = (
  input: CompleteAssistantMessageInput,
): Promise<Message> =>
  transitionPendingAssistantMessage({
    ...input,
    transition: {
      status: MessageStatus.COMPLETED,
      content: input.content,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      totalTokens: input.totalTokens,
      timeToFirstTokenMs: input.timeToFirstTokenMs,
      durationMs: input.durationMs,
      tokensPerSecond: input.tokensPerSecond,
    },
  });

export const failAssistantMessage = (
  input: FailAssistantMessageInput,
): Promise<Message> =>
  transitionPendingAssistantMessage({
    ...input,
    transition: {
      status: MessageStatus.FAILED,
      content: requireValue(input.message, "A safe failure message is required."),
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      timeToFirstTokenMs: null,
      durationMs: null,
      tokensPerSecond: null,
    },
  });

export const listThreadsForUser = (userId: string) =>
  prisma.thread.findMany({
    where: { ownerId: requireValue(userId, "A user is required.") },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      title: true,
      isPublic: true,
      createdAt: true,
      updatedAt: true,
    },
  });

export const getThreadById = (threadId: string) =>
  prisma.thread.findUnique({
    where: { id: requireValue(threadId, "A thread is required.") },
    include: {
      owner: true,
      turns: {
        orderBy: [{ position: "asc" }, { id: "asc" }],
        include: {
          messages: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          },
        },
      },
    },
  });

export const castVote = async (input: CastVoteInput): Promise<VoteResult> => {
  const userId = requireValue(input.userId, "A user is required.");
  const threadId = requireValue(input.threadId, "A thread is required.");
  const turnId = requireValue(input.turnId, "A thread turn is required.");
  const messageId = requireValue(input.messageId, "A message is required.");

  return prisma.$transaction(async (tx) => {
    await tx.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId },
    });

    const turn = await tx.turn.findUnique({
      where: { id: turnId },
      include: {
        messages: {
          select: {
            id: true,
            threadId: true,
            model: true,
            role: true,
            status: true,
          },
        },
      },
    });
    assertTurnBelongsToThread(turn, threadId);

    const selectedMessage = turn.messages.find(({ id }) => id === messageId);

    if (selectedMessage === undefined || selectedMessage.threadId !== threadId) {
      throw new DataModelError(
        "NOT_FOUND",
        "The selected model response was not found.",
      );
    }

    if (
      selectedMessage.role !== MessageRole.ASSISTANT ||
      selectedMessage.status !== MessageStatus.COMPLETED
    ) {
      throw new DataModelError(
        "INVALID_STATE",
        "Only completed model responses can receive a vote.",
      );
    }

    const completedModelCount = new Set(
      turn.messages
        .filter(
          ({ role, status }) =>
            role === MessageRole.ASSISTANT && status === MessageStatus.COMPLETED,
        )
        .map(({ model }) => model),
    ).size;

    if (completedModelCount < 2) {
      throw new DataModelError(
        "INVALID_STATE",
        "A vote requires at least two completed model responses.",
      );
    }

    try {
      const vote = await tx.vote.create({
        data: {
          userId,
          threadId,
          turnId,
          messageId,
        },
      });

      return { type: "created", vote };
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002"
      ) {
        throw error;
      }

      const existingVote = await tx.vote.findUnique({
        where: {
          userId_turnId: {
            userId,
            turnId,
          },
        },
      });

      if (existingVote === null) {
        throw error;
      }

      return { type: "already-voted", vote: existingVote };
    }
  });
};
