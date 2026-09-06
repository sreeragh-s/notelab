import { isTauri } from "@tauri-apps/api/core";
import { createNativeMeetingCaptureRuntime } from "@/features/desktop/meetings";
import { BrowserMeetingCapture } from "@/features/meetings/capture";
import { createBrowserMeetingCaptureRuntime } from "@/features/meetings/capture/browser-capture-runtime";
import { installMeetingCaptureRuntime } from "@/features/meetings/capture/capture-runtime";

export function configureApplicationMeetingCapture() {
  installMeetingCaptureRuntime(
    isTauri()
      ? createNativeMeetingCaptureRuntime()
      : createBrowserMeetingCaptureRuntime(new BrowserMeetingCapture()),
  );
}
