/** One supervisor in the existing ESERV node runtime; executors are server-scoped. */
export type MixqueueAssignment = {
  runtimeKey: string;
  revision: string;
  enabled: boolean;
  gameRunning: boolean;
  gameGeneration: string;
};
export type MixqueueExecutor = { generation: string; running: boolean };
export interface MixqueueRuntime {
  list(): Promise<Map<string, MixqueueExecutor>>;
  start(assignment: MixqueueAssignment): Promise<void>;
  stop(runtimeKey: string): Promise<void>;
}
export type ExecutorHealth = {
  failures: number;
  retryAt: number;
  error: "executor_unavailable" | null;
};

export function executorGeneration(a: MixqueueAssignment): string {
  return `${a.revision}:${a.gameGeneration}`;
}

/** Serial reconciliation prevents duplicate starts. Failures/backoff belong to an individual server. */
export class MixqueueSupervisor {
  private tail: Promise<void> = Promise.resolve();
  private health = new Map<string, ExecutorHealth>();
  private closed = false;
  constructor(
    private runtime: MixqueueRuntime,
    private now = Date.now,
  ) {}

  status(key: string): ExecutorHealth {
    return {
      ...(this.health.get(key) || { failures: 0, retryAt: 0, error: null }),
    };
  }

  reconcile(assignments: MixqueueAssignment[]): Promise<void> {
    // Capture input so callers cannot change a queued reconciliation after authorization.
    const snapshot = assignments.map((a) => ({ ...a }));
    const operation = this.tail.then(() => this.run(snapshot));
    this.tail = operation.catch(() => {});
    return operation;
  }

  private async run(assignments: MixqueueAssignment[]): Promise<void> {
    if (this.closed) return;
    const seen = new Set<string>();
    for (const assignment of assignments) {
      if (
        !/^[a-f0-9]{32}$/.test(assignment.runtimeKey) ||
        seen.has(assignment.runtimeKey)
      )
        throw new Error("invalid_mixqueue_assignment");
      seen.add(assignment.runtimeKey);
    }
    const actual = await this.runtime.list();
    const desired = new Map(assignments.map((a) => [a.runtimeKey, a]));
    // Removed identities are stopped even if another assignment is failing.
    for (const key of actual.keys()) {
      if (!desired.has(key))
        await this.attempt(key, () => this.runtime.stop(key), false);
    }
    for (const a of assignments) {
      const executor = actual.get(a.runtimeKey);
      if (!a.enabled || !a.gameRunning) {
        if (executor)
          await this.attempt(
            a.runtimeKey,
            () => this.runtime.stop(a.runtimeKey),
            false,
          );
        continue;
      }
      if (executor?.running && executor.generation === executorGeneration(a))
        continue;
      // Retire stale generation immediately, even during a previous start's backoff.
      if (
        executor &&
        !(await this.attempt(
          a.runtimeKey,
          () => this.runtime.stop(a.runtimeKey),
          false,
        ))
      )
        continue;
      if (this.status(a.runtimeKey).retryAt > this.now()) continue;
      await this.attempt(a.runtimeKey, () => this.runtime.start(a), true);
    }
  }

  private async attempt(
    key: string,
    action: () => Promise<void>,
    clearOnSuccess: boolean,
  ): Promise<boolean> {
    try {
      await action();
      if (clearOnSuccess) this.health.delete(key);
      return true;
    } catch {
      const failures = Math.min(10, this.status(key).failures + 1);
      this.health.set(key, {
        failures,
        retryAt: this.now() + Math.min(60_000, 1000 * 2 ** (failures - 1)),
        error: "executor_unavailable",
      });
      return false;
    }
  }

  /** Retry is explicit and scoped; it never resets a neighbour's backoff or event database. */
  retry(key: string): void {
    this.health.delete(key);
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.tail;
    const actual = await this.runtime.list();
    const results = await Promise.allSettled(
      [...actual.keys()].map((key) => this.runtime.stop(key)),
    );
    if (results.some((result) => result.status === "rejected"))
      throw new Error("mixqueue_shutdown_incomplete");
  }
}
