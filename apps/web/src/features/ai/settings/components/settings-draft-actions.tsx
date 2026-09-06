import { settingsActionAvailability, settingsActionsVisible } from "../model/draft-actions";
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
  if (!settingsActionsVisible(draft, card)) return null;
  const { discardDisabled, saveDisabled } = settingsActionAvailability(draft);
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
              {draft.state?.review?.fields.length ? "Review AI changes" : "Review agent changes"}
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
        disabled={discardDisabled}
        onClick={() => draft.discard.mutate()}
      >
        Discard
      </Button>
      <Button
        size="sm"
        disabled={saveDisabled}
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
