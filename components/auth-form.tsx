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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError(false);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");
    const name = String(form.get("name") || "").trim();

    try {
      const supabase = createClient();
      if (signingUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: name, full_name: name },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
          },
        });
        if (signUpError) throw signUpError;
        if (data.session) {
          router.replace("/dashboard");
          router.refresh();
          return;
        }
        setMessage("Check your email to confirm your account, then sign in.");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        router.replace("/dashboard");
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
      const { error: oauthError } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
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
        <Link className="wordmark" href="/">
          <span>Field</span>notes<span className="wordmark-dot">.</span>
        </Link>
        <section className="auth-card">
          <p className="eyebrow">{signingUp ? "Join Fieldnotes" : "Welcome back"}</p>
          <h1>
            {signingUp ? (
              <>
                Make room
                <br />
                <em>for your voice.</em>
              </>
            ) : (
              <>
                Continue
                <br />
                <em>reading.</em>
              </>
            )}
          </h1>
          <p className="auth-lede">
            {signingUp
              ? "Create your free writer account to share stories, poems, letters and birthday specials."
              : "Sign in to save notes, connect with writers and open your writer studio."}
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
            <p className={`form-message${error ? " error" : ""}`} role={error ? "alert" : "status"}>
              {message}
            </p>
            <button className="publish-button auth-submit" type="submit" disabled={busy}>
              {busy ? "Please wait…" : signingUp ? "Create account" : "Sign in"}
              {!busy ? <span aria-hidden="true">↗</span> : null}
            </button>
          </form>
          <button
            className="google-button"
            type="button"
            onClick={() => void continueWithGoogle()}
            disabled={busy}
          >
            Continue with Google
          </button>
          <p className="auth-switch">
            {signingUp ? "Already have an account?" : "Don’t have an account?"}{" "}
            <Link href={signingUp ? "/sign-in" : "/sign-up"}>
              {signingUp ? "Sign in" : "Sign up"}
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
