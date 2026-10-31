"use client";

import { useState, type FormEvent } from "react";
import { authClient } from "../../features/auth/client";
import styles from "./sign-in.module.css";

export function SignInForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    setIsSubmitting(true);
    setMessage("");

    try {
      const result = await authClient.signIn.email({
        email,
        password,
        callbackURL: "/calendar",
      });

      if (result.error) {
        setMessage("Sign in could not be completed. Check your details or try again shortly.");
        return;
      }

      window.location.assign("/calendar");
    } catch {
      setMessage("Sign in is temporarily unavailable. Try again shortly.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label className={styles.field} htmlFor="email">
        <span>Email address</span>
        <input
          autoComplete="username"
          autoCapitalize="none"
          id="email"
          maxLength={254}
          name="email"
          required
          type="email"
        />
      </label>

      <label className={styles.field} htmlFor="password">
        <span>Password</span>
        <input
          autoComplete="current-password"
          id="password"
          maxLength={128}
          name="password"
          required
          type="password"
        />
      </label>

      {message ? (
        <p className={styles.error} role="alert">
          {message}
        </p>
      ) : null}

      <button className={styles.submit} disabled={isSubmitting} type="submit">
        {isSubmitting ? "Signing in" : "Sign in"}
      </button>
    </form>
  );
}
