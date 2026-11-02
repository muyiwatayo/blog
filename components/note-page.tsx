"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/client";
import { demoPosts } from "@/lib/demo-posts";
import { useSavedNotes } from "@/hooks/use-saved-notes";
import type { Post } from "@/lib/types";
import { formatDate } from "@/lib/types";

export function NotePage({ id }: { id: string }) {
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { savedIds, toggleSaved: updateSaved } = useSavedNotes();

  useEffect(() => {
    let active = true;
    async function loadPost() {
      try {
        const supabase = createClient();
        const { data, error: postError } = await supabase
          .from("posts")
          .select("*")
          .eq("id", id)
          .eq("status", "published")
          .maybeSingle();
        if (postError) throw postError;
        if (!data) throw new Error("This note could not be found.");
        if (active) setPost(data as Post);
      } catch (loadError) {
        if (active) {
          const samplePost = demoPosts.find((item) => item.id === id);
          if (samplePost) {
            setPost(samplePost);
          } else {
            setError(
              loadError instanceof Error ? loadError.message : "This note could not be loaded.",
            );
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadPost();
    return () => {
      active = false;
    };
  }, [id]);

  function toggleSaved() {
    try {
      updateSaved(id);
    } catch (storageError) {
      setNotice(
        storageError instanceof Error
          ? storageError.message
          : "This browser could not save the note.",
      );
    }
  }

  const saved = savedIds.includes(id);

  async function share() {
    if (!post) return;
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: post.title,
          text: `${post.title} by ${post.author} on Fieldnotes`,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setNotice("Link copied. Share it wherever you like.");
      }
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      setNotice("The share action could not be completed. Copy the page address to share it.");
    }
  }

  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="note-page">
        {loading ? (
          <div className="content-state" role="status">
            Opening this note…
          </div>
        ) : error || !post ? (
          <div className="content-state content-error" role="alert">
            <strong>This note is unavailable.</strong>
            <span>{error || "It may have been removed."}</span>
            <Link className="text-link" href="/">
              Back to the library <span aria-hidden="true">↗</span>
            </Link>
          </div>
        ) : (
          <article className="note-article">
            <Link className="back-link" href="/">
              ← Back to the library
            </Link>
            {post.image ? (
              <Image
                className="note-cover"
                src={post.image}
                alt={`Cover for ${post.title}`}
                width={1200}
                height={600}
                unoptimized
                priority
              />
            ) : null}
            <p className="eyebrow">{post.post_type} · {post.category}</p>
            <h1>{post.title}</h1>
            <p className="note-excerpt">{post.excerpt}</p>
            <div className="note-byline">
              <span>
                By{" "}
                {post.author_id ? (
                  <Link href={`/writers/${post.author_id}`} className="author-link">
                    {post.author}
                  </Link>
                ) : (
                  post.author
                )}{" "}
                · {formatDate(post.published_at || post.created_at)} · {post.read_time} min read
              </span>
              <div>
                <button className="save-button" type="button" onClick={toggleSaved} aria-pressed={saved}>
                  {saved ? "Saved" : "Save note"}
                </button>
                <button className="save-button" type="button" onClick={() => void share()}>
                  Share <span aria-hidden="true">↗</span>
                </button>
              </div>
            </div>
            <div className="note-body">
              {post.body.split(/\r?\n\s*\r?\n/).map((paragraph, index) => (
                <p key={`${post.id}-${index}`}>{paragraph}</p>
              ))}
            </div>
            {post.author_id ? (
              <Link className="note-end-link" href={`/writers/${post.author_id}`}>
                More notes by {post.author} <span aria-hidden="true">↗</span>
              </Link>
            ) : null}
          </article>
        )}
      </main>
      <SiteFooter />
      {notice ? (
        <div className="data-notice" role="status">
          {notice}
          <button type="button" onClick={() => setNotice("")} aria-label="Dismiss message">
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
