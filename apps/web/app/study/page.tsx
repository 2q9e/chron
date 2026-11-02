import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { StudyWorkspace } from "../../features/study/presentation/study-workspace.tsx";
import styles from "../../features/study/presentation/study.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Study | Chron",
  description: "Write private flashcards and review each one on its saved schedule.",
};

export default async function StudyPage() {
  let session: Awaited<ReturnType<typeof getSession>>;
  try {
    session = await getSession();
  } catch {
    return (
      <main className={`${styles.study} ${styles.statePage}`}>
        <section className={styles.state} aria-labelledby="study-unavailable">
          <a className={styles.wordmark} href="/calendar" aria-label="Chron calendar">Chron</a>
          <p className={styles.eyebrow}>Study unavailable</p>
          <h1 id="study-unavailable">Chron could not verify your account.</h1>
          <p>The account service is currently unavailable. Try again when it is available.</p>
          <a className={styles.primaryButton} href="/sign-in">Go to sign in</a>
        </section>
      </main>
    );
  }

  if (!session) redirect("/sign-in");
  return <StudyWorkspace key={session.user.id} />;
}

async function getSession() {
  const { auth } = await import("../../features/auth/server/auth-instance.ts");
  return auth.api.getSession({ headers: await headers() });
}
