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
        let root = data_root(&app)?;
        let _ = std::fs::remove_file(root.with_extension("deleted"));
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
            .open(root.with_extension("runtime.lock"))
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
                stop_child(&mut child);
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
                stop_child(&mut child);
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

pub(crate) fn data_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|_| "Data directory unavailable")?
        .join(if cfg!(debug_assertions) {
            "local-debug"
        } else {
            "local"
        }))
}

#[tauri::command]
pub(crate) async fn local_backup_dialog(
    app: tauri::AppHandle,
    restore: bool,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    tauri::async_runtime::spawn_blocking(move || {
        let dialog = app
            .dialog()
            .file()
            .add_filter("Zilobase workspace backup", &["zilobackup"]);
        let file = if restore {
            dialog.blocking_pick_file()
        } else {
            dialog
                .set_file_name("workspace.zilobackup")
                .blocking_save_file()
        };
        file.map(|file| {
            file.into_path()
                .map(|path| path.to_string_lossy().into_owned())
                .map_err(|_| "Choose a local file".into())
        })
        .transpose()
    })
    .await
    .map_err(|_| "File dialog unavailable")?
}

#[tauri::command]
pub(crate) fn show_local_data_folder(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let root = data_root(&app)?;
    std::fs::create_dir_all(&root).map_err(|_| "Cannot open local data folder")?;
    app.opener()
        .open_path(root.to_string_lossy(), None::<&str>)
        .map_err(|_| "Cannot open local data folder".into())
}

#[tauri::command]
pub(crate) async fn maintain_local_workspace(
    app: tauri::AppHandle,
    state: tauri::State<'_, LocalRuntimeState>,
    operation: String,
    file: Option<String>,
) -> Result<serde_json::Value, String> {
    if !enabled() || !["backup", "daily-backup", "restore"].contains(&operation.as_str()) {
        return Err("Local maintenance is unavailable".into());
    }
    let shared = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::meetings::capture::stop_for_local_maintenance(&app)?;
        let root = data_root(&app)?;
        std::fs::create_dir_all(&root).map_err(|_| "Cannot locate local installation")?;
        let retained = shared.0.lock().map_err(|_| "Runtime unavailable")?.as_ref().map(|running| running._lock.try_clone()).transpose().map_err(|_| "Cannot retain installation lock")?;
        shared.stop();
        let _lock = if let Some(lock) = retained { lock } else {
            let lock = OpenOptions::new().read(true).write(true).create(true).truncate(false).open(root.with_extension("runtime.lock")).map_err(|_| "Cannot open installation lock")?;
            lock.try_lock().map_err(|_| "Local installation is already open")?; lock
        };
        let resources = resources(&app)?;
        let _ = app.emit("local-runtime-status", serde_json::json!({"phase":"maintenance"}));
        let mut child = Command::new(resources.join("node/node")).arg(resources.join("server/desktop-maintenance.cjs")).env_clear().env("PATH", "/usr/bin:/bin").env("ZILOBASE_LOCAL_ENABLED", "1").stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().map_err(|_| "Cannot start local maintenance")?;
        let config = serde_json::json!({"ZILOBASE_LOCAL_ROOT":root,"ZILOBASE_LOCAL_RESOURCES":resources,"operation":operation,"file":file});
        let mut input = child.stdin.take().ok_or("Maintenance control unavailable")?;
        writeln!(input, "{config}").map_err(|_| "Cannot configure maintenance")?;
        let deadline = std::time::Instant::now() + Duration::from_secs(900);
        while child.try_wait().map_err(|_| "Cannot inspect maintenance")?.is_none() {
            if std::time::Instant::now() > deadline { let _ = child.kill(); let _ = child.wait(); return Err("Maintenance timed out. The existing installation has been preserved.".into()); }
            std::thread::sleep(Duration::from_millis(100));
        }
        let output = child.wait_with_output().map_err(|_| "Maintenance output unavailable")?;
        let message = String::from_utf8_lossy(&output.stdout).lines().filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok()).find(|value| value["event"] == "local.maintenance").ok_or("Maintenance failed; preserve the data folder for recovery")?;
        if let Some(error) = message["error"].as_str() { return Err(error.into()); }
        Ok(message["result"].clone())
    }).await.map_err(|_| "Maintenance worker failed")?
}

