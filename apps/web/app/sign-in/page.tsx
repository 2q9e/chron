import type { Metadata } from "next";
import { loadAuthEnvironment } from "../../features/auth/server/environment";
import { SignInForm } from "./sign-in-form";
import styles from "./sign-in.module.css";

export const metadata: Metadata = {
  title: "Sign in | Chron",
  description: "Sign in to your private Chron calendar.",
};

export const dynamic = "force-dynamic";

function isAuthConfigured(): boolean {
  try {
    loadAuthEnvironment();
    return true;
  } catch {
    return false;
  }
}

export default function SignInPage() {
  if (!isAuthConfigured()) {
    return (
      <main className={styles.page}>
        <section className={styles.unavailable} aria-labelledby="sign-in-title">
          <a className={styles.wordmark} href="/" aria-label="Chron home">
            Chron
          </a>
          <p className={styles.eyebrow}>Private by design</p>
          <h1 id="sign-in-title">Sign-in is not configured.</h1>
          <p className={styles.description}>
            Chron needs its PostgreSQL account store and session settings before existing
            accounts can sign in.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.intro} aria-labelledby="sign-in-title">
          <a className={styles.wordmark} href="/" aria-label="Chron home">
            Chron
          </a>
          <p className={styles.eyebrow}>A workspace for adult learners</p>
          <h1 id="sign-in-title">Make time for the work that matters.</h1>
          <p className={styles.description}>
            Sign in to your calendar, study sessions, and research workspace.
          </p>
          <p className={styles.accountNote}>Account creation is currently closed.</p>
        </section>

        <section className={styles.formPanel} aria-labelledby="form-title">
          <div className={styles.formHeading}>
            <span className={styles.formIndex}>CHRON / ACCOUNT</span>
            <h2 id="form-title">Welcome back</h2>
            <p>Use the email address linked to your Chron account.</p>
          </div>
          <SignInForm />
        </section>
      </div>
    </main>
  );
}
