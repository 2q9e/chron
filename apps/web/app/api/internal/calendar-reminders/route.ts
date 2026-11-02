import { sendCalendarReminderEmail } from "../../../../features/auth/server/email.ts";
import { CalendarRepository } from "../../../../features/calendar/server/repository.ts";
import { runCalendarReminderDeliveryWorker } from "../../../../features/calendar/server/reminder-delivery-worker.ts";
import { isAuthorizedReminderWorkerRequest } from "../../../../features/calendar/server/reminder-worker-auth.ts";

export const runtime = "nodejs";

const privateHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

export async function POST(request: Request): Promise<Response> {
  if (!isAuthorizedReminderWorkerRequest(request)) {
    return new Response(null, { status: 404, headers: privateHeaders });
  }

  try {
    const { database } = await import("../../../../features/auth/server/auth-instance.ts");
    const summary = await runCalendarReminderDeliveryWorker(
      database,
      new CalendarRepository(database),
      sendCalendarReminderEmail,
    );
    return new Response(JSON.stringify(summary), { status: 200, headers: privateHeaders });
  } catch {
    return new Response(JSON.stringify({ error: "REMINDER_WORKER_FAILED" }), {
      status: 503,
      headers: privateHeaders,
    });
  }
}
