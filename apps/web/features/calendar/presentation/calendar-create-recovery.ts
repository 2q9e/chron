const pendingCreatePrefix = "chron.calendar.pending-create.v1.";
const validOperationKey = /^[A-Za-z0-9._~-]{1,128}$/;

export type CalendarCreateRecoveryCounts = Readonly<{
  saved: number;
  missing: number;
  deleted: number;
}>;

export type CalendarCreateRecoveryOutcome = "saved" | "missing" | "deleted";

export async function reconcileCalendarCreateBatch(
  operationKeys: readonly string[],
  reconcile: (operationKey: string) => Promise<CalendarCreateRecoveryOutcome>,
): Promise<Readonly<{ outcomes: readonly CalendarCreateRecoveryOutcome[]; error: unknown | null }>> {
  const outcomes: CalendarCreateRecoveryOutcome[] = [];
  for (const operationKey of operationKeys) {
    try {
      outcomes.push(await reconcile(operationKey));
    } catch (error) {
      return { outcomes, error };
    }
  }
  return { outcomes, error: null };
}

export function countCalendarCreateRecoveryOutcomes(
  outcomes: readonly CalendarCreateRecoveryOutcome[],
): CalendarCreateRecoveryCounts {
  return outcomes.reduce<CalendarCreateRecoveryCounts>(
    (counts, outcome) => ({ ...counts, [outcome]: counts[outcome] + 1 }),
    { saved: 0, missing: 0, deleted: 0 },
  );
}

export function summarizeCalendarCreateRecovery(counts: CalendarCreateRecoveryCounts): Readonly<{
  message: string;
  reloadCalendar: boolean;
}> {
  const messages: string[] = [];
  if (counts.saved > 0) {
    messages.push(`${counts.saved} previously approved event${counts.saved === 1 ? " was" : "s were"} saved.`);
  }
  if (counts.missing > 0) {
    messages.push(`No event was saved for ${counts.missing} approved request${counts.missing === 1 ? "" : "s"}. Create it again from the calendar.`);
  }
  if (counts.deleted > 0) {
    messages.push(`${counts.deleted} previously approved event${counts.deleted === 1 ? " was" : "s were"} deleted before confirmation.`);
  }
  return {
    message: messages.join(" "),
    reloadCalendar: counts.saved > 0 || counts.deleted > 0,
  };
}

function ownerPrefix(userId: string): string {
  return `${pendingCreatePrefix}${encodeURIComponent(userId)}.`;
}

export function storePendingCalendarCreate(userId: string, operationKey: string): boolean {
  if (!validOperationKey.test(operationKey)) return false;
  try {
    localStorage.setItem(`${ownerPrefix(userId)}${operationKey}`, "pending");
    return true;
  } catch {
    return false;
  }
}

export function pendingCalendarCreates(userId: string): string[] | null {
  try {
    const prefix = ownerPrefix(userId);
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const storageKey = localStorage.key(index);
      if (!storageKey?.startsWith(prefix)) continue;
      const operationKey = storageKey.slice(prefix.length);
      if (validOperationKey.test(operationKey)) keys.push(operationKey);
    }
    return keys.sort();
  } catch {
    return null;
  }
}

export function forgetPendingCalendarCreate(userId: string, operationKey: string): boolean {
  if (!validOperationKey.test(operationKey)) return false;
  try {
    localStorage.removeItem(`${ownerPrefix(userId)}${operationKey}`);
    return true;
  } catch {
    return false;
  }
}
