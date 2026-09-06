mod renderer_event;
use renderer_event::format_renderer_diagnostic;

use serde::Serialize;
use serde_json::Value;
use std::{
    collections::BTreeMap,
    env,
    fs::{self, File},
    io::{self, Read, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

const APP_IDENTIFIER: &str = "com.zilobase";
const MAX_ARCHIVED_LOGS: usize = 4;
const MAX_ARCHIVED_LOG_BYTES: u64 = 6 * 1024 * 1024;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsInfo {
    log_directory: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticsManifest {
    schema_version: u8,
    generated_at_unix_seconds: u64,
    app_version: &'static str,
    build_commit: &'static str,
    operating_system: &'static str,
    architecture: &'static str,
    package_kind: &'static str,
    linux_distribution: Option<String>,
    display_server: &'static str,
    archived_log_files: Vec<String>,
}

pub fn diagnostics_requested() -> bool {
    has_diagnostics_arg(env::args_os())
}

pub fn export_from_command_line() -> Result<PathBuf, String> {
    let log_dir = default_log_dir().ok_or("Could not determine the Zilobase log directory")?;
    let output_dir = env::current_dir().unwrap_or_else(|_| env::temp_dir());
    export_archive(&log_dir, &output_dir)
}

pub fn log_runtime_environment() {
    log::info!(
        target: "zilobase::diagnostics",
        "[diagnostics] event=native.environment app_version={} build_commit={} os={} arch={} package={} display_server={} linux_distribution={}",
        env!("CARGO_PKG_VERSION"),
        build_commit(),
        env::consts::OS,
        env::consts::ARCH,
        package_kind(),
        display_server(),
        linux_distribution().as_deref().unwrap_or("unknown"),
    );
}

#[tauri::command]
pub fn record_renderer_diagnostic(
    event: String,
    fields: BTreeMap<String, Value>,
    level: String,
) -> Result<(), String> {
    let message = format_renderer_diagnostic(&event, &fields)
        .ok_or("The diagnostic event contains unsupported fields")?;

    match level.as_str() {
        "error" => log::error!(target: "zilobase::renderer", "{message}"),
        "info" => log::info!(target: "zilobase::renderer", "{message}"),
        "warn" => log::warn!(target: "zilobase::renderer", "{message}"),
        _ => return Err("Unsupported diagnostic level".to_string()),
    }
    Ok(())
}

#[tauri::command]
pub fn get_diagnostics_info(app: AppHandle) -> Result<DiagnosticsInfo, String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|_| "Log directory is unavailable")?;
    fs::create_dir_all(&log_dir).map_err(|_| "Could not create the log directory")?;
    Ok(DiagnosticsInfo {
        log_directory: log_dir.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub fn open_diagnostics_folder(app: AppHandle) -> Result<(), String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|_| "Log directory is unavailable")?;
    fs::create_dir_all(&log_dir).map_err(|_| "Could not create the log directory")?;
    app.opener()
        .open_path(log_dir.to_string_lossy().into_owned(), None::<String>)
        .map_err(|_| "Could not open the log directory")?;
    log::info!(
        target: "zilobase::diagnostics",
        "[diagnostics] event=diagnostics.log_folder_opened status=success"
    );
    Ok(())
}

#[tauri::command]
pub fn export_diagnostics(app: AppHandle) -> Result<String, String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|_| "Log directory is unavailable")?;
    let output_dir = app
        .path()
        .download_dir()
        .unwrap_or_else(|_| env::temp_dir());

    log::info!(
        target: "zilobase::diagnostics",
        "[diagnostics] event=diagnostics.export status=started"
    );
    log::logger().flush();

    match export_archive(&log_dir, &output_dir) {
        Ok(path) => {
            log::info!(
                target: "zilobase::diagnostics",
                "[diagnostics] event=diagnostics.export status=success"
            );
            Ok(path.to_string_lossy().into_owned())
        }
        Err(error) => {
            log::error!(
                target: "zilobase::diagnostics",
                "[diagnostics] event=diagnostics.export status=error error_type=archive_error"
            );
            Err(error)
        }
    }
}

