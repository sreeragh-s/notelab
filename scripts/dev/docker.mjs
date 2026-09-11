import { runResult } from "./process.mjs";

let dockerSocketChecked = false;
let composeRunnerCache;

export function ensureDockerSocket(
  message = "Docker daemon is not running. Start it (Docker.app or `colima start`) and retry.",
) {
  if (dockerSocketChecked) return;
  const result = runResult("docker", ["info"]);
  if (result.status === 0) {
    dockerSocketChecked = true;
    return;
  }
  const detail = `${result.stderr}${result.stdout}`.toLowerCase();
  if (detail.includes("cannot connect to the docker daemon") || detail.includes("docker.sock")) {
    throw new Error(message);
  }
  dockerSocketChecked = true;
}

export function inspectCompose() {
  const pluginResult = runResult("docker", ["compose", "version"]);
  if (pluginResult.status === 0) {
    return {
      command: "docker",
      args: ["compose"],
      detail: (pluginResult.stdout || pluginResult.stderr).trim(),
    };
  }
  const binaryResult = runResult("docker-compose", ["--version"]);
  if (binaryResult.status === 0) {
    return {
      command: "docker-compose",
      args: [],
      detail: (binaryResult.stdout || binaryResult.stderr).trim(),
    };
  }
  return null;
}

export function resolveComposeRunner() {
  if (composeRunnerCache) return composeRunnerCache;
  const inspected = inspectCompose();
  if (!inspected) {
    throw new Error(
      "Docker Compose is required. Install Docker with compose support or docker-compose, then re-run the local workflow.",
    );
  }
  composeRunnerCache = { command: inspected.command, args: inspected.args };
  return composeRunnerCache;
}

export function composeCheck() {
  const inspected = inspectCompose();
  if (!inspected) {
    return {
      label: "Docker Compose",
      required: true,
      ok: false,
      detail: "not installed",
    };
  }
  return {
    label: "Docker Compose",
    required: true,
    ok: true,
    detail: inspected.detail || "installed",
  };
}

export function composeLogsHint(composeFilePath = "scripts/dev/dependencies.compose.yml") {
  const compose = resolveComposeRunner();
  return `${[compose.command, ...compose.args, "-f", composeFilePath, "logs", "-f"].join(" ")}`;
}
