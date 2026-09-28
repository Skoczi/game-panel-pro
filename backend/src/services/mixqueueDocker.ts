import Docker from "dockerode";
import type {
  MixqueueAssignment,
  MixqueueRuntime,
} from "./mixqueueSupervisor.js";
import { executorGeneration } from "./mixqueueSupervisor.js";

export type ExecutorFiles = {
  image: string;
  engine: "amxmodx" | "sourcemod";
  configDirectory: string;
  journalDirectory: string;
  stateDirectory: string;
  brokerDirectory: string;
};
const role = "gamepanel.mixqueue.executor";
const identity = "gamepanel.mixqueue.identity";
const generation = "gamepanel.mixqueue.generation";

/** No gamepanel.managed label: game-server reconciliation must not adopt executors. */
export function executorContainerOptions(
  nodeId: string,
  a: MixqueueAssignment,
  files: ExecutorFiles,
): Docker.ContainerCreateOptions {
  if (
    !/^[a-zA-Z0-9_-]{1,64}$/.test(nodeId) ||
    !/^[a-f0-9]{32}$/.test(a.runtimeKey) ||
    !/^sha256:[a-f0-9]{64}$/.test(files.image)
  )
    throw new Error("invalid_mixqueue_executor");
  if (!["amxmodx", "sourcemod"].includes(files.engine))
    throw new Error("invalid_mixqueue_engine");
  const mounts = [
    [files.configDirectory, `/game/addons/${files.engine}/configs/mq2`, false],
    [files.journalDirectory, "/journal", true],
    [files.stateDirectory, "/state", false],
    [files.brokerDirectory, "/broker", true],
  ] as const;
  for (const [source] of mounts)
    if (!source.startsWith("/") || source.includes("\0"))
      throw new Error("invalid_mixqueue_mount");
  return {
    name: `gp-mq2-${nodeId}-${a.runtimeKey}`,
    Image: files.image,
    User: "1000:1000",
    Labels: {
      [role]: "true",
      "gamepanel.node": nodeId,
      [identity]: a.runtimeKey,
      [generation]: executorGeneration(a),
    },
    HostConfig: {
      NetworkMode: "none",
      ReadonlyRootfs: true,
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges:true"],
      Memory: 128 * 1024 * 1024,
      MemorySwap: 128 * 1024 * 1024,
      NanoCpus: 250_000_000,
      PidsLimit: 32,
      RestartPolicy: { Name: "no" },
      Init: true,
      LogConfig: {
        Type: "json-file",
        Config: { "max-size": "1m", "max-file": "2" },
      },
      Mounts: mounts.map(([Source, Target, ReadOnly]) => ({
        Type: "bind",
        Source,
        Target,
        ReadOnly,
        BindOptions: { Propagation: "rprivate" },
      })),
    },
  };
}

/** Uses a separate Docker handle with explicit executor ownership, not game-server permissions. */
export class MixqueueDockerRuntime implements MixqueueRuntime {
  constructor(
    private docker: Docker,
    private nodeId: string,
    private prepare: (assignment: MixqueueAssignment) => Promise<ExecutorFiles>,
    private closeBroker: (key: string) => Promise<void>,
  ) {}

  private owned(labels: Record<string, string> = {}): boolean {
    return (
      labels[role] === "true" &&
      labels["gamepanel.node"] === this.nodeId &&
      /^[a-f0-9]{32}$/.test(labels[identity] || "")
    );
  }

  private async containers() {
    return (
      await this.docker.listContainers({
        all: true,
        filters: { label: [`${role}=true`, `gamepanel.node=${this.nodeId}`] },
      })
    ).filter((container) => this.owned(container.Labels));
  }

  async list() {
    const result = new Map<string, { generation: string; running: boolean; image: string }>();
    for (const item of await this.containers()) {
      const key = item.Labels[identity];
      if (result.has(key)) throw new Error("duplicate_mixqueue_executor");
      result.set(key, {
        generation: item.Labels[generation],
        running: item.State === "running",
        image: item.ImageID,
      });
    }
    return result;
  }

  async start(assignment: MixqueueAssignment): Promise<void> {
    const files = await this.prepare(assignment);
    const options = executorContainerOptions(this.nodeId, assignment, files);
    try {
      // Docker's unique name is an additional cross-request/cross-process duplicate guard.
      const container = await this.docker.createContainer(options);
      try {
        await container.start();
      } catch (error) {
        await container.remove({ force: true }).catch(() => {});
        throw error;
      }
    } catch {
      await this.closeBroker(assignment.runtimeKey);
      throw new Error("mixqueue_executor_start_failed");
    }
  }

  async stop(key: string): Promise<void> {
    // Revoke RCON/API capabilities before stopping Python; no new match can start while stopping.
    await this.closeBroker(key);
    for (const item of await this.containers()) {
      if (item.Labels[identity] !== key) continue;
      const container = this.docker.getContainer(item.Id);
      const current = await container.inspect();
      if (
        !this.owned(current.Config.Labels || {}) ||
        current.Config.Labels?.[identity] !== key
      )
        throw new Error("mixqueue_executor_ownership_changed");
      await container.remove({ force: true });
    }
  }
}
