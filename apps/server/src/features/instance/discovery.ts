import { getCanonicalApiOrigin, getCanonicalWebOrigin, getStringEnv, type RuntimeEnv } from "../../shared/config/config";
import { SERVER_VERSION } from "../../shared/version";
import type { EditionExtensionOptions } from "../../shared/types";
import { DESKTOP_PROTOCOL_VERSION, type InstanceSettingsRecord, type ZilobaseDiscoveryDocument } from "./contracts";
import { ensureInstanceSettings } from "./instance-settings";
import { assertSemanticVersion } from "./desktop-version";
type DiscoveryDependencies = {
  getInstanceSettings(env: RuntimeEnv): Promise<InstanceSettingsRecord>;
};

const defaultDiscoveryDependencies: DiscoveryDependencies = {
  getInstanceSettings(env) {
    return ensureInstanceSettings(env);
  },
};

export async function getZilobaseDiscoveryDocument(
  env: RuntimeEnv,
  dependencies: DiscoveryDependencies = defaultDiscoveryDependencies,
  options: EditionExtensionOptions = {},
): Promise<ZilobaseDiscoveryDocument> {
  const apiOrigin = getCanonicalApiOrigin(env);
  const webOrigin = getCanonicalWebOrigin(env);
  const minimumDesktopVersion =
    getStringEnv(env, "ZILOBASE_MINIMUM_DESKTOP_VERSION") ?? SERVER_VERSION;

  assertSemanticVersion(SERVER_VERSION, "server version");
  assertSemanticVersion(minimumDesktopVersion, "minimum desktop version");

  const settings = await dependencies.getInstanceSettings(env);

  return {
    instanceId: settings.instanceId,
    displayName: settings.displayName,
    issuer: apiOrigin,
    webOrigin,
    apiOrigin,
    protocolVersion: DESKTOP_PROTOCOL_VERSION,
    serverVersion: SERVER_VERSION,
    minimumDesktopVersion,
    desktopAuthorization: {
      authorizationEndpoint: new URL("/desktop/authorize", apiOrigin).toString(),
      tokenEndpoint: new URL("/api/auth/desktop/token", apiOrigin).toString(),
    },
    ...(options.editionExtension
      ? {
          capabilities: [...options.editionExtension.capabilities],
          edition: options.editionExtension.id,
        }
      : {}),
  };
}
