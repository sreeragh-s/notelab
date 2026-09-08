import path from "node:path";
import { createInterface } from "node:readline";
import { startLocalDatabase } from "../app/local/database-process";
import { backupLocalWorkspace, restoreLocalWorkspace, retainDailyBackups } from "../app/local/backups";
async function main() {
  if (process.env.ZILOBASE_LOCAL_ENABLED !== "1") throw new Error("Local support is disabled");
  const input = createInterface({ input: process.stdin });
  const line = await new Promise<string>((resolve, reject) => { input.once("line", resolve); input.once("close", () => reject(new Error("Native parent disconnected"))); });
  let finished = false;
  input.once("close", () => { if (!finished) process.exit(1); });
  const config = JSON.parse(line);
  for (const key of ["ZILOBASE_LOCAL_ROOT", "ZILOBASE_LOCAL_RESOURCES"]) if (typeof config[key] !== "string" || !config[key].startsWith("/")) throw new Error("Invalid maintenance configuration");
  Object.assign(process.env, { ZILOBASE_LOCAL_ROOT: config.ZILOBASE_LOCAL_ROOT, ZILOBASE_LOCAL_RESOURCES: config.ZILOBASE_LOCAL_RESOURCES });
  const root = config.ZILOBASE_LOCAL_ROOT, resources = config.ZILOBASE_LOCAL_RESOURCES;
  let result;
  if (config.operation === "restore") {
    if (typeof config.file !== "string" || !config.file.startsWith("/")) throw new Error("Choose a backup file");
    result = await restoreLocalWorkspace(root, resources, config.file);
  } else if (["backup", "daily-backup"].includes(config.operation)) {
    const database = await startLocalDatabase(root, resources);
    try { result = await backupLocalWorkspace(root, resources, database.adminUrl, config.operation === "daily-backup" ? path.join(root, "backups", `daily-${new Date().toISOString().slice(0, 10)}.zilobackup`) : config.file || undefined);
      if (config.operation === "daily-backup") await retainDailyBackups(root); }
    finally { await database.stop(); }
  } else throw new Error("Unknown maintenance action");
  console.log(JSON.stringify({ event: "local.maintenance", result }));
  finished = true;
  input.close();
}
void main().then(() => process.exit(0)).catch(error => { console.log(JSON.stringify({ event: "local.maintenance", error: error instanceof Error ? error.message : "Maintenance failed" })); process.exit(1); });
