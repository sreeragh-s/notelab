import { mkdtemp, rm, symlink, readdir, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { LocalFileStorage, localObjectId } from "./filesystem-storage";
const roots: string[] = [];
async function storage(limit = 1024) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "zilo-objects-"))); roots.push(root);
  return { root, store: new LocalFileStorage(root, "a".repeat(64), () => "http://127.0.0.1:9999", limit) };
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
it("persists content and signed reads across adapter instances", async () => {
  const { root, store } = await storage();
  await store.putObject({ objectKey: "page/image", contentType: "image/png", body: new Blob(["example"]) });
  const reopened = new LocalFileStorage(root, "a".repeat(64), () => "http://127.0.0.1:8888");
  const result = await reopened.get("page/image");
  expect(await new Response(result!.body).text()).toBe("example");
  expect((await reopened.head("page/image"))?.byteSize).toBe(7);
  const url = new URL(await reopened.createReadUrl({ objectKey: "page/image", expiresInSeconds: 60 }));
  expect(reopened.verifyRead(localObjectId("page/image"), Number(url.searchParams.get("expires")), url.searchParams.get("token")!)).toBe(true);
  expect(reopened.verifyRead(localObjectId("other"), Number(url.searchParams.get("expires")), url.searchParams.get("token")!)).toBe(false);
  await reopened.delete("page/image"); expect(await reopened.get("page/image")).toBeNull();
});
it("failed and oversized uploads preserve previous content and clean temporary files", async () => {
  const { store, root } = await storage(4);
  await store.putObject({ objectKey: "file", contentType: "text/plain", body: new Blob(["good"]) });
  await expect(store.putObject({ objectKey: "file", contentType: "text/plain", body: new Blob(["too large"]) })).rejects.toThrow("limit");
  expect(await new Response((await store.get("file"))!.body).text()).toBe("good");
  expect((await readdir(root)).filter(name => name.endsWith(".tmp"))).toEqual([]);
});
it("rejects traversal, object symlinks and expired tokens", async () => {
  const { root, store } = await storage();
  expect(() => localObjectId("../secret")).toThrow();
  await symlink("/etc/hosts", path.join(root, `${localObjectId("file")}.object`));
  await expect(store.get("file")).rejects.toThrow();
  expect(store.verifyRead(localObjectId("file"), 1, "a".repeat(64))).toBe(false);
});
