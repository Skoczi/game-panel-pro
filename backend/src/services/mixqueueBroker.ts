import http from "node:http";
import fs from "node:fs/promises";
import { createHmac } from "node:crypto";
import { allowedMixqueueCommand, validMixqueueReport, MQ_API } from "./mixqueueContract.js";

export type BrokerIdentity = { serverId: string; game: string; key: string };
export type BrokerDependencies = {
  /** Re-check current game generation and enabled assignment on EVERY request. */
  authorize(): Promise<BrokerIdentity>;
  rcon(command: string): Promise<string>;
};

/** No endpoint, path or credentials are accepted from the executor. */
export async function startMixqueueBroker(
  socketPath: string,
  dependencies: BrokerDependencies,
) {
  let closed = false,
    busy = false;
  const connections = new Set<import("node:net").Socket>();
  const requests = new Set<AbortController>();
  const server = http.createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    const reject = (status = 503) => {
      if (!response.writableEnded) {
        response.statusCode = status;
        response.end('{"error":"broker_unavailable"}');
      }
    };
    if (
      closed ||
      busy ||
      request.method !== "POST" ||
      !["/rcon", "/matchmaking"].includes(request.url || "")
    ) {
      reject(403);
      request.resume();
      return;
    }
    busy = true;
    const controller = new AbortController();
    requests.add(controller);
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 131072) throw new Error("request_too_large");
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const identity = await dependencies.authorize();
      if (closed) throw new Error("revoked");
      let result: unknown;
      if (request.url === "/rcon") {
        if (
          !body ||
          Object.keys(body).length !== 1 ||
          !allowedMixqueueCommand(body.command, identity.game)
        )
          throw new Error("invalid_command");
        result = { result: await dependencies.rcon(body.command) };
      } else {
        if (!body || !["poll", "event"].includes(body.action))
          throw new Error("invalid_action");
        const allowed =
          body.action === "poll"
            ? ["action", "healthy", "observation"]
            : ["action", "event"];
        if (Object.keys(body).some((key) => !allowed.includes(key)))
          throw new Error("invalid_body");
        if (!validMixqueueReport(body)) throw new Error("invalid_report");
        const raw = JSON.stringify(body),
          timestamp = String(Math.floor(Date.now() / 1000));
        const signature = createHmac("sha256", identity.key)
          .update(identity.serverId + "\n" + timestamp + "\n" + raw)
          .digest("hex");
        const upstream = await fetch(MQ_API, {
          method: "POST",
          redirect: "error",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "X-MQ-Server": identity.serverId,
            "X-MQ-Time": timestamp,
            "X-MQ-Signature": signature,
          },
          body: raw,
        });
        if (!upstream.ok || !upstream.body)
          throw new Error("upstream_rejected");
        const reader = upstream.body.getReader();
        const resultChunks: Uint8Array[] = [];
        let length = 0;
        try {
          while (true) {
            const item = await reader.read();
            if (item.done) break;
            length += item.value.length;
            if (length > 1048576) throw new Error("response_too_large");
            resultChunks.push(item.value);
          }
        } finally {
          await reader.cancel();
        }
        result = JSON.parse(Buffer.concat(resultChunks).toString("utf8"));
      }
      // Revocation during an upstream request must not hand a match to a stopped executor.
      if (closed) throw new Error("revoked");
      response.end(JSON.stringify(result));
    } catch {
      reject();
    } finally {
      clearTimeout(timeout);
      requests.delete(controller);
      busy = false;
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.on("connection", (socket) => {
    connections.add(socket);
    socket.on("close", () => connections.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  await fs.chmod(socketPath, 0o600);
  await fs.chown(socketPath, 1000, 1000);
  return {
    async close() {
      closed = true;
      for (const request of requests) request.abort();
      for (const socket of connections) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
