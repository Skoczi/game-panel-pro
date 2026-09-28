import { test } from "node:test";
import assert from "node:assert/strict";
import dgram from "node:dgram";
import net from "node:net";
import { mixqueueRcon } from "../src/services/mixqueueRcon.js";

test("GoldSrc uses its assigned password and challenge, returns plugin status", async () => {
  const server = dgram.createSocket("udp4");
  await new Promise<void>((resolve) => server.bind(0, "127.0.0.1", resolve));
  const commands: string[] = [];
  server.on("message", (message, peer) => {
    const body = message.subarray(4).toString();
    commands.push(body);
    const answer = body.startsWith("challenge")
      ? "challenge rcon 123\n"
      : 'l{"bridge":1,"healthy":true,"idle":true}\n';
    server.send(
      Buffer.concat([Buffer.from([255, 255, 255, 255]), Buffer.from(answer)]),
      peer.port,
      peer.address,
    );
  });
  try {
    const result = await mixqueueRcon(
      {
        host: "127.0.0.1",
        port: server.address().port,
        password: "test-secret",
        game: "cs16",
      },
      "mq2_status",
    );
    assert.equal(JSON.parse(result).bridge, 1);
    assert.equal(commands[1], 'rcon 123 "test-secret" mq2_status\n');
  } finally {
    server.close();
  }
});

test("Source handles fragmented authentication and command response", async () => {
  const requests: Array<{ id: number; type: number; body: string }> = [];
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    socket.on("data", (data) => {
      buffer = Buffer.concat([buffer, data]);
      while (buffer.length >= 4 && buffer.length >= buffer.readInt32LE(0) + 4) {
        const length = buffer.readInt32LE(0) + 4,
          request = buffer.subarray(0, length);
        buffer = buffer.subarray(length);
        const id = request.readInt32LE(4),
          type = request.readInt32LE(8);
        requests.push({ id, type, body: request.subarray(12, -2).toString() });
        const body = id === 1 ? "" : '{"bridge":1,"idle":true}';
        const response = Buffer.alloc(Buffer.byteLength(body) + 14);
        response.writeInt32LE(response.length - 4, 0);
        response.writeInt32LE(id, 4);
        response.writeInt32LE(id === 1 ? 2 : 0, 8);
        response.write(body, 12);
        socket.write(response.subarray(0, 3));
        socket.write(response.subarray(3));
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const result = await mixqueueRcon(
      {
        host: "127.0.0.1",
        port: (server.address() as net.AddressInfo).port,
        password: "source-secret",
        game: "csgo",
      },
      "mq2_status",
    );
    assert.equal(JSON.parse(result).bridge, 1);
    assert.deepEqual(
      requests.map((r) => r.body),
      ["source-secret", "mq2_status"],
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
