import { ActionForm } from "@/components/app/action-form";
import { HouseholdField } from "@/components/app/hidden";
import type { ActionState } from "@/lib/action-state";

/** One-click action on a recommendation (status change or move). */
export function RecAction({ action, householdId, recId, label, status, move, variant = "outline" }: { action: (p: ActionState, f: FormData) => Promise<ActionState>; householdId?: string; recId: string; label: string; status?: string; move?: "up" | "down"; variant?: "default" | "outline" | "ghost" }) {
  return (
    <ActionForm action={action} submitLabel={label} variant={variant} className="inline">
      {householdId && <HouseholdField id={householdId} />}
      <input type="hidden" name="recId" value={recId} />
      {status && <input type="hidden" name="status" value={status} />}
      {move && <input type="hidden" name="move" value={move} />}
    </ActionForm>
  );
}
