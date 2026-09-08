use serde::Serialize;
use std::{
    fs::{File, OpenOptions},
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{Emitter, Manager};

#[derive(Default, Clone)]
pub(crate) struct LocalRuntimeState(
    Arc<Mutex<Option<Running>>>,
    Arc<std::sync::atomic::AtomicBool>,
);
struct Running {
    child: Child,
    _input: ChildStdin,
    _lock: File,
    ready: LocalReady,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalReady {
    pub api_origin: String,
    pub installation_id: String,
    pub session_token: String,
    pub user_id: String,
    pub workspace_id: String,
}

pub(crate) fn enabled() -> bool {
    cfg!(target_os = "macos") && std::env::var("ZILOBASE_LOCAL_ENABLED").as_deref() == Ok("1")
}
#[tauri::command]
pub(crate) fn local_runtime_enabled() -> bool {
    enabled()
}

fn resources(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let triple = if cfg!(target_arch = "aarch64") {
        "aarch64-apple-darwin"
    } else {
        "x86_64-apple-darwin"
    };
    let bundled = app
        .path()
        .resource_dir()
        .map_err(|_| "Resources unavailable")?
        .join("local-resources")
        .join(triple);
    if bundled.join("manifest.json").is_file() {
        return Ok(bundled);
    }
    #[cfg(debug_assertions)]
    {
        let development = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("local-resources")
            .join(triple);
        if development.join("manifest.json").is_file() {
            return Ok(development);
        }
    }
    Err("Bundled local runtimes are missing".into())
}

#[tauri::command]
pub(crate) async fn start_local_runtime(
    app: tauri::AppHandle,
    state: tauri::State<'_, LocalRuntimeState>,
    name: Option<String>,
    workspace_name: Option<String>,
) -> Result<LocalReady, String> {
    if !enabled() {
        return Err("Local support is not enabled in this build".into());
    }
    let shared = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = shared
            .0
            .lock()
            .map_err(|_| "Local runtime state unavailable")?;
        if let Some(running) = guard.as_mut() {
            if running
                .child
                .try_wait()
                .map_err(|_| "Cannot inspect local runtime")?
                .is_none()
            {
                return Ok(running.ready.clone());
            }
            guard.take();
        }
        let resources = resources(&app)?;
        let root = app
            .path()
            .app_data_dir()
            .map_err(|_| "Data directory unavailable")?
            .join(if cfg!(debug_assertions) {
                "local-debug"
            } else {
                "local"
            });
        std::fs::create_dir_all(&root).map_err(|_| "Cannot create local data directory")?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700))
                .map_err(|_| "Cannot protect local directory")?;
        }
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(root.join("runtime.lock"))
            .map_err(|_| "Cannot open local lock")?;
        lock.try_lock()
            .map_err(|_| "Local installation is already open")?;
        let _ = app.emit(
            "local-runtime-status",
            serde_json::json!({"phase":"starting"}),
        );
        let mut child = Command::new(resources.join("node/node"))
            .arg(resources.join("server/desktop-local.cjs"))
            .env_clear()
            .env("PATH", "/usr/bin:/bin")
            .env("ZILOBASE_LOCAL_ENABLED", "1")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| "Cannot start bundled backend")?;
        let mut input = child
            .stdin
            .take()
            .ok_or("Native control pipe unavailable")?;
        let configuration =
            serde_json::json!({"ZILOBASE_LOCAL_ROOT":root, "ZILOBASE_LOCAL_RESOURCES":resources, "name": name, "workspaceName": workspace_name});
        writeln!(input, "{configuration}").map_err(|_| "Cannot configure local backend")?;
        let stdout = child
            .stdout
            .take()
            .ok_or("Native status pipe unavailable")?;
        let (send, receive) = std::sync::mpsc::channel();
        let event_app = app.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) {
                    if value["event"] == "local.ready" {
                        let _ = send.send(value);
                    } else if value["event"] == "local.phase" {
                        let _ = event_app.emit("local-runtime-status", &value);
                    }
                }
            }
        });
        let message = match receive.recv_timeout(Duration::from_secs(120)) {
            Ok(value) => value,
            Err(_) => {
                drop(input);
                let _ = child.wait();
                return Err("Local runtime failed to become ready; data has been preserved".into());
            }
        };
        let ready = LocalReady {
            session_token: message["sessionToken"].as_str().ok_or("Invalid local session")?.into(),
            user_id: message["userId"].as_str().ok_or("Invalid local owner")?.into(),
            workspace_id: message["workspaceId"].as_str().ok_or("Invalid local workspace")?.into(),
            api_origin: message["apiOrigin"]
                .as_str()
                .ok_or("Invalid local origin")?
                .into(),
            installation_id: message["installationId"]
                .as_str()
                .ok_or("Invalid local identity")?
                .into(),
        };
        *guard = Some(Running {
            child,
            _input: input,
            _lock: lock,
            ready: ready.clone(),
        });
        let _ = app.emit("local-runtime-status", serde_json::json!({"phase":"ready"}));
        Ok(ready)
    })
    .await
    .map_err(|_| "Local startup failed".to_string())?
}

impl LocalRuntimeState {
    pub(crate) fn stop(&self) {
        if let Ok(mut guard) = self.0.lock() {
            if let Some(Running {
                mut child,
                _input,
                _lock,
                ..
            }) = guard.take()
            {
                drop(_input);
                for _ in 0..150 {
                    if child.try_wait().ok().flatten().is_some() {
                        return;
                    }
                    std::thread::sleep(Duration::from_millis(100));
                }
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

#[tauri::command]
pub(crate) fn activate_local_desktop(
    app: tauri::AppHandle,
    state: tauri::State<'_, LocalRuntimeState>,
) -> Result<crate::server::DesktopServer, String> {
    let guard = state.0.lock().map_err(|_| "Local runtime unavailable")?;
    let running = guard.as_ref().ok_or("Start the local runtime first")?;
    crate::server::activate_local_server(&app, &running.ready)
}

pub(crate) fn active_ready(app: &tauri::AppHandle) -> Option<LocalReady> {
    if !crate::server::active_profile_is_local(app) {
        return None;
    }
    app.state::<LocalRuntimeState>()
        .0
        .lock()
        .ok()?
        .as_ref()
        .map(|running| running.ready.clone())
}

pub(crate) fn update_token(app: &tauri::AppHandle, token: Option<String>) -> bool {
    if !crate::server::active_profile_is_local(app) {
        return false;
    }
    if let Ok(mut guard) = app.state::<LocalRuntimeState>().0.lock() {
        if let Some(running) = guard.as_mut() {
            running.ready.session_token = token.unwrap_or_default();
        }
    }
    true
}

pub(crate) fn quit_is_approved(app: &tauri::AppHandle) -> bool {
    app.state::<LocalRuntimeState>()
        .1
        .load(std::sync::atomic::Ordering::SeqCst)
}
#[tauri::command]
pub(crate) fn finish_local_quit(app: tauri::AppHandle) {
    app.state::<LocalRuntimeState>()
        .1
        .store(true, std::sync::atomic::Ordering::SeqCst);
    app.exit(0);
}
