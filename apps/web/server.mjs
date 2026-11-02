import { readFileSync } from "node:fs";
import { createServer } from "node:https";
import next from "next";

const hostname = process.env.HOSTNAME ?? "127.0.0.1";
const port = Number(process.env.PORT ?? "4175");
const certificatePath = process.env.TLS_CERT_FILE;
const privateKeyPath = process.env.TLS_KEY_FILE;

if (hostname !== "127.0.0.1" && hostname !== "::1") {
  throw new Error("Chron must bind its HTTPS server to loopback.");
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}

if (!certificatePath || !privateKeyPath) {
  throw new Error("TLS_CERT_FILE and TLS_KEY_FILE are required.");
}

const app = next({ dev: false, hostname, port });
await app.prepare();

const handle = app.getRequestHandler();
const server = createServer(
  {
    cert: readFileSync(certificatePath),
    key: readFileSync(privateKeyPath),
  },
  (request, response) => {
    void handle(request, response).catch(() => {
      if (!response.headersSent) {
        response.writeHead(500).end();
      } else {
        response.destroy();
      }
    });
  },
);

let isClosing = false;

async function closeServer() {
  if (isClosing) return;
  isClosing = true;

  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();

  try {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await app.close();
  } catch {
    process.exitCode = 1;
  } finally {
    clearTimeout(forceExit);
  }
}

process.once("SIGINT", closeServer);
process.once("SIGTERM", closeServer);

server.on("error", () => {
  process.exitCode = 1;
  void closeServer();
});

server.listen(port, hostname);
