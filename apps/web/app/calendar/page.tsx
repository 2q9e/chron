import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CalendarWorkspace } from "../../features/calendar/presentation/calendar-workspace";
import styles from "./calendar-route.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Calendar | Chron",
  description: "A private calendar for study time and academic planning.",
};

export default async function CalendarPage() {
  let session: Awaited<ReturnType<typeof getSession>>;

  try {
    session = await getSession();
  } catch {
    return (
      <main className={styles.statePage}>
        <section className={styles.state} aria-labelledby="calendar-unavailable">
          <a className={styles.wordmark} href="/" aria-label="Chron home">
            Chron
          </a>
          <p className={styles.eyebrow}>Calendar unavailable</p>
          <h1 id="calendar-unavailable">Chron could not verify your account.</h1>
          <p>
            The account service is currently unavailable. Your calendar data has not been
            loaded. Try again when the service is available.
          </p>
          <a className={styles.action} href="/sign-in">Go to sign in</a>
        </section>
      </main>
    );
  }

  if (!session) redirect("/sign-in");

  return <CalendarWorkspace userName={session.user.name} />;
}

async function getSession() {
  const { auth } = await import("../../features/auth/server/auth-instance");
  return auth.api.getSession({ headers: await headers() });
}
