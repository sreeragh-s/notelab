// Private desktop entrypoint: native-owned stdin carries configuration and lifetime.
import { createInterface } from "node:readline";
import { startLocalDatabase, grantLocalApplicationAccess } from "../app/local/database-process";

async function main() {
  if (process.env.ZILOBASE_LOCAL_ENABLED !== "1") throw new Error("Local runtime is not enabled");
  const input = createInterface({ input: process.stdin });
  const configuration = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Native configuration timeout")), 10_000);
    input.once("line", (line) => { clearTimeout(timeout); resolve(line); });
    input.once("close", () => { clearTimeout(timeout); reject(new Error("Native parent disconnected")); });
  });
  const env = JSON.parse(configuration) as Record<string, unknown>;
  for (const key of ["ZILOBASE_LOCAL_ROOT", "ZILOBASE_LOCAL_RESOURCES"] as const) {
    if (typeof env[key] !== "string" || !env[key].startsWith("/")) throw new Error("Invalid native configuration");
    process.env[key] = env[key];
  }
  let database: Awaited<ReturnType<typeof startLocalDatabase>> | undefined;
  let runtime: Awaited<ReturnType<typeof import("../app/local/server")["startLocalServer"]>> | undefined;
  let stopping = false;
  let starting = true;
  let parentGone = false;
  const close = async () => {
    parentGone = true;
    if (starting || stopping) return;
    stopping = true;
    await runtime?.close().catch(() => undefined);
    await database?.stop();
    process.exit(0);
  };
  input.once("close", () => { void close(); });
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void close(); });
  try {
    database = await startLocalDatabase(process.env.ZILOBASE_LOCAL_ROOT!, process.env.ZILOBASE_LOCAL_RESOURCES!);
    Object.assign(process.env, {
      DATABASE_URL: database.adminUrl,
      BETTER_AUTH_SECRET: database.authSecret,
      ZILOBASE_BOOTSTRAP_TOKEN: database.authSecret,
      BETTER_AUTH_URL: "http://127.0.0.1:1",
      CLIENT_URL: "tauri://localhost",
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      OTEL_SDK_DISABLED: "true",
    });
    console.log(JSON.stringify({ event: "local.phase", phase: "migrating" }));
    const { startLocalServer } = await import("../app/local/server");
    runtime = await startLocalServer(async () => {
      await grantLocalApplicationAccess(database!.adminUrl);
      process.env.DATABASE_URL = database!.appUrl;
    });
    starting = false;
    if (parentGone) { await close(); return; }
    const address = runtime.server.address();
    if (!address || typeof address === "string") throw new Error("Local HTTP listener is unavailable");
    const apiOrigin = `http://127.0.0.1:${address.port}`;
    process.env.BETTER_AUTH_URL = apiOrigin;
    console.log(JSON.stringify({ event: "local.ready", apiOrigin, installationId: database.installationId }));
  } catch (error) {
    await runtime?.close().catch(() => undefined);
    await database?.stop();
    throw error;
  }
}
void main().catch(() => {
  console.error(JSON.stringify({ event: "local.start", code: "LOCAL_START_FAILED" }));
  process.exit(1);
});
