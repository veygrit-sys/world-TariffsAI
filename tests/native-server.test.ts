import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { shipment } from "./helpers.ts";

test("native HTTP server handles authenticated, unauthenticated and oversized requests", async () => {
  const reservation = createServer();
  await new Promise<void>((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const address = reservation.address();
  if (!address || typeof address === "string")
    throw new Error("PORT_UNAVAILABLE");
  const port = address.port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const key = "synthetic-native-server-service-key-123456";
  const child = spawn(process.execPath, ["dist/server.js"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      VEYGRIT_CUSTOMS_API_KEY: key,
      ALLOW_UNAUTHENTICATED_LOOPBACK: "false",
      VEYGRIT_AI_PROVIDER: "local",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const closed = new Promise<void>((resolve) =>
    child.once("close", () => resolve()),
  );
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("SERVER_START_TIMEOUT")),
        5000,
      );
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", () => {
        clearTimeout(timer);
        reject(new Error("SERVER_EXITED_EARLY"));
      });
      child.stdout.on("data", (chunk) => {
        if (String(chunk).includes("listening on")) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    const base = "http://127.0.0.1:" + port;
    assert.equal((await fetch(base + "/health")).status, 200);
    assert.equal((await fetch(base + "/v1/countries")).status, 401);
    const headers = {
      "content-type": "application/json",
      authorization: "Bearer " + key,
    };
    const response = await fetch(base + "/v1/assess", {
      method: "POST",
      headers,
      body: JSON.stringify(shipment()),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).shippingAuthorized, false);
    const large = await fetch(base + "/v1/ask", {
      method: "POST",
      headers,
      body: JSON.stringify({ question: "x".repeat(70000) }),
    });
    assert.equal(large.status, 413);
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(
          new TextEncoder().encode(
            JSON.stringify({ question: "x".repeat(70000) }),
          ),
        );
        c.close();
      },
    });
    const chunked: RequestInit & { duplex: "half" } = {
      method: "POST",
      headers,
      body: stream,
      duplex: "half",
    };
    assert.equal((await fetch(base + "/v1/ask", chunked)).status, 413);
  } finally {
    child.kill("SIGTERM");
    await closed;
  }
});
