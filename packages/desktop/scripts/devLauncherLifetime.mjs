import { randomUUID } from "node:crypto";
import { createServer } from "node:net";

export async function createDevLauncherLifetime() {
  const token = randomUUID();
  const connections = new Set();
  const server = createServer((socket) => {
    connections.add(socket);
    socket.on("close", () => connections.delete(socket));
    socket.on("error", () => {});
    let handshake = "";
    socket.on("data", (chunk) => {
      handshake += chunk.toString();
      if (handshake.length > 128 || (handshake.includes("\n") && handshake !== `${token}\n`)) {
        socket.destroy();
      }
    });
  });
  await new Promise((resolveReady, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveReady);
  });
  let closed = false;
  return {
    env: {
      KAYINGCODE_DESKTOP_DEV_LIFETIME_PORT: String(server.address().port),
      KAYINGCODE_DESKTOP_DEV_LIFETIME_TOKEN: token,
    },
    close() {
      if (closed) return;
      closed = true;
      for (const socket of connections) socket.destroy();
      server.close();
    },
  };
}
