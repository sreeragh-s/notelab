import { isDesktopApp } from "@/platform/environment";
export async function requestCalendarNotificationPermission() {
  if (isDesktopApp()) return (await import("@tauri-apps/plugin-notification")).requestPermission();
  return typeof Notification === "undefined" ? "denied" : Notification.requestPermission();
}
export async function deliverCalendarSystemNotification(title: string, body: string, tag: string) {
  if (isDesktopApp()) {
    const native = await import("@tauri-apps/plugin-notification");
    if (await native.isPermissionGranted()) native.sendNotification({ title, body });
  } else if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification(title, { body, tag });
  }
}
