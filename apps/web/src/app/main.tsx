import { prepareDesktopServerCandidate, commitDesktopServerCandidate, desktopCloudConnectUrl } from "@/platform/server/desktop-server";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { LocalSetup } from "@/features/desktop/local/local-setup";
import { configureApplicationMeetingCapture } from "./runtime/configure-meeting-capture";
import React from "react";
import { configureApplicationSessions } from "./runtime/configure-sessions";
import { configureApplicationRequests } from "./runtime/configure-requests";
import ReactDOM from "react-dom/client";
import App from "./app";
import { initializeDesktopAuthToken } from "@/features/desktop/auth/index";
import {
  applyActiveDesktopProfileWorkspace,
  initializeDesktopServer,
  listDesktopServerProfiles,
} from "@/features/desktop/server/index";
import { useAppStore } from "@/features/desktop/state/app-store";
import { useAuthFlowStore } from "@/features/auth/state/auth-flow-store";
import {
  installDesktopDiagnostics,
  markDesktopAppReady,
  markDesktopRootMounted,
  recordDesktopDiagnostic,
} from "@/features/desktop/diagnostics/index";
import { AppProviders } from "@/app/providers/app-providers";
import { initializeDesktopTranslucency } from "@/features/desktop/window/index";
import { captureProductException } from "@/shared/lib/posthog";
import "../shared/styles/global.css";
import "./styles.css";

configureApplicationSessions();
configureApplicationRequests();
configureApplicationMeetingCapture();
installDesktopDiagnostics();
const applicationRoot = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
void bootstrap();

async function bootstrap(skipChoice = false) {
  const savedProfiles = isTauri() ? await listDesktopServerProfiles().catch(() => null) : null;
  const reopeningLocal = savedProfiles?.profiles.some(profile => profile.active && profile.kind === "local");
  if (!skipChoice && !reopeningLocal && isTauri() && !window.localStorage.getItem("zilobase:mode-chosen") && await invoke<boolean>("local_runtime_enabled").catch(() => false)) {
    applicationRoot.render(<main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-xl font-semibold">Choose where to work</h1>
      <button onClick={() => { void (async () => { const candidate = await prepareDesktopServerCandidate(desktopCloudConnectUrl()); await commitDesktopServerCandidate(candidate.candidateId); window.localStorage.setItem("zilobase:mode-chosen", "1"); await bootstrap(true) })().catch(renderStartupFailure) }}>Zilobase Cloud</button>
      <button onClick={() => { window.localStorage.setItem("zilobase:mode-chosen", "1"); window.history.replaceState(null, "", "/connect"); void bootstrap(true) }}>Your server</button>
      <LocalSetup onReady={() => void bootstrap(true)} />
    </main>);
    return;
  }
  recordDesktopDiagnostic("renderer.server_initialization", {
    status: "started",
  });
  try {
    await initializeDesktopServer();
    recordDesktopDiagnostic("renderer.server_initialization", {
      status: "success",
    });
  } catch (error) {
    recordDesktopDiagnostic(
      "renderer.server_initialization",
      {
        error_type: error instanceof Error ? error.name : "unknown_error",
        status: "error",
      },
      "error",
    );
    renderStartupFailure(error);
    return;
  }

  recordDesktopDiagnostic("renderer.auth_initialization", {
    status: "started",
  });
  await initializeDesktopAuthToken();
  await initializeDesktopTranslucency().catch(() => {
    // Older desktop shells can continue at the default, fully opaque setting.
  });
  await Promise.all([
    useAppStore.persist.rehydrate(),
    useAuthFlowStore.persist.rehydrate(),
  ]);
  try {
    applyActiveDesktopProfileWorkspace(
      await listDesktopServerProfiles(),
      (workspaceId) => useAppStore.getState().setActiveWorkspaceId(workspaceId),
    );
  } catch {
    // Profiles are optional until the native list command is available.
  }
  recordDesktopDiagnostic("renderer.render_requested", { status: "started" });
  applicationRoot.render(
    <React.StrictMode>
      <DesktopStartupMarker phase="root" />
      <AppProviders>
        <DesktopStartupMarker phase="app" />
        <App />
      </AppProviders>
    </React.StrictMode>,
  );
}

function renderStartupFailure(error: unknown) {
  captureProductException(error, { error_boundary: "startup" });
  const message =
    error instanceof Error
      ? error.message
      : "The saved desktop server configuration could not be loaded.";
  applicationRoot.render(
    <main className="flex min-h-svh items-center justify-center bg-surface-canvas p-6">
      <div className="max-w-md space-y-4 rounded-lg border bg-surface-card p-6 text-content-primary">
        <h1 className="text-lg font-semibold">Zilobase could not start</h1>
        <p className="text-sm text-content-secondary">{message}</p>
        <button
          className="rounded-md bg-action-primary px-4 py-2 text-sm text-action-on-primary hover:bg-action-primary-hover"
          onClick={() => window.location.reload()}
          type="button"
        >
          Try again
        </button>
      </div>
    </main>,
  );
}

function DesktopStartupMarker({ phase }: { phase: "app" | "root" }) {
  React.useEffect(() => {
    if (phase === "root") markDesktopRootMounted();
    else markDesktopAppReady();
  }, [phase]);

  return null;
}
