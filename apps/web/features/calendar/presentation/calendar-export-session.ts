export type CalendarExportAttempt = Readonly<{
  controller: AbortController;
}>;

export class CalendarExportSession {
  private active: CalendarExportAttempt | null = null;

  begin(): CalendarExportAttempt | null {
    if (this.active) return null;
    const attempt = Object.freeze({ controller: new AbortController() });
    this.active = attempt;
    return attempt;
  }

  isCurrent(attempt: CalendarExportAttempt): boolean {
    return this.active === attempt && !attempt.controller.signal.aborted;
  }

  cancel(): boolean {
    const active = this.active;
    this.active = null;
    if (!active) return false;
    active.controller.abort();
    return true;
  }

  finish(attempt: CalendarExportAttempt): boolean {
    if (!this.isCurrent(attempt)) return false;
    this.active = null;
    return true;
  }
}

export async function runCalendarExport<T>(
  session: CalendarExportSession,
  attempt: CalendarExportAttempt,
  request: (signal: AbortSignal) => Promise<T>,
  onSuccess: (result: T) => void,
  onError: (reason: unknown) => void,
  onFinish: () => void,
): Promise<void> {
  try {
    const result = await request(attempt.controller.signal);
    if (!session.isCurrent(attempt)) return;
    onSuccess(result);
  } catch (reason) {
    if (session.isCurrent(attempt)) onError(reason);
  } finally {
    if (session.finish(attempt)) onFinish();
  }
}
