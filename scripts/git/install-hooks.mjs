#!/usr/bin/env node
import { chmod } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { run } from "../dev/process.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const hooksPath = ".githooks";

export async function installGitHooks({ cwd = repoRoot, log = console } = {}) {
  await run("git", ["config", "core.hooksPath", hooksPath], { cwd, stdio: "pipe" });
  for (const hook of ["pre-commit", "pre-push"]) {
    await chmod(path.join(cwd, hooksPath, hook), 0o755).catch(() => {});
  }
  log.info(
    `Git commit and push hooks installed (core.hooksPath=${hooksPath}). Skip with git commit/push --no-verify or ZILOBASE_SKIP_HOOKS=1.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  installGitHooks().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
