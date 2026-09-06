import { Button } from "@/shared/ui/button";
import type { useSettingsDraft } from "../use-settings-draft";
import { toast } from "sonner";
export function SettingsDraftActions({
  draft,
  card = false,
}: {
  draft: ReturnType<typeof useSettingsDraft>;
  card?: boolean;
}) {
  if (
    !draft.state?.canEdit ||
    (card && !draft.dirty && !draft.error && !draft.state.pendingRun)
  )
    return null;
  const busy = draft.publish.isPending || draft.discard.isPending || draft.createInstruction.isPending;
  return (
    <div
      className={
        card
          ? "mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-control-border bg-surface-secondary p-3"
          : "flex items-center gap-2"
      }
    >
      {card && (
        <div className="min-w-0 flex-1 text-sm">
          <button type="button" className="block w-full text-left" onClick={draft.reviewChanges}>
            <span className="block font-medium text-action-link hover:underline">
              {draft.state.review?.fields.length ? "Review AI changes" : "Review agent changes"}
            </span>
            <span className="block text-xs text-content-secondary">
              Review your changes, then Save to apply them.
            </span>
          </button>
          {draft.error && (
            <p role="alert" className="text-feedback-danger-text">
              {draft.error}
            </p>
          )}
        </div>
      )}
      <Button
        size="sm"
        variant="ghost"
        disabled={busy || (!draft.dirty && !draft.error)}
        onClick={() => draft.discard.mutate()}
      >
        Discard
      </Button>
      <Button
        size="sm"
        disabled={busy || (!draft.dirty && !draft.state?.pendingRun)}
        onClick={() =>
          draft.publish.mutate(undefined, {
            onSuccess: (result) => {
              if (result.runError) toast.error(result.runError);
            },
          })
        }
      >
        {draft.publish.isPending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
