import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const localServicesSchema = z.object({
  version: z.literal(1).default(1),
  ollamaPort: z.number().int().min(1).max(65535).default(11434),
  whisperPort: z.number().int().min(1).max(65535).default(8080),
  model: z.string().trim().min(1).max(200).optional(),
}).strict();
export type LocalServices = z.infer<typeof localServicesSchema>;
function configPath() {
  const root = process.env.ZILOBASE_LOCAL_ROOT;
  if (!root || !path.isAbsolute(root)) throw new Error("Local installation is unavailable");
  return path.join(root, "local-services.json");
}
export async function readLocalServices(): Promise<LocalServices> {
  try { return localServicesSchema.parse(JSON.parse(await readFile(configPath(), "utf8"))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return localServicesSchema.parse({}); throw error; }
}
export async function writeLocalServices(value: unknown) {
  const config = localServicesSchema.parse(value);
  const file = configPath();
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(config), { mode: 0o600, flag: "wx" });
  await rename(temporary, file);
  return config;
}
export function localServiceOrigin(port: number) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid local service port");
  return `http://127.0.0.1:${port}`;
}
/** No DNS, credentials, arbitrary paths, or redirects to another origin. */
export function localServiceFetch(origin: string): typeof fetch {
  const allowed = new URL(origin);
  if (allowed.origin !== origin || allowed.hostname !== "127.0.0.1" || allowed.protocol !== "http:") throw new Error("Invalid local service origin");
  return (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== origin || url.username || url.password) throw new Error("Local service network boundary rejected the request");
    return fetch(input, { ...init, redirect: "error" });
  };
}
