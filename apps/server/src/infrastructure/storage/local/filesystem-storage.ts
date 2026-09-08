import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { ImageStorage, PutObjectOptions } from "../image-storage";

const MAX_HEADER = 4096;
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;
export function localObjectId(key: string) {
  if (!key || key.length > 4096 || key.includes("\\") || key.split("/").some(part => !part || part === "." || part === "..")) throw new Error("Invalid object key");
  return createHash("sha256").update(key).digest("hex");
}

/** One atomic file contains a bounded metadata header and the streamed body. */
export class LocalFileStorage implements ImageStorage {
  readonly mode = "binding" as const;
  constructor(private readonly root: string, private readonly secret: string, private readonly origin: () => string, private readonly maxBytes = DEFAULT_MAX_BYTES) {
    if (!path.isAbsolute(root) || secret.length < 32) throw new Error("Local object storage configuration is invalid");
  }
  async checkReady() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    if (await realpath(this.root) !== path.resolve(this.root)) throw new Error("Object storage must not contain symlinks");
  }
  private async filename(id: string) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid object identifier");
    await this.checkReady();
    return path.join(this.root, `${id}.object`);
  }
  async putObject(options: PutObjectOptions) {
    const target = await this.filename(localObjectId(options.objectKey));
    const temporary = `${target}.${randomUUID()}.tmp`;
    const contentType = options.contentType;
    if (!contentType || contentType.length > 256 || /[\r\n]/.test(contentType)) throw new Error("Invalid content type");
    const uploadedAt = new Date();
    const header = Buffer.from(JSON.stringify({ contentType, uploadedAt: uploadedAt.toISOString() }));
    const size = Buffer.alloc(4); size.writeUInt32BE(header.length);
    const file = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    let byteSize = 0;
    const body = options.body instanceof ReadableStream ? options.body : new Blob([options.body]).stream();
    const reader = body.getReader();
    try {
      await file.writeFile(Buffer.concat([size, header]));
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        byteSize += chunk.value.byteLength;
        if (byteSize > this.maxBytes) throw new Error("Stored file exceeds the local upload limit");
        await file.writeFile(chunk.value);
      }
      await file.sync();
      await file.close();
      await rename(temporary, target);
      const directory = await open(this.root, constants.O_RDONLY);
      try { await directory.sync(); } finally { await directory.close(); }
      return { contentType, byteSize, uploadedAt };
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      await file.close().catch(() => undefined);
      await rm(temporary, { force: true });
      throw error;
    } finally { reader.releaseLock(); }
  }
  private async inspect(id: string) {
    const filename = await this.filename(id);
    const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!file) return null;
    try {
      const prefix = Buffer.alloc(4);
      if ((await file.read(prefix, 0, 4, 0)).bytesRead !== 4) throw new Error("Corrupt object header");
      const length = prefix.readUInt32BE();
      if (length < 2 || length > MAX_HEADER) throw new Error("Corrupt object header");
      const header = Buffer.alloc(length);
      if ((await file.read(header, 0, length, 4)).bytesRead !== length) throw new Error("Truncated object header");
      const metadata = JSON.parse(header.toString()) as { contentType: string; uploadedAt: string };
      const stat = await file.stat();
      if (!stat.isFile() || stat.size < length + 4 || typeof metadata.contentType !== "string") throw new Error("Corrupt object");
      return { file, offset: length + 4, metadata: { contentType: metadata.contentType, uploadedAt: new Date(metadata.uploadedAt), byteSize: stat.size - length - 4 } };
    } catch (error) { await file.close(); throw error; }
  }
  async getById(id: string) {
    const object = await this.inspect(id);
    if (!object) return null;
    return { ...object.metadata, body: Readable.toWeb(object.file.createReadStream({ start: object.offset, autoClose: true })) as ReadableStream };
  }
  get(key: string) { return this.getById(localObjectId(key)); }
  async head(key: string) {
    const object = await this.inspect(localObjectId(key));
    if (!object) return null;
    await object.file.close();
    return object.metadata;
  }
  async delete(key: string) { await rm(await this.filename(localObjectId(key)), { force: true }); }
  private signature(id: string, expires: number) { return createHmac("sha256", this.secret).update(`${id}:${expires}`).digest("hex"); }
  async createReadUrl(options: { objectKey: string; expiresInSeconds: number }) {
    const id = localObjectId(options.objectKey);
    const expires = Math.floor(Date.now() / 1000) + Math.min(600, Math.max(1, options.expiresInSeconds));
    return `${this.origin()}/api/local/objects/${id}?expires=${expires}&token=${this.signature(id, expires)}`;
  }
  verifyRead(id: string, expires: number, token: string) {
    const now = Math.floor(Date.now() / 1000);
    return /^[a-f0-9]{64}$/.test(id) && Number.isSafeInteger(expires) && expires > now && expires <= now + 600 && /^[a-f0-9]{64}$/.test(token) && timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(this.signature(id, expires), "hex"));
  }
  async createUploadUrl(): Promise<never> { throw new Error("Use the authenticated binding upload route"); }
}
