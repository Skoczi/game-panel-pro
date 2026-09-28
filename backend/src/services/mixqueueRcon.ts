import dgram from "node:dgram";
import net from "node:net";

export type MixqueueRconTarget = {
  host: string;
  port: number;
  password: string;
  game: string;
};

/** Target is resolved by the node, never by an imported export or executor request. */
export async function mixqueueRcon(
  target: MixqueueRconTarget,
  command: string,
): Promise<string> {
  if (
    !net.isIP(target.host) ||
    !Number.isInteger(target.port) ||
    target.port < 1 ||
    target.port > 65535
  )
    throw new Error("rcon_target_unavailable");
  if (!target.password || /[\x00-\x1f"\x7f]/.test(target.password))
    throw new Error("rcon_credentials_unavailable");
  return target.game === "cs16"
    ? goldsrc(target, command)
    : source(target, command);
}

function goldsrc(target: MixqueueRconTarget, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket(
      net.isIP(target.host) === 6 ? "udp6" : "udp4",
    );
    let done = false,
      phase = 0;
    const finish = (value?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.close();
      if (value === undefined) reject(new Error("rcon_unavailable"));
      else resolve(value);
    };
    const timer = setTimeout(() => finish(), 5000);
    socket.on("error", () => finish());
    socket.on("message", (packet) => {
      if (packet.length < 5 || packet.readUInt32LE(0) !== 0xffffffff)
        return finish();
      const text = packet.subarray(4).toString("utf8").replace(/\0+$/, "");
      if (phase === 0) {
        const challenge = /^challenge rcon (-?\d+)\s*$/.exec(text);
        if (!challenge) return finish();
        phase = 1;
        socket.send(
          Buffer.concat([
            Buffer.from([255, 255, 255, 255]),
            Buffer.from(
              `rcon ${challenge[1]} "${target.password}" ${command}\n`,
            ),
          ]),
          (error) => {
            if (error) finish();
          },
        );
      } else {
        if (!text.startsWith("l")) return finish();
        finish(text.slice(1));
      }
    });
    socket.connect(target.port, target.host, () => {
      socket.send(
        Buffer.from("ffffffff6368616c6c656e67652072636f6e0a", "hex"),
        (error) => {
          if (error) finish();
        },
      );
    });
  });
}

function source(target: MixqueueRconTarget, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let done = false,
      authenticated = false,
      buffer = Buffer.alloc(0);
    const finish = (value?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      if (value === undefined) reject(new Error("rcon_unavailable"));
      else resolve(value);
    };
    const timer = setTimeout(() => finish(), 5000);
    const send = (id: number, type: number, body: string) => {
      const data = Buffer.from(body),
        packet = Buffer.alloc(data.length + 14);
      packet.writeInt32LE(data.length + 10, 0);
      packet.writeInt32LE(id, 4);
      packet.writeInt32LE(type, 8);
      data.copy(packet, 12);
      socket.write(packet);
    };
    socket.on("error", () => finish());
    socket.on("end", () => finish());
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > 65536) return finish();
      while (buffer.length >= 4) {
        const size = buffer.readInt32LE(0);
        if (size < 10 || size > 65532) return finish();
        if (buffer.length < size + 4) return;
        const packet = buffer.subarray(0, size + 4);
        buffer = buffer.subarray(size + 4);
        const id = packet.readInt32LE(4),
          type = packet.readInt32LE(8);
        if (
          id === -1 ||
          packet[packet.length - 1] !== 0 ||
          packet[packet.length - 2] !== 0
        )
          return finish();
        if (!authenticated && id === 1 && type === 2) {
          authenticated = true;
          send(2, 2, command);
        } else if (authenticated && id === 2 && type === 0) {
          // MixQueue command responses are small JSON/acknowledgements, not console dumps.
          return finish(packet.subarray(12, -2).toString("utf8"));
        }
      }
    });
    socket.connect(target.port, target.host, () => send(1, 3, target.password));
  });
}
