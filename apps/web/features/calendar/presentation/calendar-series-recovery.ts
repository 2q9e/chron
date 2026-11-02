const pendingSeriesApprovalPrefix = "chron.calendar.pending-series-approval.v1.";
const validDraftId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CalendarSeriesApprovalAction = "create" | "update" | "delete";
export type PendingCalendarSeriesApproval = Readonly<{
  draftId: string;
  action: CalendarSeriesApprovalAction;
}>;
export type CalendarSeriesApprovalOutcome = "approved" | "stale" | "expired" | "deleted" | "missing";

function isApprovalAction(value: string | null): value is CalendarSeriesApprovalAction {
  return value === "create" || value === "update" || value === "delete";
}

function ownerPrefix(userId: string): string {
  return `${pendingSeriesApprovalPrefix}${encodeURIComponent(userId)}.`;
}

export function storePendingCalendarSeriesApproval(
  userId: string,
  draftId: string,
  action: CalendarSeriesApprovalAction,
): boolean {
  if (!userId || !validDraftId.test(draftId) || !isApprovalAction(action)) return false;
  try {
    localStorage.setItem(`${ownerPrefix(userId)}${draftId.toLowerCase()}`, action);
    return true;
  } catch {
    return false;
  }
}

export function pendingCalendarSeriesApprovals(userId: string): PendingCalendarSeriesApproval[] | null {
  if (!userId) return null;
  try {
    const prefix = ownerPrefix(userId);
    const approvals: PendingCalendarSeriesApproval[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const storageKey = localStorage.key(index);
      if (!storageKey?.startsWith(prefix)) continue;
      const draftId = storageKey.slice(prefix.length);
      if (!validDraftId.test(draftId)) continue;
      const action = localStorage.getItem(storageKey);
      if (!isApprovalAction(action)) return null;
      approvals.push({ draftId: draftId.toLowerCase(), action });
    }
    return approvals.sort((left, right) => left.draftId.localeCompare(right.draftId));
  } catch {
    return null;
  }
}

export function forgetPendingCalendarSeriesApproval(userId: string, draftId: string): boolean {
  if (!userId || !validDraftId.test(draftId)) return false;
  try {
    localStorage.removeItem(`${ownerPrefix(userId)}${draftId.toLowerCase()}`);
    return true;
  } catch {
    return false;
  }
}

export async function reconcileCalendarSeriesApprovalBatch(
  approvals: readonly PendingCalendarSeriesApproval[],
  reconcile: (approval: PendingCalendarSeriesApproval) => Promise<CalendarSeriesApprovalOutcome>,
): Promise<Readonly<{
  outcomes: readonly CalendarSeriesApprovalOutcome[];
  error: unknown | null;
}>> {
  const outcomes: CalendarSeriesApprovalOutcome[] = [];
  for (const approval of approvals) {
    try {
      outcomes.push(await reconcile(approval));
    } catch (error) {
      return { outcomes, error };
    }
  }
  return { outcomes, error: null };
}
