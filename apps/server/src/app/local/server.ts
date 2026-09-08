import { Hono } from "hono";
import { LocalFileStorage } from "../../infrastructure/storage/local/filesystem-storage";
import type { AppBindings } from "../../shared/types";
import path from "node:path";
import { createApp } from "../index";
import { createNodeRuntime } from "../node/node-runtime";
import { CORE_MIGRATION_SET } from "../../infrastructure/node/migrations";
import { setRuntimeAdapter } from "../../infrastructure/runtime/runtime-adapter";

export async function startLocalServer(afterMigrate?: () => Promise<void>) {
  const resourceRoot = process.env.ZILOBASE_LOCAL_RESOURCES;
  if (!resourceRoot || !path.isAbsolute(resourceRoot)) throw new Error("Local resources are required");
  const storage = new LocalFileStorage(path.join(process.env.ZILOBASE_LOCAL_ROOT!, "objects"), process.env.BETTER_AUTH_SECRET!, () => process.env.BETTER_AUTH_URL!);
  await storage.checkReady();
  const adapter = { mode: "local" as const, createImageStorage: () => storage, getImageStorageMode: () => "binding" as const };
  setRuntimeAdapter(adapter);
  const app = new Hono<AppBindings>();
  app.get("/api/local/objects/:id", async c => {
    if (!storage.verifyRead(c.req.param("id"), Number(c.req.query("expires")), c.req.query("token") ?? "")) return c.json({ error: "Forbidden" }, 403);
    const object = await storage.getById(c.req.param("id"));
    if (!object) return c.notFound();
    return new Response(object.body, { headers: { "content-type": object.contentType ?? "application/octet-stream", "content-length": String(object.byteSize), "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  });
  app.route("/", createApp());
  const runtime = createNodeRuntime({
    app,
    migrationSets: [{ ...CORE_MIGRATION_SET, migrationsFolder: path.join(resourceRoot, "drizzle") }],
    runtimeAdapter: adapter,
    webDistDir: path.join(resourceRoot, "web"),
  });
  await runtime.migrate();
  await afterMigrate?.();
  await runtime.start();
  return runtime;
}
