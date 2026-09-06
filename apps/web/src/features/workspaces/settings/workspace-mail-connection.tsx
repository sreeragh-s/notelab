import { useWorkspaceMailConnection } from "./workspace-mail-connection-state";

import { Button } from "@/shared/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";

import { Spinner } from "@/shared/ui/spinner";

import { getApiErrorMessage } from "@/platform/network/api";

import { GoogleIcon } from "@/shared/components/google-icon";

export function WorkspaceMailConnectionSection({
  workspaceId,
}: {
  workspaceId: string | null | undefined;
}) {
  const {
    connectionQuery,
    connection,
    connected,
    connecting,
    disconnectOpen,
    setDisconnectOpen,
    disconnecting,
    connect,
    disconnect,
  } = useWorkspaceMailConnection({ workspaceId });

  return (
    <section className="grid gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h3 className="font-heading text-base leading-snug font-medium">
            Your mail connection
          </h3>
          <p className="text-sm text-content-secondary">
            {connected
              ? `${connection?.email ?? "Gmail"} is private to you in this workspace.`
              : "Connect a private Gmail mailbox for this workspace."}
          </p>
          {connectionQuery.error ? (
            <p className="text-xs text-feedback-danger-text">
              {getApiErrorMessage(connectionQuery.error)}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {connected ? (
            <Button
              disabled={disconnecting}
              onClick={() => setDisconnectOpen(true)}
              type="button"
              variant="outline"
            >
              Disconnect
            </Button>
          ) : null}
          <Button
            disabled={
              !workspaceId ||
              connecting ||
              connectionQuery.isLoading ||
              connection?.providerConfigured === false
            }
            onClick={() => void connect()}
            type="button"
          >
            <GoogleIcon />
            {connecting
              ? "Opening Google…"
              : connection?.status === "reconnect_required"
                ? "Reconnect"
                : connected
                  ? "Change account"
                  : "Connect"}
          </Button>
        </div>
      </div>

      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Gmail?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the mailbox and its downloaded cache from this
              workspace. The same Gmail account stays connected in any other
              workspaces where you use it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnecting}>
              Cancel
            </AlertDialogCancel>
            <Button
              disabled={disconnecting}
              onClick={() => void disconnect()}
              type="button"
              variant="destructive"
            >
              {disconnecting ? <Spinner /> : null}
              {disconnecting ? "Disconnecting…" : "Disconnect Gmail"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
