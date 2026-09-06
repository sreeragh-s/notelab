import { installDesktopServerSwitch } from "@/features/desktop/server/desktop-server-switch"
import { configureOfflineStorageCleanup } from "@/features/offline/model/offline-store"
import { prepareMailDatabasesForDeletion } from "@/features/mail/storage/mail-database"
import { switchDesktopServerSession } from "./desktop-server-switch"

export function configureApplicationSessions() {
  installDesktopServerSwitch(switchDesktopServerSession)
  configureOfflineStorageCleanup(prepareMailDatabasesForDeletion)
}
