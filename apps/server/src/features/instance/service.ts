export { DESKTOP_PROTOCOL_VERSION, INSTANCE_SETTINGS_ROW_ID } from "./contracts";
export type { DesktopServer, ZilobaseDiscoveryDocument, InstanceSettingsRecord } from "./contracts";
export { ensureInstanceSettings, getOrCreateInstanceSettings } from "./instance-settings";
export { getZilobaseDiscoveryDocument } from "./discovery";
export { isDesktopVersionCompatible } from "./desktop-version";
