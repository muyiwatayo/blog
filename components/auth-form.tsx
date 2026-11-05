"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AuthFormProps = { mode: "sign-in" | "sign-up" };

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const signingUp = mode === "sign-up";
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");

  function getReturnPath() {
    const requestedPath = new URLSearchParams(window.location.search).get("next");
    return requestedPath && requestedPath.startsWith("/") && !requestedPath.startsWith("//")
      ? requestedPath
      : "/dashboard";
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError(false);
    const form = new FormData(event.currentTarget);
    const submittedEmail = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");
    const name = String(form.get("name") || "").trim();

    try {
      const supabase = createClient();
      const returnPath = getReturnPath();
      if (signingUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: submittedEmail,
          password,
          options: {
            data: { display_name: name, full_name: name },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(returnPath)}`,
          },
        });
        if (signUpError) throw signUpError;
        if (data.session) {
          router.replace(returnPath);
          router.refresh();
          return;
        }
        setMessage(
          "Your account was created, but email confirmation is still enabled. Turn off Confirm email in Supabase to sign in without a confirmation link.",
        );
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: submittedEmail,
          password,
        });
        if (signInError) throw signInError;
        router.replace(returnPath);
        router.refresh();
      }
    } catch (submitError) {
      setError(true);
      setMessage(
        submitError instanceof Error ? submitError.message : "Your account could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function continueWithGoogle() {
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      const returnPath = getReturnPath();
      const { error: oauthError } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(returnPath)}`,
        },
      });
      if (oauthError) throw oauthError;
    } catch (oauthError) {
      setError(true);
      setMessage(
        oauthError instanceof Error
          ? oauthError.message
          : "Google sign-in could not be started.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="app-shell auth-page">
      <main className="auth-page-shell">
        <header className="auth-topbar">
          <Link className="wordmark" href="/" aria-label="Fieldnotes home">
            <svg
              className="wordmark-home-icon"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="m3.75 10.5 8.25-7 8.25 7v9.75h-6v-6h-4.5v6h-6V10.5Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
            <span className="wordmark-label">
              Fieldnotes<span className="wordmark-dot">.</span>
            </span>
          </Link>
          <Link className="auth-back-link" href="/">
            Back to reading
          </Link>
        </header>
        <div className="auth-layout">
          <aside className="auth-aside">
            <p className="auth-aside-label">A place for your writing</p>
            <h2>{signingUp ? "Start with a story." : "Your notes are waiting."}</h2>
            <p>
              {signingUp
                ? "Make an account to publish essays, poems, letters and birthday tributes."
                : "Sign in to save writing, connect with authors and continue to your writer studio."}
            </p>
            <div className="auth-aside-note">
              <span aria-hidden="true">“</span>
              <p>Good writing deserves a little room.</p>
            </div>
          </aside>
          <section className="auth-card">
            <p className="eyebrow">{signingUp ? "Create your account" : "Welcome back"}</p>
            <h1>{signingUp ? "Join Fieldnotes" : "Sign in to Fieldnotes"}</h1>
            <p className="auth-lede">
              {signingUp
                ? "Your account gives you a place to share and manage your stories."
                : "Use your email and password to open your writer studio."}
            </p>
            <form onSubmit={submit}>
              {signingUp ? (
                <label>
                  Name
                  <input
                    required
                    name="name"
                    autoComplete="name"
                    maxLength={80}
                    placeholder="Your name"
                  />
                </label>
              ) : null}
              <label>
                Email
                <input
                  required
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <label>
                Password
                <div className="password-field">
                  <input
                    required
                    minLength={8}
                    maxLength={72}
                    id="password"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete={signingUp ? "new-password" : "current-password"}
                    placeholder={signingUp ? "At least 8 characters" : "Your password"}
                  />
                  <button
                    className="password-toggle"
                    type="button"
                    onClick={() => setShowPassword((show) => !show)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </label>
              <p
                className={`form-message${error ? " error" : ""}`}
                role={error ? "alert" : "status"}
              >
                {message}
              </p>
              <button className="publish-button auth-submit" type="submit" disabled={busy}>
                {busy ? "Please wait…" : signingUp ? "Create account" : "Sign in"}
                {!busy ? <span aria-hidden="true">↗</span> : null}
              </button>
            </form>
            <div className="auth-divider"><span>or</span></div>
            <button
              className="google-button"
              type="button"
              onClick={() => void continueWithGoogle()}
              disabled={busy}
            >
              <svg className="google-mark" viewBox="0 0 48 48" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11c-.5 2.5-2 4.7-4.2 6.1v5.1h6.8c4-3.7 6-8.8 6-14.9Z"
                />
                <path
                  fill="#34A853"
                  d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.8-5.1c-1.8 1.2-4 1.9-6.7 1.9-5.2 0-9.6-3.5-11.2-8.2H5.8v5.2C9.2 39.6 16 44 24 44Z"
                />
                <path
                  fill="#FBBC05"
                  d="M12.8 27.8a12 12 0 0 1 0-7.6V15H5.8a20 20 0 0 0 0 18l7-5.2Z"
                />
                <path
                  fill="#EA4335"
                  d="M24 12c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 5.9 29.5 4 24 4 16 4 9.2 8.4 5.8 15l7 5.2C14.4 15.5 18.8 12 24 12Z"
                />
              </svg>
              Continue with Google
            </button>
            <p className="auth-switch">
              {signingUp ? "Already have an account?" : "New to Fieldnotes?"}{" "}
              <Link href={signingUp ? "/sign-in" : "/sign-up"}>
                {signingUp ? "Sign in" : "Create an account"}
              </Link>
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
