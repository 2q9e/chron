const reminderEndpoint = "https://testing.uwu.markets/api/internal/calendar-reminders";

export async function invokeReminderEndpoint(env, fetcher = globalThis.fetch) {
  const token = env.CALENDAR_REMINDER_WORKER_TOKEN;
  if (typeof token !== "string" || new TextEncoder().encode(token).length < 32) {
    throw new Error("Reminder scheduler credentials are not configured.");
  }

  const endpoint = new URL(reminderEndpoint);
  if (endpoint.protocol !== "https:" || endpoint.hostname !== "testing.uwu.markets"
    || endpoint.pathname !== "/api/internal/calendar-reminders"
    || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error("Reminder scheduler endpoint is invalid.");
  }

  const response = await fetcher(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("Chron reminder scheduler request failed.");
  }
  await response.body?.cancel();
}

export default {
  async scheduled(_controller, env) {
    await invokeReminderEndpoint(env);
  },
};
