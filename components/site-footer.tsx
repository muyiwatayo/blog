"use client";

import Link from "next/link";
import { useState } from "react";
import { SocialLinks } from "@/components/social-links";

function ShareFieldnotes() {
  const [message, setMessage] = useState("");

  async function copyLink(url: string) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        return;
      } catch (error) {
        console.warn("Clipboard API failed; trying the browser copy fallback.", error);
      }
    }

    const fallback = document.createElement("textarea");
    fallback.value = url;
    fallback.setAttribute("readonly", "");
    fallback.style.position = "fixed";
    fallback.style.opacity = "0";
    document.body.append(fallback);
    fallback.select();
    const copied = document.execCommand("copy");
    fallback.remove();
    if (copied) return;

    throw new Error("Clipboard access is unavailable in this browser.");
  }

  async function share() {
    setMessage("");
    const url = new URL("/", window.location.href).toString();
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Fieldnotes",
          text: "Independent notes for a noisy world.",
          url,
        });
        setMessage("Fieldnotes shared.");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    try {
      await copyLink(url);
      setMessage("Link copied. Share Fieldnotes with a friend.");
    } catch (error) {
      console.error("Could not share or copy the Fieldnotes link.", error);
      setMessage("Sharing isn’t available here. Copy the site address from your browser.");
    }
  }

  return (
    <div className="footer-share">
      <button type="button" onClick={() => void share()}>
        Share Fieldnotes <span aria-hidden="true">↗</span>
      </button>
      <span className="footer-share-message" role="status" aria-live="polite">
        {message}
      </span>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-brand">
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
              <span>Field</span>notes<span className="wordmark-dot">.</span>
            </span>
          </Link>
          <p>Good stories make their way back to us.</p>
        </div>
        <div className="footer-navigation">
          <nav className="footer-column" aria-label="Explore Fieldnotes">
            <h2>Read</h2>
            <Link href="/#notes">Latest stories</Link>
            <Link href="/#writers">Meet the writers</Link>
            <Link href="/#about">Our little corner</Link>
          </nav>
          <nav className="footer-column" aria-label="Your Fieldnotes account">
            <h2>Make something</h2>
            <Link href="/sign-up">Start writing</Link>
            <Link href="/sign-in">Sign in</Link>
            <Link href="/messages">Your messages</Link>
          </nav>
        </div>
        <div className="footer-contact">
          <p>Pass a good story along</p>
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
        <span>Stories, letters, poems and everything in between.</span>
      </div>
    </footer>
  );
}
