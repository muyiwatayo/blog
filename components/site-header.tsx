"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SocialLinks } from "@/components/social-links";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function SiteHeader() {
  const [signedIn, setSignedIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installHelp, setInstallHelp] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    try {
      const supabase = createClient();
      void supabase.auth.getSession().then(({ data, error }) => {
        if (error) console.error("Could not check the current session.", error);
        setSignedIn(Boolean(data.session));
      });
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        setSignedIn(Boolean(session));
      });
      return () => subscription.unsubscribe();
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const updateInstalled = () =>
      setInstalled(
        displayMode.matches ||
          ("standalone" in navigator &&
            (navigator as Navigator & { standalone?: boolean }).standalone === true),
      );
    function rememberPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    }

    updateInstalled();
    displayMode.addEventListener("change", updateInstalled);
    window.addEventListener("appinstalled", updateInstalled);
    window.addEventListener("beforeinstallprompt", rememberPrompt);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error: unknown) => {
        console.error("Fieldnotes could not prepare offline access.", error);
      });
    }

    return () => {
      displayMode.removeEventListener("change", updateInstalled);
      window.removeEventListener("appinstalled", updateInstalled);
      window.removeEventListener("beforeinstallprompt", rememberPrompt);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
  }

  async function installApp() {
    if (!installPrompt) {
      setInstallHelp(true);
      return;
    }

    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setInstallPrompt(null);
        setInstalled(true);
        setInstallHelp(false);
      } else {
        setInstallHelp(true);
      }
    } catch (error) {
      console.error("The app install prompt could not be opened.", error);
      setInstallHelp(true);
    }
  }

  return (
    <>
      <header className="site-header">
        <Link className="wordmark" href="/" aria-label="Fieldnotes home" onClick={closeMenu}>
          <span>Field</span>notes<span className="wordmark-dot">.</span>
        </Link>
        <span className="site-header-caption">Independent notes for a noisy world</span>
        <div className="header-actions">
          <Link className="account-trigger" href={signedIn ? "/dashboard" : "/sign-in"}>
            {signedIn ? "Your studio" : "Sign in"}
          </Link>
          <button
            className={`menu-toggle${menuOpen ? " is-open" : ""}`}
            type="button"
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span />
            <span />
            <span className="menu-label">{menuOpen ? "Close" : "Menu"}</span>
          </button>
        </div>
        {menuOpen ? (
          <nav className="site-menu" id="site-menu" aria-label="Main navigation">
            <div className="site-menu-intro">
              <p className="eyebrow">Take your time</p>
              <p>Good words. Good company. Room to breathe.</p>
            </div>
            <div className="site-menu-links">
              <Link href="/#notes" onClick={closeMenu}>
                <span>Read the library</span>
                <span aria-hidden="true">↗</span>
              </Link>
              <Link href="/#writers" onClick={closeMenu}>
                <span>Meet the writers</span>
                <span aria-hidden="true">↗</span>
              </Link>
              <Link href="/#about" onClick={closeMenu}>
                <span>About Fieldnotes</span>
                <span aria-hidden="true">↗</span>
              </Link>
              <Link href="/#newsletter" onClick={closeMenu}>
                <span>The monthly letter</span>
                <span aria-hidden="true">↗</span>
              </Link>
            </div>
            <div className="site-menu-cta">
              <p>{signedIn ? "Your notebook is ready." : "Have something worth keeping?"}</p>
              <Link
                className="menu-write-link"
                href={signedIn ? "/dashboard" : "/sign-up"}
                onClick={closeMenu}
              >
                {signedIn ? "Open your studio" : "Become a writer"}{" "}
                <span aria-hidden="true">↗</span>
              </Link>
            </div>
            <section className="site-menu-tools" aria-label="Install Fieldnotes and find us online">
              <button
                className="menu-install-button"
                type="button"
                onClick={() => void installApp()}
                disabled={installed}
                aria-expanded={installHelp}
              >
                <span aria-hidden="true">{installed ? "✓" : "↓"}</span>
                {installed ? "Fieldnotes is installed" : "Install Fieldnotes"}
              </button>
              {installHelp ? (
                <p className="menu-install-help" role="status">
                  {/iphone|ipad|ipod/i.test(navigator.userAgent) ||
                  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
                    ? "In Safari, tap Share, then Add to Home Screen."
                    : "Open your browser menu and choose Install Fieldnotes or Add to home screen."}
                </p>
              ) : null}
              <SocialLinks placement="menu" />
            </section>
          </nav>
        ) : null}
      </header>
      {menuOpen ? (
        <button
          className="menu-dismiss"
          type="button"
          aria-label="Close navigation menu"
          onClick={closeMenu}
        />
      ) : null}
    </>
  );
}
