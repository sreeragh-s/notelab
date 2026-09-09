import { prepareCalendarDatabasesForDeletion } from "@/features/calendar/storage/calendar-database";
import { installDesktopServerSwitch } from "@/features/desktop/server/desktop-server-switch"
import { configureOfflineStorageCleanup } from "@/features/offline/model/offline-store"
import { prepareMailDatabasesForDeletion } from "@/features/mail/storage/mail-database"
import { switchDesktopServerSession } from "./desktop-server-switch"

export function configureApplicationSessions() {
  installDesktopServerSwitch(switchDesktopServerSession)
  configureOfflineStorageCleanup(async prefix => { await Promise.all([prepareMailDatabasesForDeletion(prefix), prepareCalendarDatabasesForDeletion(prefix)]) })
}
