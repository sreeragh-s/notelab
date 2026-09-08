import { createHash } from "node:crypto";
import { inspectLocalSchema, recordLocalSchema } from "./schema-compatibility";
import { createDbClientForUrl } from "../../infrastructure/database";
import { runMigrationSets, CORE_MIGRATION_SET } from "../../infrastructure/node/migrations";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cp, mkdir, mkdtemp, readFile, readdir, stat, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { z } from "zod";
import { createLocalArchive, extractLocalArchive } from "../../infrastructure/local/archive";
import { startLocalDatabase, grantLocalApplicationAccess } from "./database-process";
const execute = promisify(execFile);
function pgEnvironment(url: string) {
  const parsed = new URL(url);
  return { PATH: "/usr/bin:/bin", PGHOST: parsed.searchParams.get("host")!, PGUSER: decodeURIComponent(parsed.username), PGPASSWORD: decodeURIComponent(parsed.password), PGDATABASE: "postgres" };
}
async function copyIfPresent(source: string, destination: string) {
  try {
    await cp(source, destination, { recursive: true, filter: async sourcePath => {
      const { lstat } = await import("node:fs/promises");
      if ((await lstat(sourcePath)).isSymbolicLink()) throw new Error("Backup paths must not contain symlinks");
      return true;
    } });
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}
/** The caller must stop all application writers while retaining the installation lock. */
async function changeFingerprint(root: string, adminUrl: string) {
  const hash = createHash("sha256");
  const client = new Client({ connectionString: adminUrl }); await client.connect();
  try {
    const rows = await client.query("select relname, n_tup_ins, n_tup_upd, n_tup_del from pg_stat_user_tables where schemaname = 'public' and relname not in ('session', 'verification') order by relname");
    hash.update(JSON.stringify(rows.rows));
  } finally { await client.end(); }
  async function visit(directory: string) {
    const entries = await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return []; throw error; });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const filename = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Backup paths must not contain symlinks");
      if (entry.isDirectory()) await visit(filename);
      else { const info = await stat(filename); hash.update(JSON.stringify([path.relative(root, filename), info.size, info.mtimeMs])); }
    }
  }
  for (const directory of ["objects", "recordings", "native-recordings"]) await visit(path.join(root, directory));
  hash.update(await readFile(path.join(root, "local-services.json")).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return ""; throw error; }));
  return hash.digest("hex");
}
export async function backupLocalWorkspace(root: string, resources: string, adminUrl: string, destination?: string, onlyIfChanged = false) {
  await mkdir(path.join(root, "staging"), { recursive: true, mode: 0o700 });
  await mkdir(path.join(root, "backups"), { recursive: true, mode: 0o700 });
  const fingerprint = await changeFingerprint(root, adminUrl);
  const statusPath = path.join(root, "backups/status.json");
  const previous = await readFile(statusPath, "utf8").then(value => JSON.parse(value)).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error; });
  if (onlyIfChanged && previous?.fingerprint === fingerprint) {
    await writeFile(statusPath, JSON.stringify({ ...previous, lastCheckedAt: new Date().toISOString() }), { mode: 0o600 });
    return { skipped: true };
  }
  const snapshot = await mkdtemp(path.join(root, "staging/backup-"));
  try {
    const secrets = JSON.parse(await readFile(path.join(root, "secrets/database.json"), "utf8"));
    await writeFile(path.join(snapshot, "content-keys.json"), JSON.stringify({ auth: secrets.auth }), { mode: 0o600 });
    await cp(path.join(root, "manifest.json"), path.join(snapshot, "installation.json"));
    await execute(path.join(resources, "postgres/bin/pg_dump"), ["--format=custom", "--no-owner", "--no-acl", "--exclude-table-data=public.session", "--exclude-table-data=public.verification", "--file", path.join(snapshot, "database.dump")], { env: pgEnvironment(adminUrl), timeout: 600_000 });
    for (const folder of ["objects", "recordings", "native-recordings"]) await copyIfPresent(path.join(root, folder), path.join(snapshot, folder));
    await copyIfPresent(path.join(root, "local-services.json"), path.join(snapshot, "local-services.json"));
    const archive = destination ?? path.join(root, "backups", `workspace-${new Date().toISOString().replace(/[:.]/g, "-")}.zilobackup`);
    if (!path.isAbsolute(archive)) throw new Error("Backup destination must be absolute");
    const result = await createLocalArchive(snapshot, archive);
    await writeFile(path.join(root, "backups/status.json"), JSON.stringify({ lastBackupAt: new Date().toISOString(), lastCheckedAt: new Date().toISOString(), fingerprint, file: archive }), { mode: 0o600 });
    return result;
  } finally { await rm(snapshot, { recursive: true, force: true }); }
}
export async function restoreLocalWorkspace(root: string, resources: string, archive: string) {
  const parent = path.dirname(root);
  const staging = await mkdtemp(path.join(parent, ".local-restore-"));
  const extracted = path.join(staging, "archive"); await mkdir(extracted, { mode: 0o700 });
  const replacement = path.join(staging, "installation"); await mkdir(replacement, { mode: 0o700 });
  let database: Awaited<ReturnType<typeof startLocalDatabase>> | undefined;
  try {
    await extractLocalArchive(archive, extracted);
    const installation = z.object({ format: z.literal(1), postgresMajor: z.literal(17), installationId: z.string().uuid() }).passthrough().parse(JSON.parse(await readFile(path.join(extracted, "installation.json"), "utf8")));
    const keys = z.object({ auth: z.string().regex(/^[a-f0-9]{64}$/) }).parse(JSON.parse(await readFile(path.join(extracted, "content-keys.json"), "utf8")));
    await writeFile(path.join(replacement, "manifest.json"), JSON.stringify(installation), { mode: 0o600 });
    database = await startLocalDatabase(replacement, resources);
    const administrator = new Client({ connectionString: database.adminUrl }); await administrator.connect();
    try { await administrator.query("grant create on database postgres to zilo_app; grant create, usage on schema public to zilo_app"); } finally { await administrator.end(); }
    await execute(path.join(resources, "postgres/bin/pg_restore"), ["--exit-on-error", "--no-owner", "--no-acl", "--dbname", "postgres", path.join(extracted, "database.dump")], { env: pgEnvironment(database.appUrl), timeout: 600_000 });
    const client = new Client({ connectionString: database.appUrl }); await client.connect();
    try {
      const owner = await client.query('select count(*)::int as count from "user"');
      const workspace = await client.query('select count(*)::int as count from workspace');
      if (owner.rows[0].count !== 1 || workspace.rows[0].count !== 1) throw new Error("The backup is not a single-user local workspace");
      await client.query('delete from session; delete from verification;');
    } finally { await client.end(); }
    await inspectLocalSchema(database.appUrl, resources);
    // Validate and apply bundled migrations before this installation becomes authoritative.
    const migration = createDbClientForUrl(database.appUrl);
    await migration.client.connect();
    try { await runMigrationSets(migration.db, [{ ...CORE_MIGRATION_SET, migrationsFolder: path.join(resources, "drizzle") }]); } finally { await migration.client.end(); }
    await recordLocalSchema(replacement, resources);
    const ownership = new Client({ connectionString: database.adminUrl });
    await ownership.connect();
    try { await ownership.query("reassign owned by zilo_app to zilo_owner; revoke create on database postgres from zilo_app; revoke create on schema public from zilo_app"); } finally { await ownership.end(); }
    await grantLocalApplicationAccess(database.adminUrl);
    await database.stop(); database = undefined;
    const secretPath = path.join(replacement, "secrets/database.json");
    const fresh = JSON.parse(await readFile(secretPath, "utf8"));
    await writeFile(secretPath, JSON.stringify({ ...fresh, auth: keys.auth }), { mode: 0o600 });
    for (const folder of ["objects", "recordings", "native-recordings"]) await copyIfPresent(path.join(extracted, folder), path.join(replacement, folder));
    await copyIfPresent(path.join(extracted, "local-services.json"), path.join(replacement, "local-services.json"));
    const previous = `${root}.recovery-${Date.now()}`;
    const intent = `${root}.restore-intent.json`;
    await writeFile(intent, JSON.stringify({ previous }), { mode: 0o600, flag: "wx" });
    let moved = false;
    try { await rename(root, previous); moved = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    try { await rename(replacement, root); } catch (error) { if (moved) await rename(previous, root); throw error; }
    await rm(intent);
    return { recoveryCopy: moved ? previous : null };
  } finally { await database?.stop(); await rm(staging, { recursive: true, force: true }); }
}
export async function retainDailyBackups(root: string) {
  const directory = path.join(root, "backups");
  const files = (await readdir(directory)).filter(name => /^daily-\d{4}-\d{2}-\d{2}\.zilobackup$/.test(name)).sort().reverse();
  for (const name of files.slice(7)) await rm(path.join(directory, name));
}
