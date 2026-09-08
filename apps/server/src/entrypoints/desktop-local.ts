// Private desktop entrypoint. Configuration is delivered by the native parent.
import { createInterface } from "node:readline";

async function main() {
  if (process.env.ZILOBASE_LOCAL_ENABLED !== "1") throw new Error("Local runtime is not enabled");
  const input = createInterface({ input: process.stdin });
  const configuration = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Native configuration timeout")), 10_000);
    input.once("line", (line) => { clearTimeout(timeout); resolve(line); });
    input.once("close", () => { clearTimeout(timeout); reject(new Error("Native parent disconnected")); });
  });
  const env = JSON.parse(configuration) as Record<string, unknown>;
  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== "string") throw new Error("Invalid native configuration");
    process.env[key] = value;
  }
  const { startLocalServer } = await import("../app/local/server");
  const runtime = await startLocalServer();
  input.once("close", () => { void runtime.close().finally(() => process.exit(0)); });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => { void runtime.close().finally(() => process.exit(0)); });
  }
}
void main().catch(() => {
  console.error(JSON.stringify({ event: "local.start", code: "LOCAL_START_FAILED" }));
  process.exit(1);
});
