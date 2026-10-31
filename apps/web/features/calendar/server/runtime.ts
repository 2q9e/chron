import "server-only";
import { CalendarRouteError } from "./errors.ts";
import { CalendarRepository } from "./repository.ts";

type CalendarServices = Readonly<{
  auth: typeof import("../../auth/server/auth-instance.ts").auth;
  repository: CalendarRepository;
}>;

let calendarServices: Promise<CalendarServices> | undefined;

async function getCalendarServices(): Promise<CalendarServices> {
  calendarServices ??= import("../../auth/server/auth-instance.ts")
    .then(({ auth, database }) => ({
      auth,
      repository: new CalendarRepository(database),
    }))
    .catch(() => {
      calendarServices = undefined;
      throw new CalendarRouteError(
        503,
        "CALENDAR_CONFIGURATION_UNAVAILABLE",
        "Calendar account storage is not available right now.",
      );
    });
  return calendarServices;
}

export async function getCalendarRepository(): Promise<CalendarRepository> {
  return (await getCalendarServices()).repository;
}

export async function requireCalendarUser(request: Request): Promise<string> {
  const { auth } = await getCalendarServices();
  let session: Awaited<ReturnType<typeof auth.api.getSession>>;
  try {
    session = await auth.api.getSession({ headers: request.headers });
  } catch {
    throw new CalendarRouteError(
      503,
      "AUTHENTICATION_UNAVAILABLE",
      "Sign-in could not be verified right now.",
    );
  }

  const userId = session?.user?.id;
  if (
    typeof userId !== "string" ||
    userId.length < 1 ||
    userId.length > 255 ||
    userId.includes("\u0000")
  ) {
    throw new CalendarRouteError(401, "AUTHENTICATION_REQUIRED", "Sign in to use your calendar.");
  }
  return userId;
}
