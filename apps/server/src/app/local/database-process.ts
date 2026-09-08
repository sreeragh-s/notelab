import { randomBytes, randomUUID } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
const execute = promisify(execFile);

export async function startLocalDatabase(root: string, resources: string) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  await chmod(root, 0o700);
  for (const name of ["objects", "secrets", "backups", "staging"]) await mkdir(path.join(root, name), { recursive: true, mode: 0o700 });
  const manifestPath = path.join(root, "manifest.json");
  let manifest: { format: number; postgresMajor: number; installationId: string };
  try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const entries = await readdir(path.join(root, "postgres")).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    if (entries.length) throw new Error("Unrecognized local database; restore its manifest");
    manifest = { format: 1, postgresMajor: 17, installationId: randomUUID() };
    await writeFile(manifestPath, JSON.stringify(manifest), { flag: "wx", mode: 0o600 });
  }
  if (manifest.format !== 1 || manifest.postgresMajor !== 17 || !manifest.installationId) throw new Error("Unsupported local data format");
  const secretPath = path.join(root, "secrets/database.json");
  let secrets: { admin: string; app: string; auth: string };
  try { secrets = JSON.parse(await readFile(secretPath, "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const version = await readFile(path.join(root, "postgres/PG_VERSION")).catch(() => null);
    if (version) throw new Error("Local database credentials are missing");
    secrets = { admin: randomBytes(32).toString("hex"), app: randomBytes(32).toString("hex"), auth: randomBytes(32).toString("hex") };
    await writeFile(secretPath, JSON.stringify(secrets), { mode: 0o600, flag: "wx" });
  }
  if (![secrets.admin, secrets.app, secrets.auth].every(value => /^[a-f0-9]{64}$/.test(value))) throw new Error("Invalid local credentials");
  const data = path.join(root, "postgres");
  const binary = (name: string) => path.join(resources, "postgres/bin", name);
  const version = await readFile(path.join(data, "PG_VERSION"), "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (version === null) {
    const entries = await readdir(data).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    if (entries.length) throw new Error("Incomplete database initialization requires recovery");
    const passwordFile = path.join(root, "secrets/init-password");
    await writeFile(passwordFile, secrets.admin, { mode: 0o600 });
    try {
      await execute(binary("initdb"), ["-D", data, "-U", "zilo_owner", "--encoding=UTF8", "--no-locale", "--auth-local=scram-sha-256", "--auth-host=reject", `--pwfile=${passwordFile}`], { timeout: 60_000 });
    } finally { await rm(passwordFile, { force: true }); }
  } else if (version.trim() !== "17") throw new Error("Unsupported PostgreSQL major version");
  const socket = await mkdtemp("/tmp/zilo-pg-");
  await chmod(socket, 0o700);
  const child = spawn(binary("postgres"), ["-D", data, "-c", "listen_addresses=", "-c", `unix_socket_directories=${socket}`, "-c", "unix_socket_permissions=0700", "-c", "max_connections=30", "-c", "shared_buffers=32MB"], { stdio: ["ignore", "ignore", "pipe"] });
  child.stderr?.on("data", () => { /* Do not emit database values into native diagnostics. */ });
  let processError: Error | undefined;
  child.once("error", error => { processError = error; });
  const connection = (user: string, password: string) => `postgresql://${user}:${password}@localhost/postgres?host=${encodeURIComponent(socket)}`;
  const adminUrl = connection("zilo_owner", secrets.admin);
  const appUrl = connection("zilo_app", secrets.app);
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null && !processError) {
      child.kill("SIGINT");
      await Promise.race([new Promise<void>(resolve => child.once("exit", () => resolve())), new Promise<void>(resolve => setTimeout(resolve, 10_000))]);
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
    await rm(socket, { recursive: true, force: true });
  };
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (processError || child.exitCode !== null || child.signalCode !== null) throw new Error("Local database exited during startup");
      const client = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 500 });
      try { await client.connect(); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
      finally { await client.end(); }
    }
    if (!ready) throw new Error("Local database readiness timeout");
    const client = new Client({ connectionString: adminUrl });
    await client.connect();
    try {
      const role = await client.query("select 1 from pg_roles where rolname = 'zilo_app'");
      if (!role.rowCount) await client.query(`create role zilo_app login password '${secrets.app}'`);
    } finally { await client.end(); }
    return { adminUrl, appUrl, authSecret: secrets.auth, installationId: manifest.installationId, stop };
  } catch (error) { await stop(); throw error; }
}

export async function grantLocalApplicationAccess(adminUrl: string) {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query("grant usage on schema public to zilo_app; grant select, insert, update, delete on all tables in schema public to zilo_app; grant usage, select on all sequences in schema public to zilo_app; alter default privileges in schema public grant select, insert, update, delete on tables to zilo_app; alter default privileges in schema public grant usage, select on sequences to zilo_app");
  } finally { await client.end(); }
}