#[tauri::command]
pub(crate) fn local_backup_status(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let file = data_root(&app)?.join("backups/status.json");
    match std::fs::read(file) {
        Ok(bytes) => {
            serde_json::from_slice(&bytes).map_err(|_| "Backup status is unreadable".into())
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Ok(serde_json::json!({"lastBackupAt":null}))
        }
        Err(_) => Err("Backup status unavailable".into()),
    }
}

fn stop_child(child: &mut Child) {
    for _ in 0..150 {
        if child.try_wait().ok().flatten().is_some() {
            return;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    let _ = child.kill();
    let _ = child.wait();
}

#[tauri::command]
pub(crate) fn local_installation_status(
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let root = data_root(&app)?;
    let manifest = std::fs::read(root.join("manifest.json"))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok());
    Ok(
        serde_json::json!({"exists":root.join("postgres/PG_VERSION").is_file(), "deleted":root.with_extension("deleted").is_file(), "installationId":manifest.and_then(|value| value["installationId"].as_str().map(str::to_owned))}),
    )
}

#[tauri::command]
pub(crate) async fn delete_local_workspace(
    app: tauri::AppHandle,
    state: tauri::State<'_, LocalRuntimeState>,
    confirmation: String,
    installation_id: String,
) -> Result<(), String> {
    if !enabled() || confirmation != "DELETE LOCAL WORKSPACE" {
        return Err("Type DELETE LOCAL WORKSPACE to confirm".into());
    }
    let shared = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root = data_root(&app)?;
        validate_deletion(&root, &installation_id)?;
        crate::meetings::capture::stop_for_local_maintenance(&app)?;
        let retained = shared.0.lock().map_err(|_| "Runtime unavailable")?.as_ref().map(|running| running._lock.try_clone()).transpose().map_err(|_| "Cannot retain lock")?;
        shared.stop();
        let _lock = if let Some(lock) = retained { lock } else {
            let lock = OpenOptions::new().read(true).write(true).create(true).truncate(false).open(root.with_extension("runtime.lock")).map_err(|_| "Cannot open lock")?;
            lock.try_lock().map_err(|_| "Installation is in use")?; lock
        };
        validate_deletion(&root, &installation_id)?;
        // Never delete a directory while a database may still be using it.
        if root.join("postgres/postmaster.pid").exists() { return Err("A database process may still be running. Reopen the workspace and quit cleanly before deletion.".into()); }
        std::fs::write(root.with_extension("deleted"), b"Choose a mode before creating another workspace").map_err(|_| "Cannot record deletion")?;
        std::fs::remove_dir_all(root).map_err(|_| "Deletion was interrupted; inspect the local data folder".into())
    }).await.map_err(|_| "Deletion worker failed")?
}

fn validate_deletion(root: &std::path::Path, installation_id: &str) -> Result<(), String> {
    let canonical = root
        .canonicalize()
        .map_err(|_| "Cannot validate installation path")?;
    let expected = root
        .parent()
        .ok_or("Invalid installation path")?
        .canonicalize()
        .map_err(|_| "Cannot validate data directory")?
        .join(root.file_name().ok_or("Invalid installation name")?);
    if canonical != expected
        || std::fs::symlink_metadata(root)
            .map_err(|_| "Cannot inspect data directory")?
            .file_type()
            .is_symlink()
    {
        return Err("Refusing an unexpected installation path".into());
    }
    let manifest: serde_json::Value = serde_json::from_slice(
        &std::fs::read(root.join("manifest.json")).map_err(|_| "Installation manifest missing")?,
    )
    .map_err(|_| "Installation manifest invalid")?;
    if manifest["installationId"].as_str() != Some(installation_id) || installation_id.is_empty() {
        return Err("The selected installation has changed".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn deletion_requires_matching_identity_and_a_real_directory() {
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().join("local");
        std::fs::create_dir(&root).unwrap();
        std::fs::write(
            root.join("manifest.json"),
            br#"{"installationId":"expected"}"#,
        )
        .unwrap();
        assert!(validate_deletion(&root, "expected").is_ok());
        assert!(validate_deletion(&root, "another").is_err());
        assert!(validate_deletion(&root, "").is_err());
        #[cfg(unix)]
        {
            let alias = temporary.path().join("alias");
            std::os::unix::fs::symlink(&root, &alias).unwrap();
            assert!(validate_deletion(&alias, "expected").is_err());
        }
    }
}
