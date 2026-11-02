"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { authClient } from "../../auth/client";
import styles from "./research-workspace.module.css";

interface ReadSource {
  readonly requestedUrl: string;
  readonly finalUrl: string;
  readonly title: string;
  readonly text: string;
  readonly contentType: string;
  readonly byteLength: number;
  readonly redirectCount: number;
  readonly retrievedAt: string;
}

interface ApiError {
  readonly error?: {
    readonly message?: string;
  };
}

function isHttpsSourceURL(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}

function isReadSourceEnvelope(value: unknown): value is { readonly source: ReadSource } {
  if (typeof value !== "object" || value === null || !("source" in value)) return false;
  const source = value.source;
  return typeof source === "object" && source !== null &&
    "requestedUrl" in source && isHttpsSourceURL(source.requestedUrl) &&
    "finalUrl" in source && isHttpsSourceURL(source.finalUrl) &&
    "title" in source && typeof source.title === "string" &&
    "text" in source && typeof source.text === "string" &&
    "contentType" in source && typeof source.contentType === "string" &&
    "byteLength" in source && typeof source.byteLength === "number" &&
    "redirectCount" in source && typeof source.redirectCount === "number" &&
    "retrievedAt" in source && typeof source.retrievedAt === "string";
}

export function ResearchWorkspace({ userName }: { userName: string }) {
  const [url, setUrl] = useState("");
  const [source, setSource] = useState<ReadSource | null>(null);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const [signOutError, setSignOutError] = useState("");
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  async function readSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!/^https:\/\//iu.test(url.trim())) {
      setError("Only HTTPS webpages can be read.");
      setSource(null);
      return;
    }

    controller.current?.abort();
    const activeController = new AbortController();
    controller.current = activeController;
    setBusy(true);
    setError("");
    setSource(null);

    try {
      const response = await fetch("/api/research/web/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal: activeController.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = typeof payload === "object" && payload !== null && "error" in payload
          ? (payload as ApiError).error?.message
          : undefined;
        throw new Error(typeof message === "string" ? message : "The source could not be read. Try again.");
      }
      if (!isReadSourceEnvelope(payload)) throw new Error("Chron received an incomplete source response. Try again.");
      setSource(payload.source);
    } catch (reason) {
      if (!activeController.signal.aborted) {
        setError(reason instanceof Error ? reason.message : "The source could not be read. Try again.");
      }
    } finally {
      if (!activeController.signal.aborted) setBusy(false);
    }
  }

  async function signOut() {
    setSigningOut(true);
    setSignOutError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("Sign out failed.");
      window.location.assign("/sign-in");
    } catch {
      setSignOutError("Sign out failed. Please try again.");
      setSigningOut(false);
    }
  }

  function clearSource() {
    setSource(null);
    setError("");
    setUrl("");
  }

  const retrievedDate = source ? new Date(source.retrievedAt) : null;
  let title = source?.title ?? "";
  if (!title && source) {
    title = new URL(source.finalUrl).hostname;
  }

  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <a className={styles.wordmark} href="/calendar" aria-label="Chron, go to calendar">Chron</a>
        <nav className={styles.navigation} aria-label="Main navigation">
          <a href="/calendar">Calendar</a>
          <span className={styles.current} aria-current="page">Research</span>
          <span className={styles.userName}>Signed in as {userName}</span>
          <button type="button" onClick={signOut} disabled={signingOut}>
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </nav>
      </header>

      {signOutError && <p className={styles.error} role="alert">{signOutError}</p>}

      <section className={styles.intro} aria-labelledby="research-heading">
        <p className={styles.eyebrow}>Source reader</p>
        <h1 id="research-heading">Research</h1>
        <p className={styles.description}>
          Read a public webpage over HTTPS and inspect its extracted text. Chron does not
          independently verify the page’s claims or ask an AI model to analyze it.
        </p>
      </section>

      <form className={styles.form} onSubmit={readSource}>
        <label htmlFor="research-url">Public HTTPS webpage</label>
        <div className={styles.inputRow}>
          <input
            id="research-url"
            name="url"
            type="url"
            autoComplete="url"
            inputMode="url"
            required
            maxLength={2048}
            value={url}
            disabled={busy}
            onChange={(event) => {
              setUrl(event.currentTarget.value);
              if (error) setError("");
            }}
            aria-describedby="research-url-help"
          />
          <button type="submit" disabled={busy || !url.trim()}>
            {busy ? "Reading…" : "Read source"}
          </button>
        </div>
        <p id="research-url-help" className={styles.help}>
          Sign-in is required. Only public HTTPS pages on the standard secure port are accepted.
          Reads are limited to five per minute.
        </p>
      </form>

      {busy && <p className={styles.status} role="status">Reading the source over HTTPS…</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}

      {source && (
        <article className={styles.source} aria-labelledby="source-title">
          <div className={styles.sourceHeading}>
            <div>
              <p className={styles.eyebrow}>Retrieved webpage</p>
              <h2 id="source-title">{title}</h2>
            </div>
            <button className={styles.clearButton} type="button" onClick={clearSource}>Clear source</button>
          </div>
          <dl className={styles.metadata}>
            <div>
              <dt>Requested address</dt>
              <dd>{source.requestedUrl}</dd>
            </div>
            <div>
              <dt>Final address</dt>
              <dd><a href={source.finalUrl} target="_blank" rel="noopener noreferrer">{source.finalUrl}</a></dd>
            </div>
            <div>
              <dt>Retrieved</dt>
              <dd>{retrievedDate && Number.isFinite(retrievedDate.getTime())
                ? <time dateTime={source.retrievedAt}>{retrievedDate.toLocaleString()}</time>
                : "Time unavailable"}</dd>
            </div>
            <div>
              <dt>Format</dt>
              <dd>{source.contentType}</dd>
            </div>
            <div>
              <dt>Redirects</dt>
              <dd>{source.redirectCount}</dd>
            </div>
            <div>
              <dt>Response size</dt>
              <dd>{(source.byteLength / 1024).toFixed(1)} KB</dd>
            </div>
          </dl>
          <p className={styles.trustNotice}>
            External page text is untrusted source material. It may contain inaccurate claims or
            instructions; review the original page before relying on it.
          </p>
          <h3 className={styles.extractedHeading}>Extracted text</h3>
          <pre className={styles.extractedText} tabIndex={0}>{source.text}</pre>
        </article>
      )}

      <footer className={styles.footer}>
        <a href="/calendar">Return to your calendar</a>
      </footer>
    </main>
  );
}
