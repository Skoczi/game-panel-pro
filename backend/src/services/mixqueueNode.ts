import Docker from "dockerode";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import tar from "tar-stream";
import { getConfig } from "../config.js";
import { mqFail } from "./mixqueueContract.js";

export const mqDocker = new Docker({ socketPath: getConfig().dockerSocket });
export const mqRoot = path.join(getConfig().gamepanelDataDir, "mixqueue");
export const mqSources = fileURLToPath(
  new URL("../../../runtime/mixqueue/", import.meta.url),
);
let installation: "idle" | "installing" | "failed" = "idle";
export const sourceHashes: Record<string, string> = {
  "mq_agent.py":
    "ca88f35c1c7ae905ec3b4e7e9f9e6b83653c3ceee57b901fb77782cc6ddb9b72",
  "mq2_match.amxx":
    "9d35397d96fa6e643cf4ea83a52d6d3a84207099d309c0fd136252e014a1731d",
  "mq2_bridge.smx":
    "b86938870e03f318a0eb708864edf327c9a5c7b53a67ef2bb6a3302d728dbf45",
};
export async function verifiedSource(name: string) {
  const data = await fs.readFile(path.join(mqSources, name));
  if (
    !sourceHashes[name] ||
    createHash("sha256").update(data).digest("hex") !== sourceHashes[name]
  )
    throw mqFail("source_verification_failed");
  return data;
}
export async function privateJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = file + "." + randomBytes(8).toString("hex") + ".tmp";
  const handle = await fs.open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(value));
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(temporary, file);
}
export async function readPrivate<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error: any) {
    if (error.code === "ENOENT") return null;
    throw mqFail("configuration_unavailable");
  }
}
export async function mixqueueImage(): Promise<string | null> {
  const saved = await readPrivate<{ image: string }>(
    path.join(mqRoot, "node.json"),
  );
  if (!saved || !/^sha256:[a-f0-9]{64}$/.test(saved.image)) return null;
  try {
    return (await mqDocker.getImage(saved.image).inspect()).Id === saved.image
      ? saved.image
      : null;
  } catch {
    return null;
  }
}
export async function mixqueueNodeStatus() {
  return {
    installed: Boolean(await mixqueueImage()),
    installation,
    version: "0.2.3",
    supervisor: "eserv",
    error: installation === "failed" ? "installation_failed" : null,
  };
}
export function installMixqueueNode() {
  if (installation === "installing") return;
  installation = "installing";
  void (async () => {
    const archive = tar.pack();
    const files = ["Dockerfile", "mq_agent.py", "runner.py"];
    const contents = await Promise.all(
      files.map(async (name) => ({
        name,
        data:
          name === "mq_agent.py"
            ? await verifiedSource(name)
            : await fs.readFile(path.join(mqSources, name)),
      })),
    );
    for (const item of contents)
      archive.entry({ name: item.name, mode: 0o644 }, item.data);
    archive.finalize();
    const tag =
      "gamepanel-mixqueue:" +
      createHash("sha256")
        .update(Buffer.concat(contents.map((c) => c.data)))
        .digest("hex")
        .slice(0, 20);
    const stream = await mqDocker.buildImage(archive, {
      t: tag,
      rm: true,
      forcerm: true,
    });
    await new Promise<void>((resolve, reject) =>
      mqDocker.modem.followProgress(stream, (error) =>
        error ? reject(error) : resolve(),
      ),
    );
    const image = (await mqDocker.getImage(tag).inspect()).Id;
    await privateJson(path.join(mqRoot, "node.json"), {
      image,
      installedAt: Date.now(),
    });
    installation = "idle";
  })().catch(() => {
    installation = "failed";
  });
}

/** Map backend paths to the Docker host. /data is generally NOT /data on the host. */
export async function dockerHostPath(localPath: string): Promise<string> {
  const absolute = path.resolve(localPath);
  if ((await fs.realpath(absolute)) !== absolute)
    throw mqFail("unsafe_storage_path");
  const inContainer = await fs.access("/.dockerenv").then(
    () => true,
    () => false,
  );
  if (!inContainer) return absolute;
  const info = await mqDocker
    .getContainer(process.env.HOSTNAME || "")
    .inspect();
  const mount = info.Mounts.filter(
    (m) =>
      m.Type === "bind" &&
      (absolute === m.Destination || absolute.startsWith(m.Destination + "/")),
  ).sort((a, b) => b.Destination.length - a.Destination.length)[0];
  if (!mount?.Source) throw mqFail("unmapped_storage_path");
  return path.join(mount.Source, path.relative(mount.Destination, absolute));
}
