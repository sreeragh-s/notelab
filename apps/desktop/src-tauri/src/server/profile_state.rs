use super::contracts::{
    DesktopServer, DesktopServerConfig, DesktopServerProfile, DesktopServerWorkspaceSnapshot,
};
use super::{
    DesktopServerError, CLOUD_API_ORIGIN, CLOUD_INSTANCE_ID, CONFIG_VERSION, MAX_PROFILE_WORKSPACES,
};

pub(super) fn single_profile_config(server: &DesktopServer) -> DesktopServerConfig {
    DesktopServerConfig {
        version: CONFIG_VERSION,
        active_instance_id: server.instance_id.clone(),
        profiles: vec![DesktopServerProfile {
            kind: Default::default(),
            last_active_workspace_id: None,
            last_path: None,
            last_used_at: None,
            server: server.clone(),
            workspaces: Vec::new(),
        }],
    }
}

pub(super) fn active_server(config: &DesktopServerConfig) -> &DesktopServer {
    active_profile_index(config)
        .map(|index| &config.profiles[index].server)
        .unwrap_or(&config.profiles[0].server)
}

pub(super) fn active_profile_index(config: &DesktopServerConfig) -> Option<usize> {
    config
        .profiles
        .iter()
        .position(|profile| profile.server.instance_id == config.active_instance_id)
        .or_else(|| {
            config.profiles.iter().position(|profile| {
                profile.server.instance_id == CLOUD_INSTANCE_ID
                    && is_cloud_server(&profile.server)
                    && config.active_instance_id == CLOUD_INSTANCE_ID
            })
        })
}

pub(super) fn find_profile_index(
    config: &DesktopServerConfig,
    instance_id: &str,
    api_origin: &str,
) -> Option<usize> {
    config
        .profiles
        .iter()
        .position(|profile| {
            profile.server.instance_id == instance_id && profile.server.api_origin == api_origin
        })
        .or_else(|| {
            config.profiles.iter().position(|profile| {
                servers_refer_to_same_instance(
                    &profile.server,
                    &DesktopServer {
                        instance_id: instance_id.to_string(),
                        display_name: profile.server.display_name.clone(),
                        issuer: api_origin.to_string(),
                        web_origin: profile.server.web_origin.clone(),
                        api_origin: api_origin.to_string(),
                        protocol_version: profile.server.protocol_version,
                        server_version: profile.server.server_version.clone(),
                        minimum_desktop_version: profile.server.minimum_desktop_version.clone(),
                    },
                )
            })
        })
}

pub(super) fn upsert_and_activate(config: &mut DesktopServerConfig, server: &DesktopServer) {
    if let Some(index) = config
        .profiles
        .iter()
        .position(|profile| servers_refer_to_same_instance(&profile.server, server))
    {
        config.profiles[index].server = server.clone();
        config.active_instance_id = server.instance_id.clone();
        return;
    }

    config.profiles.push(DesktopServerProfile {
        kind: Default::default(),
        last_active_workspace_id: None,
        last_path: None,
        last_used_at: None,
        server: server.clone(),
        workspaces: Vec::new(),
    });
    config.active_instance_id = server.instance_id.clone();
}

pub(super) fn replace_active_server(config: &mut DesktopServerConfig, server: DesktopServer) {
    if let Some(index) = active_profile_index(config) {
        config.profiles[index].server = server.clone();
        config.active_instance_id = server.instance_id;
        return;
    }
    *config = single_profile_config(&server);
}

pub(super) fn sanitize_workspace_snapshots(
    workspaces: Vec<DesktopServerWorkspaceSnapshot>,
) -> Vec<DesktopServerWorkspaceSnapshot> {
    let mut seen = std::collections::HashSet::new();
    workspaces
        .into_iter()
        .filter_map(|workspace| {
            let id = workspace.id.trim();
            let name = workspace.name.trim();
            if id.is_empty()
                || name.is_empty()
                || id.len() > 128
                || name.len() > 200
                || !seen.insert(id.to_string())
            {
                return None;
            }
            Some(DesktopServerWorkspaceSnapshot {
                id: id.to_string(),
                name: name.to_string(),
            })
        })
        .take(MAX_PROFILE_WORKSPACES)
        .collect()
}

pub(super) fn sanitize_optional_text(value: Option<String>, max_len: usize) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() || trimmed.len() > max_len {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

pub(super) fn sanitize_optional_path(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        if !value.starts_with('/') || value.starts_with("//") || value.len() > 4096 {
            return None;
        }
        Some(value)
    })
}

pub(super) fn validate_profile_snapshot(
    profile: &DesktopServerProfile,
) -> Result<(), DesktopServerError> {
    if profile.workspaces.len() > MAX_PROFILE_WORKSPACES {
        return Err(DesktopServerError::configuration(
            "The saved desktop server configuration is invalid.",
        ));
    }
    for workspace in &profile.workspaces {
        if workspace.id.trim().is_empty()
            || workspace.name.trim().is_empty()
            || workspace.id.len() > 128
            || workspace.name.len() > 200
        {
            return Err(DesktopServerError::configuration(
                "The saved desktop server configuration is invalid.",
            ));
        }
    }
    Ok(())
}

pub(super) fn servers_refer_to_same_instance(
    current: &DesktopServer,
    candidate: &DesktopServer,
) -> bool {
    if current.instance_id == candidate.instance_id
        && current.issuer == candidate.issuer
        && current.api_origin == candidate.api_origin
    {
        return true;
    }

    current.instance_id == CLOUD_INSTANCE_ID
        && is_cloud_server(current)
        && candidate.api_origin == CLOUD_API_ORIGIN
        && candidate.issuer == CLOUD_API_ORIGIN
}

pub(crate) fn is_cloud_server(server: &DesktopServer) -> bool {
    server.api_origin == CLOUD_API_ORIGIN && server.issuer == CLOUD_API_ORIGIN
}
