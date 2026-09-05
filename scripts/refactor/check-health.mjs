import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const [mode, ...extra] = process.argv.slice(2);
if (!["audit", "health"].includes(mode))
  throw new Error("Expected audit or health");

function run(args) {
  const result = spawnSync("npm", args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Never score a different checkout against stale coverage. Test failure also
// prevents the health gate from running; all existing coverage thresholds apply.
run(["run", "test:server"]);
const baseline = mode === "audit" ? "--health-baseline" : "--baseline";
run([
  "exec",
  "--",
  "fallow",
  mode,
  "--production",
  baseline,
  "scripts/refactor/fallow-health-baseline.json",
  "--baseline-mode",
  "identity",
  "--coverage",
  "apps/server/coverage/coverage-final.json",
  ...(mode === "audit" ? ["--no-css"] : ["--fail-on-issues"]),
  ...extra,
]);
