"use client";

import Link from "next/link";
import { useState } from "react";
import { SocialLinks } from "@/components/social-links";

function ShareFieldnotes() {
  const [message, setMessage] = useState("");

  async function share() {
    const url = new URL("/", window.location.href).toString();
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Fieldnotes",
          text: "Independent notes for a noisy world.",
          url,
        });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setMessage("Link copied.");
      } else {
        setMessage("Copy the Fieldnotes address from your browser to share it.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("The link could not be copied. Share it from your browser address bar.");
    }
  }

  return (
    <div className="footer-share">
      <button type="button" onClick={() => void share()}>
        Share Fieldnotes <span aria-hidden="true">↗</span>
      </button>
      {message ? <span role="status">{message}</span> : null}
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-brand">
          <Link className="wordmark" href="/" aria-label="Fieldnotes home">
            <span>Field</span>notes<span className="wordmark-dot">.</span>
          </Link>
          <p>For the words you want to keep, and the people you want to celebrate.</p>
        </div>
        <div className="footer-navigation">
          <nav className="footer-column" aria-label="Explore Fieldnotes">
            <h2>Explore</h2>
            <Link href="/#notes">The library</Link>
            <Link href="/#writers">Writers</Link>
            <Link href="/#about">About Fieldnotes</Link>
          </nav>
          <nav className="footer-column" aria-label="Your Fieldnotes account">
            <h2>Your account</h2>
            <Link href="/sign-up">Become a writer</Link>
            <Link href="/sign-in">Sign in</Link>
            <Link href="/#newsletter">Monthly letter</Link>
          </nav>
        </div>
        <div className="footer-contact">
          <p>Stay connected</p>
          <SocialLinks />
          <ShareFieldnotes />
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} Fieldnotes</span>
        <nav className="footer-legal" aria-label="Legal">
          <Link href="/terms">Terms of service</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
        <span>Independent notes for a noisy world.</span>
      </div>
    </footer>
  );
}
