import { readMigrationFiles } from "drizzle-orm/migrator";
import { Client } from "pg";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export function assertLocalSchemaPrefix(applied: readonly string[], bundled: readonly string[]) {
  if (applied.length > bundled.length || applied.some((hash, index) => hash !== bundled[index])) {
    throw new Error("This workspace requires a different or newer Zilobase version. Its data has been preserved.");
  }
}
export function bundledLocalSchema(resources: string) {
  return readMigrationFiles({ migrationsFolder: path.join(resources, "drizzle") }).map(migration => migration.hash);
}
export async function inspectLocalSchema(adminUrl: string, resources: string) {
  const bundled = bundledLocalSchema(resources);
  const client = new Client({ connectionString: adminUrl }); await client.connect();
  try {
    const exists = await client.query("select to_regclass('drizzle.__zilobase_core_migrations') as journal");
    const applied: string[] = exists.rows[0].journal ? (await client.query('select hash from drizzle.__zilobase_core_migrations order by created_at, id')).rows.map(row => row.hash) : [];
    if (!exists.rows[0].journal) {
      const content = await client.query("select to_regclass('public.workspace') as workspace");
      if (content.rows[0].workspace) throw new Error("Local migration history is missing; restore a verified backup");
    }
    assertLocalSchemaPrefix(applied, bundled);
    return { initialized: applied.length > 0, pending: applied.length < bundled.length };
  } finally { await client.end(); }
}
export async function recordLocalSchema(root: string, resources: string) {
  const filename = path.join(root, "manifest.json");
  const manifest = JSON.parse(await readFile(filename, "utf8"));
  await writeFile(`${filename}.pending`, JSON.stringify({ ...manifest, schema: { format: 1, migrations: bundledLocalSchema(resources) } }), { mode: 0o600 });
  await rename(`${filename}.pending`, filename);
}
