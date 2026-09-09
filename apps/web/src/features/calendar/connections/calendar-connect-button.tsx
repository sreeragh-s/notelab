import { GoogleIcon } from "@/shared/components/google-icon";
import { Button } from "@/shared/ui/button";
import type { useCalendarAccounts } from "./use-calendar-accounts";

export function CalendarConnectButton({ accounts, connect }: Pick<ReturnType<typeof useCalendarAccounts>, "accounts" | "connect">) {
  return <>
    <Button disabled={connect.isPending || !accounts.data?.providerConfigured} onClick={() => connect.mutate()}>
      <GoogleIcon />{connect.isPending ? "Opening Google…" : "Connect Google Calendar"}
    </Button>
    {!accounts.data?.providerConfigured && <p className="text-xs text-content-secondary">Google Calendar is not configured on this server.</p>}
  </>;
}
