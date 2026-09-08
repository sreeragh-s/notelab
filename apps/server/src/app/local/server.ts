import path from "node:path";
import { createApp } from "../index";
import { createNodeRuntime } from "../node/node-runtime";
import { CORE_MIGRATION_SET } from "../../infrastructure/node/migrations";
import { setRuntimeAdapter } from "../../infrastructure/runtime/runtime-adapter";

export async function startLocalServer() {
  const resourceRoot = process.env.ZILOBASE_LOCAL_RESOURCES;
  if (!resourceRoot || !path.isAbsolute(resourceRoot)) throw new Error("Local resources are required");
  setRuntimeAdapter({ mode: "local" });
  const runtime = createNodeRuntime({
    app: createApp(),
    migrationSets: [{ ...CORE_MIGRATION_SET, migrationsFolder: path.join(resourceRoot, "drizzle") }],
    runtimeAdapter: { mode: "local" },
    webDistDir: path.join(resourceRoot, "web"),
  });
  await runtime.migrate();
  await runtime.start();
  return runtime;
}
