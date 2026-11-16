import { createServer } from "node:http";
import { createHandler } from "./http.ts";
import { loadOperationalTariffCatalog } from "./tariffs.ts";
import { loadDataset } from "./dataset.ts";
import { OllamaEvidenceSelector } from "./ollama.ts";

const host = process.env.HOST ?? "127.0.0.1",
  port = Number(process.env.PORT ?? 3008);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
  throw new Error("INVALID_PORT");
const loopback = ["127.0.0.1", "::1"].includes(host);
const dev = process.env.ALLOW_UNAUTHENTICATED_LOOPBACK === "true";
if (dev && !loopback) throw new Error("UNAUTHENTICATED_MODE_REQUIRES_LOOPBACK");
const provider = process.env.VEYGRIT_AI_PROVIDER ?? "local";
if (!["local", "ollama"].includes(provider))
  throw new Error("UNKNOWN_AI_PROVIDER");
const selector =
  provider === "ollama"
    ? new OllamaEvidenceSelector({
        baseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
        model: process.env.OLLAMA_MODEL ?? "",
      })
    : undefined;
const dataset = loadDataset();
const handle = createHandler({
  dataset,
  tariffs: loadOperationalTariffCatalog(dataset),
  apiKey: process.env.VEYGRIT_CUSTOMS_API_KEY ?? "",
  allowUnauthenticatedLoopback: dev,
  ...(selector ? { selector } : {}),
});
const server = createServer(async (req, res) => {
  try {
    if (!req.url?.startsWith("/")) {
      res.writeHead(400).end();
      return;
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) headers.set(key, value.join(","));
      else if (value !== undefined) headers.set(key, value);
    }
    const init: RequestInit & { duplex?: "half" } = {
      method: req.method ?? "GET",
      headers,
      signal: AbortSignal.timeout(20000),
    };
    if (!["GET", "HEAD"].includes(init.method!)) {
      // Cancelling a Web reader must not destroy the HTTP socket before an error response is sent.
      let finished = false;
      init.body = new ReadableStream<Uint8Array>({
        start(controller) {
          req.on("data", (chunk: Buffer) => {
            if (!finished) {
              controller.enqueue(chunk);
              req.pause();
            }
          });
          req.once("end", () => {
            if (!finished) {
              finished = true;
              controller.close();
            }
          });
          req.once("error", () => {
            if (!finished) {
              finished = true;
              controller.error(new Error("REQUEST_STREAM_FAILED"));
            }
          });
        },
        pull() {
          req.resume();
        },
        cancel() {
          finished = true;
          req.resume();
        },
      });
      init.duplex = "half";
    }
    const request = new Request("http://localhost" + req.url, init);
    const response = await handle(request, {
      peer: req.socket.remoteAddress ?? "unknown",
    });
    if (request.body && !request.body.locked)
      await request.body.cancel().catch(() => {});
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    if (!res.headersSent) res.writeHead(400, { "cache-control": "no-store" });
    res.end();
  }
});
server.headersTimeout = 10000;
server.requestTimeout = 20000;
server.keepAliveTimeout = 5000;
server.listen(port, host, () =>
  process.stdout.write(`Veygrit Customs AI listening on ${host}:${port}\n`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => server.close(() => process.exit(0)));
