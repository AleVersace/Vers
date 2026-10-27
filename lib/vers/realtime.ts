export interface LatestLoadSequence {
  current: number;
}

export const beginLatestLoad = (sequence: LatestLoadSequence) =>
  ++sequence.current;

export const isLatestLoad = (
  sequence: LatestLoadSequence,
  requestSequence: number,
) => sequence.current === requestSequence;

export const invalidateLatestLoad = (sequence: LatestLoadSequence) => {
  sequence.current += 1;
};

export const createKeyedTaskQueue = () => {
  const tails = new Map<string, Promise<void>>();

  return async <Result>(key: string, task: () => Promise<Result>) => {
    const previous = tails.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.catch(() => undefined).then(() => gate);
    tails.set(key, tail);

    await previous.catch(() => undefined);
    try {
      return await task();
    } finally {
      release();
      if (tails.get(key) === tail) tails.delete(key);
    }
  };
};

export interface RealtimeWatchdogState {
  lastActivityAt: number;
  lastReconciliationAt: number;
  now: number;
  idleAfterMs: number;
  hardAfterMs: number;
}

export const shouldRunRealtimeWatchdog = ({
  lastActivityAt,
  lastReconciliationAt,
  now,
  idleAfterMs,
  hardAfterMs,
}: RealtimeWatchdogState) =>
  now - lastActivityAt >= idleAfterMs ||
  now - lastReconciliationAt >= hardAfterMs;

export class RealtimeDeadlineExceededError extends Error {
  constructor(timeoutMs: number) {
    super(`Realtime reconciliation exceeded ${timeoutMs} ms`);
    this.name = "RealtimeDeadlineExceededError";
  }
}

export const withRealtimeDeadline = <Result>(
  operation: Promise<Result>,
  timeoutMs: number,
) =>
  new Promise<Result>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new RealtimeDeadlineExceededError(timeoutMs));
    }, timeoutMs);

    operation.then(
      (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      },
      (reason) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(reason);
      },
    );
  });

export const mergeNewestEntriesById = <
  Entry extends { id: string; created_at: string },
>(
  serverEntries: Entry[],
  currentEntries: Entry[],
  limit: number,
) => {
  const serverIds = new Set(serverEntries.map((entry) => entry.id));
  return [
    ...serverEntries,
    ...currentEntries.filter((entry) => !serverIds.has(entry.id)),
  ]
    .sort(
      (left, right) =>
        Date.parse(right.created_at) - Date.parse(left.created_at),
    )
    .slice(0, limit);
};
