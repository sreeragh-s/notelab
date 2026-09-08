import type { ComponentType } from "react";
import { runtimeHasCapability, type RuntimeCapability } from "@zilobase/features/runtime";
import { isLocalDesktop } from "../server/desktop-server";

export function hasRuntimeCapability(capability: RuntimeCapability) {
  return runtimeHasCapability(isLocalDesktop() ? "local" : "remote", capability);
}
export function localSettingsAvailable(section: string) {
  return hasRuntimeCapability("integrations") || ["profile", "preferences", "workspace", "teamspaces"].includes(section);
}
export function LocalFeatureUnavailable() {
  return <p role="status" className="p-6 text-content-secondary">This feature is unavailable in On this Mac mode.</p>;
}
/** The gated component never mounts, so its queries and subscriptions never start. */
export function withRuntimeCapability<P extends object>(Component: ComponentType<P>, capability: RuntimeCapability, explain = false) {
  return function RuntimeCapabilityBoundary(props: P) {
    if (!hasRuntimeCapability(capability)) return explain ? <LocalFeatureUnavailable /> : null;
    return <Component {...props} />;
  };
}
