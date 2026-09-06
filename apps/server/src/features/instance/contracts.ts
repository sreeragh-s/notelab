export const DESKTOP_PROTOCOL_VERSION = 1 as const;
export const INSTANCE_SETTINGS_ROW_ID = "primary";

export type DesktopServer = {
  instanceId: string;
  displayName: string;
  issuer: string;
  webOrigin: string;
  apiOrigin: string;
  protocolVersion: typeof DESKTOP_PROTOCOL_VERSION;
  serverVersion: string;
  minimumDesktopVersion: string;
};

export type ZilobaseDiscoveryDocument = DesktopServer & {
  capabilities?: readonly string[];
  desktopAuthorization: {
    authorizationEndpoint: string;
    tokenEndpoint: string;
  };
  edition?: string;
};

export type InstanceSettingsRecord = {
  displayName: string;
  instanceId: string;
};