fn export_archive(log_dir: &Path, output_dir: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(output_dir).map_err(|_| "Could not create the diagnostics destination")?;

    let log_files = recent_log_files(log_dir);
    let archived_log_files = log_files
        .iter()
        .filter_map(|path| path.file_name()?.to_str().map(str::to_owned))
        .collect::<Vec<_>>();
    let manifest = DiagnosticsManifest {
        schema_version: 1,
        generated_at_unix_seconds: unix_seconds(),
        app_version: env!("CARGO_PKG_VERSION"),
        build_commit: build_commit(),
        operating_system: env::consts::OS,
        architecture: env::consts::ARCH,
        package_kind: package_kind(),
        linux_distribution: linux_distribution(),
        display_server: display_server(),
        archived_log_files,
    };

    let archive_path = output_dir.join(format!(
        "zilobase-diagnostics-{}-{}.zip",
        unix_seconds(),
        std::process::id()
    ));
    let archive =
        File::create(&archive_path).map_err(|_| "Could not create the diagnostics archive")?;
    let mut writer = ZipWriter::new(archive);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    let manifest_json = serde_json::to_vec_pretty(&manifest)
        .map_err(|_| "Could not serialize diagnostics metadata")?;

    writer
        .start_file("diagnostics.json", options)
        .map_err(|_| "Could not write diagnostics metadata")?;
    writer
        .write_all(&manifest_json)
        .map_err(|_| "Could not write diagnostics metadata")?;

    for path in log_files {
        let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        let source = match File::open(&path) {
            Ok(source) => source,
            Err(_) => continue,
        };
        writer
            .start_file(format!("logs/{file_name}"), options)
            .map_err(|_| "Could not add a log file to the diagnostics archive")?;
        io::copy(&mut source.take(MAX_ARCHIVED_LOG_BYTES), &mut writer)
            .map_err(|_| "Could not copy a log file into the diagnostics archive")?;
    }

    writer
        .finish()
        .map_err(|_| "Could not finish the diagnostics archive")?;
    Ok(archive_path)
}

fn recent_log_files(log_dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(log_dir) else {
        return Vec::new();
    };
    let mut files = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file()
                && path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with("zilobase") && name.ends_with(".log"))
        })
        .collect::<Vec<_>>();
    files.sort_by_key(|path| {
        fs::metadata(path)
            .and_then(|metadata| metadata.modified())
            .unwrap_or(UNIX_EPOCH)
    });
    files.into_iter().rev().take(MAX_ARCHIVED_LOGS).collect()
}

fn default_log_dir() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        dirs::home_dir().map(|path| path.join("Library/Logs").join(APP_IDENTIFIER))
    }

    #[cfg(not(target_os = "macos"))]
    {
        dirs::data_local_dir().map(|path| path.join(APP_IDENTIFIER).join("logs"))
    }
}

fn package_kind() -> &'static str {
    if env::var_os("APPIMAGE").is_some() || env::var_os("APPDIR").is_some() {
        "appimage"
    } else if env::var_os("FLATPAK_ID").is_some() {
        "flatpak"
    } else if env::var_os("SNAP").is_some() {
        "snap"
    } else {
        "installed_or_unknown"
    }
}

fn display_server() -> &'static str {
    match env::var("XDG_SESSION_TYPE")
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "wayland" => "wayland",
        "x11" => "x11",
        _ if env::var_os("WAYLAND_DISPLAY").is_some() => "wayland",
        _ if env::var_os("DISPLAY").is_some() => "x11",
        _ => "unknown",
    }
}

fn linux_distribution() -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        let release = fs::read_to_string("/etc/os-release").ok()?;
        let id = os_release_value(&release, "ID")?;
        let version = os_release_value(&release, "VERSION_ID");
        Some(match version {
            Some(version) => format!("{id}-{version}"),
            None => id,
        })
    }

    #[cfg(not(target_os = "linux"))]
    {
        None
    }
}

#[cfg(any(target_os = "linux", test))]
fn os_release_value(contents: &str, key: &str) -> Option<String> {
    let raw = contents
        .lines()
        .find_map(|line| line.strip_prefix(&format!("{key}=")))?;
    let value = raw.trim_matches('"');
    (!value.is_empty()
        && value.len() <= 40
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
        }))
    .then(|| value.to_string())
}

fn build_commit() -> &'static str {
    option_env!("GITHUB_SHA").unwrap_or("unknown")
}

fn unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn has_diagnostics_arg<I, S>(args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<std::ffi::OsStr>,
{
    args.into_iter()
        .any(|argument| argument.as_ref() == "--diagnostics")
}

#[cfg(test)]
mod tests {
    use super::{has_diagnostics_arg, os_release_value};

    #[test]
    fn recognizes_only_the_explicit_diagnostics_flag() {
        assert!(has_diagnostics_arg(["zilobase-client", "--diagnostics"]));
        assert!(!has_diagnostics_arg([
            "zilobase-client",
            "--diagnostics-path"
        ]));
    }

    #[test]
    fn os_release_metadata_is_bounded_and_sanitized() {
        let contents = "ID=ubuntu\nVERSION_ID=\"24.04;token=secret\"\n";
        assert_eq!(os_release_value(contents, "ID").as_deref(), Some("ubuntu"));
        assert_eq!(os_release_value(contents, "VERSION_ID"), None);
    }
}
