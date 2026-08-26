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

export type PrepareTurnInput = Readonly<{
  userId: string;
  threadId?: string | null;
  prompt: string;
  models: readonly string[];
}>;

export type PreparedTurn = Readonly<{
  threadId: string;
  turnId: string;
  messages: readonly Readonly<{ id: string; model: string }>[];
}>;

export type ModelConversationMessage = Readonly<{
  role: "user" | "assistant";
  content: string;
}>;

export type ModelTurnContext = Readonly<{
  prompt: string;
  history: readonly ModelConversationMessage[];
}>;

export type PendingAssistantMessage = Readonly<{
  id: string;
  model: string;
  threadId: string;
  turnId: string;
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

export type UpdateThreadVisibilityInput = Readonly<{
  userId: string;
  threadId: string;
  isPublic: boolean;
}>;

export type VoteResult =
  | Readonly<{ type: "created"; vote: Vote }>
  | Readonly<{ type: "already-voted"; vote: Vote }>;

const FREE_MODEL_SUFFIX = ":free";
const MAX_TURN_MODELS = 3;

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

  if (uniqueModels.length > MAX_TURN_MODELS) {
    throw new DataModelError(
      "INVALID_INPUT",
      "Choose no more than three models per turn.",
    );
  }

  if (uniqueModels.some((model) => !model.endsWith(FREE_MODEL_SUFFIX))) {
    throw new DataModelError("INVALID_INPUT", "Only free-tier models can be selected.");
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

const lockThread = async (
  tx: Prisma.TransactionClient,
  threadId: string,
): Promise<void> => {
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
};

const runTransaction = <T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> =>
  prisma.$transaction(callback, {
    maxWait: 10_000,
    timeout: 30_000,
  });

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

  return runTransaction(async (tx) => {
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

  return runTransaction(async (tx) => {
    await lockThread(tx, threadId);

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

export const prepareTurnForUser = async (
  input: PrepareTurnInput,
): Promise<PreparedTurn> => {
  const userId = requireValue(input.userId, "A user is required.");
  const prompt = requireValue(input.prompt, "A non-empty prompt is required.");
  const models = normalizeModels(input.models);
  const requestedThreadId =
    input.threadId === undefined || input.threadId === null
      ? null
      : requireValue(input.threadId, "A thread is required.");

  return runTransaction(async (tx) => {
    await tx.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId },
    });

    let threadId = requestedThreadId;
    let position = 0;

    if (threadId !== null) {
      await lockThread(tx, threadId);

      const thread = await tx.thread.findUnique({
        where: { id: threadId },
        select: { ownerId: true },
      });

      if (thread === null || thread.ownerId !== userId) {
        throw new DataModelError("NOT_FOUND", "The requested thread was not found.");
      }

      const latestTurn = await tx.turn.aggregate({
        where: { threadId },
        _max: { position: true },
      });
      position = (latestTurn._max.position ?? -1) + 1;
    } else {
      const thread = await tx.thread.create({
        data: {
          ownerId: userId,
          title: prompt.replace(/\s+/g, " ").slice(0, 80),
        },
        select: { id: true },
      });
      threadId = thread.id;
    }

    const turn = await tx.turn.create({
      data: {
        threadId,
        position,
        prompt,
      },
      select: { id: true },
    });

    if (requestedThreadId !== null) {
      await tx.thread.update({
        where: { id: threadId },
        data: { updatedAt: new Date() },
      });
    }

    const messages = await Promise.all(
      models.map((model) =>
        tx.message.create({
          data: {
            threadId,
            turnId: turn.id,
            model,
            role: MessageRole.ASSISTANT,
            status: MessageStatus.PENDING,
            content: "",
            costUsd: 0,
          },
          select: { id: true, model: true },
        }),
      ),
    );

    return {
      threadId,
      turnId: turn.id,
      messages,
    };
  });
};

export const createPendingAssistantMessages = async (
  input: CreateAssistantMessagesInput,
): Promise<Message[]> => {
  const threadId = requireValue(input.threadId, "A thread is required.");
  const turnId = requireValue(input.turnId, "A thread turn is required.");
  const models = normalizeModels(input.models);

  return runTransaction(async (tx) => {
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

type AssistantMessageReference = Readonly<{
  userId: string;
  threadId: string;
  turnId: string;
  messageId: string;
  model: string;
}>;

const assistantMessageReferenceWhere = (input: AssistantMessageReference) => ({
  id: requireValue(input.messageId, "A message is required."),
  threadId: requireValue(input.threadId, "A thread is required."),
  turnId: requireValue(input.turnId, "A thread turn is required."),
  model: requireValue(input.model, "A model is required."),
  role: MessageRole.ASSISTANT,
  thread: {
    ownerId: requireValue(input.userId, "A user is required."),
  },
});

export const getPendingAssistantMessage = async (
  input: AssistantMessageReference,
): Promise<PendingAssistantMessage | null> =>
  prisma.message.findFirst({
    where: {
      ...assistantMessageReferenceWhere(input),
      status: MessageStatus.PENDING,
    },
    select: {
      id: true,
      model: true,
      threadId: true,
      turnId: true,
    },
  });

export const claimPendingAssistantMessage = async (
  input: AssistantMessageReference,
): Promise<PendingAssistantMessage | null> => {
  const reference = assistantMessageReferenceWhere(input);
  const result = await prisma.message.updateMany({
    where: {
      ...reference,
      status: MessageStatus.PENDING,
    },
    data: { status: MessageStatus.STREAMING },
  });

  if (result.count !== 1) {
    return null;
  }

  return prisma.message.findUniqueOrThrow({
    where: {
      id_turnId: {
        id: input.messageId,
        turnId: input.turnId,
      },
    },
    select: {
      id: true,
      model: true,
      threadId: true,
      turnId: true,
    },
  });
};

export const getModelTurnContext = async (
  input: Readonly<{
    userId: string;
    threadId: string;
    turnId: string;
    model: string;
  }>,
): Promise<ModelTurnContext> => {
  const userId = requireValue(input.userId, "A user is required.");
  const threadId = requireValue(input.threadId, "A thread is required.");
  const turnId = requireValue(input.turnId, "A thread turn is required.");
  const model = requireValue(input.model, "A model is required.");
  const thread = await prisma.thread.findFirst({
    where: { id: threadId, ownerId: userId },
    select: {
      turns: {
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: {
          id: true,
          position: true,
          prompt: true,
          messages: {
            where: {
              model,
              role: MessageRole.ASSISTANT,
              status: MessageStatus.COMPLETED,
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
            select: { content: true },
          },
        },
      },
    },
  });

  const currentTurn = thread?.turns.find((turn) => turn.id === turnId);

  if (thread === null || currentTurn === undefined) {
    throw new DataModelError("NOT_FOUND", "The requested model turn was not found.");
  }

  const history: ModelConversationMessage[] = thread.turns
    .filter((turn) => turn.position < currentTurn.position)
    .flatMap((turn) => {
      const messages: ModelConversationMessage[] = [
        { role: "user", content: turn.prompt },
      ];
      const assistantMessage = turn.messages[0];

      if (assistantMessage !== undefined) {
        messages.push({ role: "assistant", content: assistantMessage.content });
      }

      return messages;
    });

  return { prompt: currentTurn.prompt, history };
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

const transitionStreamingAssistantMessage = async (
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

  return runTransaction(async (tx) => {
    const result = await tx.message.updateMany({
      where: {
        id: messageId,
        threadId,
        turnId,
        role: MessageRole.ASSISTANT,
        status: MessageStatus.STREAMING,
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
  transitionStreamingAssistantMessage({
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
  transitionStreamingAssistantMessage({
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

export const listThreadsForUser = (userId: string, take = 50) =>
  prisma.thread.findMany({
    where: { ownerId: requireValue(userId, "A user is required.") },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(Math.trunc(take), 1), 100),
    select: {
      id: true,
      title: true,
      isPublic: true,
      createdAt: true,
      updatedAt: true,
    },
  });

const threadConversationInclude = (viewerId: string | null) =>
  ({
    votes: {
      where: viewerId === null ? { id: "anonymous-viewer" } : { userId: viewerId },
      select: { turnId: true, messageId: true },
    },
    turns: {
      orderBy: [{ position: "asc" }, { id: "asc" }],
      include: {
        messages: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      },
    },
  }) satisfies Prisma.ThreadInclude;

type ThreadConversation = Readonly<{
  id: string;
  title: string | null;
  isPublic: boolean;
  votes: ReadonlyArray<Readonly<{ turnId: string; messageId: string }>>;
  turns: ReadonlyArray<
    Readonly<{
      id: string;
      position: number;
      prompt: string;
      messages: ReadonlyArray<
        Readonly<{
          id: string;
          model: string;
          role: MessageRole;
          status: MessageStatus;
          content: string;
          inputTokens: number | null;
          outputTokens: number | null;
          totalTokens: number | null;
          timeToFirstTokenMs: number | null;
          durationMs: number | null;
          tokensPerSecond: number | null;
        }>
      >;
    }>
  >;
}>;

export const serializeThread = (thread: ThreadConversation) => ({
  id: thread.id,
  title: thread.title,
  isPublic: thread.isPublic,
  turns: thread.turns.map((turn) => ({
    id: turn.id,
    position: turn.position,
    prompt: turn.prompt,
    messages: turn.messages.map((message) => ({
      id: message.id,
      model: message.model,
      role: message.role,
      status: message.status,
      content: message.content,
      inputTokens: message.inputTokens,
      outputTokens: message.outputTokens,
      totalTokens: message.totalTokens,
      timeToFirstTokenMs: message.timeToFirstTokenMs,
      durationMs: message.durationMs,
      tokensPerSecond: message.tokensPerSecond,
    })),
    winnerId: thread.votes.find((vote) => vote.turnId === turn.id)?.messageId ?? null,
  })),
});

export const getThreadById = (threadId: string, viewerId: string) =>
  prisma.thread.findUnique({
    where: { id: requireValue(threadId, "A thread is required.") },
    include: {
      owner: true,
      ...threadConversationInclude(requireValue(viewerId, "A user is required.")),
    },
  });

export const getPublicThreadById = (threadId: string, viewerId: string | null = null) =>
  prisma.thread.findFirst({
    where: {
      id: requireValue(threadId, "A thread is required."),
      isPublic: true,
    },
    include: {
      owner: { select: { id: true } },
      ...threadConversationInclude(viewerId),
    },
  });

export const updateThreadVisibility = async (
  input: UpdateThreadVisibilityInput,
): Promise<Readonly<{ id: string; isPublic: boolean }>> => {
  const userId = requireValue(input.userId, "A user is required.");
  const threadId = requireValue(input.threadId, "A thread is required.");
  const result = await prisma.thread.updateMany({
    where: { id: threadId, ownerId: userId },
    data: { isPublic: input.isPublic },
  });

  if (result.count !== 1) {
    throw new DataModelError("NOT_FOUND", "The requested thread was not found.");
  }

  return { id: threadId, isPublic: input.isPublic };
};

export const castVote = async (input: CastVoteInput): Promise<VoteResult> => {
  const userId = requireValue(input.userId, "A user is required.");
  const threadId = requireValue(input.threadId, "A thread is required.");
  const turnId = requireValue(input.turnId, "A thread turn is required.");
  const messageId = requireValue(input.messageId, "A message is required.");

  return runTransaction(async (tx) => {
    await tx.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId },
    });

    const thread = await tx.thread.findUnique({
      where: { id: threadId },
      select: { ownerId: true, isPublic: true },
    });

    if (thread === null || (!thread.isPublic && thread.ownerId !== userId)) {
      throw new DataModelError("NOT_FOUND", "The requested thread was not found.");
    }

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

export type LeaderboardEntry = Readonly<{
  model: string;
  wins: number;
  appearances: number;
  winRate: number;
  averageSpeed: number | null;
  averageTimeToFirstToken: number | null;
}>;

type LeaderboardAccumulator = Readonly<{
  model: string;
  wins: number;
  appearances: number;
  speedTotal: number;
  speedCount: number;
  timeToFirstTokenTotal: number;
  timeToFirstTokenCount: number;
}>;

type LeaderboardMessage = Readonly<{
  id: string;
  model: string;
  status: MessageStatus;
  tokensPerSecond: number | null;
  timeToFirstTokenMs: number | null;
}>;

const addMetric = (
  total: number,
  count: number,
  value: number | null,
): Readonly<{ total: number; count: number }> =>
  value === null ? { total, count } : { total: total + value, count: count + 1 };

const rankLeaderboard = (
  entries: readonly LeaderboardAccumulator[],
): LeaderboardEntry[] =>
  entries
    .map((entry) => ({
      model: entry.model,
      wins: entry.wins,
      appearances: entry.appearances,
      winRate: entry.appearances === 0 ? 0 : entry.wins / entry.appearances,
      averageSpeed: entry.speedCount === 0 ? null : entry.speedTotal / entry.speedCount,
      averageTimeToFirstToken:
        entry.timeToFirstTokenCount === 0
          ? null
          : entry.timeToFirstTokenTotal / entry.timeToFirstTokenCount,
    }))
    .sort(
      (left, right) =>
        right.winRate - left.winRate ||
        right.wins - left.wins ||
        right.appearances - left.appearances ||
        left.model.localeCompare(right.model),
    );

const addLeaderboardMessage = (
  entries: readonly LeaderboardAccumulator[],
  message: LeaderboardMessage,
  winnerMessageId: string,
): LeaderboardAccumulator[] => {
  if (message.status !== MessageStatus.COMPLETED) return [...entries];

  const current = entries.find((entry) => entry.model === message.model) ?? {
    model: message.model,
    wins: 0,
    appearances: 0,
    speedTotal: 0,
    speedCount: 0,
    timeToFirstTokenTotal: 0,
    timeToFirstTokenCount: 0,
  };
  const speed = addMetric(
    current.speedTotal,
    current.speedCount,
    message.tokensPerSecond,
  );
  const timeToFirstToken = addMetric(
    current.timeToFirstTokenTotal,
    current.timeToFirstTokenCount,
    message.timeToFirstTokenMs,
  );
  const nextEntry = {
    ...current,
    wins: current.wins + (message.id === winnerMessageId ? 1 : 0),
    appearances: current.appearances + 1,
    speedTotal: speed.total,
    speedCount: speed.count,
    timeToFirstTokenTotal: timeToFirstToken.total,
    timeToFirstTokenCount: timeToFirstToken.count,
  };

  return entries.some((entry) => entry.model === message.model)
    ? entries.map((entry) => (entry.model === message.model ? nextEntry : entry))
    : [...entries, nextEntry];
};

export const getLeaderboard = async (
  userId: string | null = null,
): Promise<LeaderboardEntry[]> => {
  const votes = await prisma.vote.findMany({
    where: userId === null ? undefined : { userId },
    select: {
      messageId: true,
      turn: {
        select: {
          messages: {
            select: {
              id: true,
              model: true,
              status: true,
              tokensPerSecond: true,
              timeToFirstTokenMs: true,
            },
          },
        },
      },
    },
  });

  const accumulators = votes.reduce<LeaderboardAccumulator[]>(
    (entries, vote) =>
      vote.turn.messages.reduce(
        (nextEntries, message) =>
          addLeaderboardMessage(nextEntries, message, vote.messageId),
        entries,
      ),
    [],
  );

  return rankLeaderboard(accumulators);
};
