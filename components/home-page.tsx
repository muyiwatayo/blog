"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PostCard } from "@/components/post-card";
import {
  FriendRequestButton,
  type FriendRequestAction,
} from "@/components/friend-request-button";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { useSavedNotes } from "@/hooks/use-saved-notes";
import { createClient } from "@/lib/supabase/client";
import { demoPosts } from "@/lib/demo-posts";
import { getFriendshipStatus, type FriendRequest } from "@/lib/friendships";
import { POST_TYPES, type Post, type Profile, formatDate } from "@/lib/types";

type Writer = Profile & { postCount: number };

const guideAnswers: Record<string, string> = {
  "How do I publish?":
    "Create a free account, open your studio, and choose “Write a note.” Add a cover image if you have one, then publish when it feels ready.",
  "What can I share?":
    "Essays, poems, stories, novel chapters, letters, and birthday specials all have a place here.",
  "Can I add a photo?":
    "Yes. Your studio accepts JPEG, PNG, or WebP covers up to 5 MB.",
};

export function HomePage() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [writers, setWriters] = useState<Writer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All notes");
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [friendActionId, setFriendActionId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [subscribing, setSubscribing] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideAnswer, setGuideAnswer] = useState(
    "Hello. I’m the Fieldnotes guide. Ask me about publishing or finding something to read.",
  );
  const { savedIds, toggleSaved: updateSaved } = useSavedNotes();

  useEffect(() => {
    let active = true;

    async function loadContent() {
      try {
        const supabase = createClient();
        const [userResult, postsResult, profilesResult] = await Promise.all([
          supabase.auth.getSession(),
          supabase
            .from("posts")
            .select("*")
            .eq("status", "published")
            .order("published_at", { ascending: false }),
          supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(60),
        ]);
        if (userResult.error) throw userResult.error;
        if (postsResult.error) throw postsResult.error;
        if (profilesResult.error) throw profilesResult.error;
        const userId = userResult.data.session?.user.id || null;
        const requestsResult = userId
          ? await supabase
              .from("friend_requests")
              .select("id, requester_id, recipient_id, status, created_at")
              .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)
              .in("status", ["pending", "accepted"])
          : null;
        if (requestsResult?.error) throw requestsResult.error;

        const loadedPosts = (postsResult.data || []) as Post[];
        const loadedProfiles = (profilesResult.data || []) as Profile[];
        const counts = loadedPosts.reduce<Record<string, number>>((acc, post) => {
          acc[post.author_id] = (acc[post.author_id] || 0) + 1;
          return acc;
        }, {});

        if (active) {
          setPosts(loadedPosts);
          setWriters(
            loadedProfiles.map((profile) => ({
              ...profile,
              postCount: counts[profile.id] || 0,
            })),
          );
          setCurrentUserId(userId);
          setFriendRequests((requestsResult?.data || []) as FriendRequest[]);
        }
      } catch (error) {
        if (active) {
          setLoadError(
            error instanceof Error ? error.message : "The library could not be loaded.",
          );
          setPosts(demoPosts);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadContent();
    return () => {
      active = false;
    };
  }, []);

  const categories = useMemo(
    () => [...new Set(posts.map((post) => post.category).filter(Boolean))],
    [posts],
  );
  const visiblePosts = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return posts.filter((post) => {
      const matchesFilter =
        filter === "All notes" || post.category === filter || post.post_type === filter;
      const matchesSearch =
        !search ||
        `${post.title} ${post.excerpt} ${post.author} ${post.post_type}`
          .toLocaleLowerCase()
          .includes(search);
      return matchesFilter && matchesSearch;
    });
  }, [filter, posts, query]);
  const featured = posts.find((post) => post.is_featured) || posts[0];
  const libraryPosts = visiblePosts.filter((post) => post.id !== featured?.id);

  function toggleSaved(id: string) {
    try {
      updateSaved(id);
    } catch (error) {
      console.error("Could not save this note in your browser.", error);
      setNotice("This browser could not save the note. Check its storage settings.");
    }
  }

  async function subscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubscribing(true);
    setNotice("");
    try {
      const { error } = await createClient().rpc("subscribe_to_monthly_digest", {
        p_email: email.trim().toLowerCase(),
      });
      if (error) throw error;
      setSubscribed(true);
      setEmail("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Your subscription could not be saved.");
    } finally {
      setSubscribing(false);
    }
  }

  async function handleFriendAction(
    writerId: string,
    action: FriendRequestAction,
  ) {
    try {
      const supabase = createClient();
      if (!currentUserId) {
        router.push("/sign-in");
        return;
      }
      if (currentUserId === writerId) {
        return;
      }
      setFriendActionId(writerId);
      const request = friendRequests.find(
        (item) =>
          (item.requester_id === currentUserId && item.recipient_id === writerId) ||
          (item.requester_id === writerId && item.recipient_id === currentUserId),
      );

      if (action === "send") {
        const { data, error } = await supabase
          .from("friend_requests")
          .insert({
            requester_id: currentUserId,
            recipient_id: writerId,
            status: "pending",
          })
          .select("id, requester_id, recipient_id, status, created_at")
          .single();
        if (error) throw error;
        setFriendRequests((current) => [...current, data as FriendRequest]);
        setNotice("Friend request sent.");
      } else if (action === "accept" || action === "decline") {
        if (!request || request.status !== "pending" || request.recipient_id !== currentUserId) {
          throw new Error("This friend request is no longer available.");
        }
        const { error } = await supabase.rpc("respond_to_friend_request", {
          p_request_id: request.id,
          p_accept: action === "accept",
        });
        if (error) throw error;
        setFriendRequests((current) =>
          action === "accept"
            ? current.map((item) =>
                item.id === request.id ? { ...item, status: "accepted" } : item,
              )
            : current.filter((item) => item.id !== request.id),
        );
        setNotice(action === "accept" ? "Friend request accepted." : "Friend request declined.");
      } else {
        if (
          !request ||
          (action === "cancel" &&
            (request.status !== "pending" || request.requester_id !== currentUserId)) ||
          (action === "remove" && request.status !== "accepted")
        ) {
          throw new Error("This friend connection is no longer available.");
        }
        const { data, error } = await supabase
          .from("friend_requests")
          .delete()
          .eq("id", request.id)
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("This friend connection is no longer available.");
        setFriendRequests((current) => current.filter((item) => item.id !== request.id));
        setNotice(action === "cancel" ? "Friend request cancelled." : "Friend removed.");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The friend request could not be updated.");
    } finally {
      setFriendActionId(null);
    }
  }

  return (
    <div className="app-shell home-shell">
      <SiteHeader />
      <main id="top">
        <section className="hero-section">
          <div className="hero-copy">
            <p className="eyebrow">A publication made by its readers</p>
            <h1>A quiet place for words that matter.</h1>
            <p className="hero-intro">
              Read something thoughtful, meet its writer, or publish a story of
              your own. There is room here for essays, poems, letters and birthday
              tributes.
            </p>
            <div className="hero-actions">
              <a className="home-primary-link" href="#notes">
                Browse the writing
              </a>
              <Link className="home-secondary-link" href="/sign-up">
                Write a story
              </Link>
            </div>
          </div>
          <aside className="hero-note">
            <p className="eyebrow">What you will find</p>
            <p>
              Personal writing, carefully shared. Read at your own pace and save
              the pieces you want to return to.
            </p>
            <ul aria-label="Writing on Fieldnotes">
              <li>Essays and stories</li>
              <li>Poems and letters</li>
              <li>Birthday tributes</li>
            </ul>
          </aside>
        </section>

        <section className="featured-section" id="notes">
          <div className="section-heading">
            <p className="eyebrow">A note to begin with</p>
            <span>{loadError ? "Sample writing · offline preview" : "Recently published"}</span>
          </div>
          {loading ? (
            <div className="content-state" role="status">
              Gathering the latest notes…
            </div>
          ) : featured ? (
            <article className="featured-card">
              <Link
                className="featured-image"
                href={`/notes/${featured.id}`}
                aria-label={`Read ${featured.title}`}
              >
                <Image
                  fill
                  unoptimized
                  loading="eager"
                  sizes="(max-width: 700px) 100vw, 55vw"
                  src={featured.image || "/social-card.svg"}
                  alt={featured.image ? `Cover for ${featured.title}` : "Fieldnotes cover artwork"}
                />
                <span className="image-label">{featured.post_type} / Fieldnotes</span>
              </Link>
              <div className="featured-content">
                <p className="post-meta">
                  {featured.post_type} <span /> {featured.category} <span />{" "}
                  {featured.read_time} min read
                </p>
                <Link className="featured-title-link" href={`/notes/${featured.id}`}>
                  <h2>{featured.title}</h2>
                </Link>
                <p>{featured.excerpt}</p>
                <div className="post-footer">
                  <span>
                    By{" "}
                    {featured.author_id ? (
                      <Link className="author-link" href={`/writers/${featured.author_id}`}>
                        {featured.author}
                      </Link>
                    ) : (
                      featured.author
                    )}{" "}
                    · {formatDate(featured.published_at || featured.created_at)}
                  </span>
                  <button
                    className={`save-button${savedIds.includes(featured.id) ? " saved" : ""}`}
                    type="button"
                    aria-pressed={savedIds.includes(featured.id)}
                    onClick={() => toggleSaved(featured.id)}
                  >
                    {savedIds.includes(featured.id) ? "Saved" : "Save note"}
                  </button>
                </div>
              </div>
            </article>
          ) : (
            <div className="content-state">
              <strong>The first note is still waiting to be written.</strong>
              <span>
                Start a story, letter, poem or birthday special in your writer studio.
              </span>
              <Link className="text-link" href="/sign-up">
                Become a writer <span aria-hidden="true">↗</span>
              </Link>
            </div>
          )}
        </section>

        <section className="library-section">
          <div className="library-top">
            <div>
              <p className="eyebrow">From the community</p>
              <h2>Browse the latest writing</h2>
            </div>
            {loadError ? (
              <p className="connection-notice" role="status">
                Showing clearly marked sample notes because the live library could not
                be reached. Check the Supabase connection and refresh to load live
                stories.
              </p>
            ) : null}
            <label className="search-box">
              <span aria-hidden="true">⌕</span>
              <span className="sr-only">Search notes</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search notes"
                type="search"
              />
            </label>
          </div>
          <div className="category-row" aria-label="Filter the library">
            {["All notes", ...categories, ...POST_TYPES].map((item) => (
              <button
                className={`category${filter === item ? " active" : ""}`}
                key={item}
                type="button"
                aria-pressed={filter === item}
                onClick={() => setFilter(item)}
              >
                {item}
              </button>
            ))}
          </div>
          {loading ? (
            <div className="content-state" role="status">
              Loading the library…
            </div>
          ) : libraryPosts.length ? (
            <div className="post-grid">
              {libraryPosts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  saved={savedIds.includes(post.id)}
                  onSave={toggleSaved}
                />
              ))}
            </div>
          ) : (
            <p className="empty-state">
              {query || filter !== "All notes"
                ? "No notes match that search. Try another phrase or format."
                : "There are no other notes in the library yet."}
            </p>
          )}
        </section>

        <section className="about-section" id="about">
          <div className="about-mark" aria-hidden="true">
            ✳
          </div>
          <div>
            <p className="eyebrow">About Fieldnotes</p>
            <h2>A little more room to think.</h2>
          </div>
          <p>
            Fieldnotes is a community publication for personal essays, poems,
            stories and notes worth keeping. Read what others have written, or
            make a quiet space for your own words.
          </p>
        </section>

        <section className="writers-section" id="writers">
          <div className="writers-section-head">
            <div>
              <p className="eyebrow">People behind the pages</p>
              <h2>Meet the writers</h2>
            </div>
            <Link className="text-link" href="/sign-up">
              Join and start writing <span aria-hidden="true">↗</span>
            </Link>
          </div>
          {loading ? (
            <p className="writers-empty">Finding the writers…</p>
          ) : loadError ? (
            <p className="writers-empty">Writer profiles will appear when the live library is connected.</p>
          ) : writers.length ? (
            <div className="writers-grid">
              {writers.filter((writer) => writer.id !== currentUserId).map((writer) => {
                const name = writer.display_name || "Writer";
                return (
                  <article className="writer-card" key={writer.id}>
                    <div className="writer-card-top">
                      <div className="writer-avatar" aria-hidden="true">
                        {name.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="writer-card-name">{name}</h3>
                        <p className="writer-card-meta">
                          {writer.postCount} {writer.postCount === 1 ? "note" : "notes"}
                        </p>
                      </div>
                    </div>
                    <p className="writer-card-bio">
                      {writer.bio || "A Fieldnotes writer making room for good ideas."}
                    </p>
                    <div className="writer-card-footer">
                      <Link href={`/writers/${writer.id}`}>Read their notes ↗</Link>
                      <FriendRequestButton
                        status={
                          currentUserId
                            ? getFriendshipStatus(friendRequests, currentUserId, writer.id)
                            : "none"
                        }
                        signedIn={Boolean(currentUserId)}
                        busy={friendActionId === writer.id}
                        onAction={(action) => void handleFriendAction(writer.id, action)}
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="writers-empty">
              Writer profiles will appear here as people join the publication.
            </p>
          )}
        </section>

        <section className="newsletter-section" id="newsletter">
          <div>
            <p className="eyebrow">The monthly letter</p>
            <h2>A short note from Fieldnotes, once a month.</h2>
          </div>
          <form onSubmit={subscribe}>
            <label htmlFor="newsletter-email">Your email address</label>
            <div className="email-row">
              <input
                id="newsletter-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <button type="submit" disabled={subscribing || subscribed}>
                {subscribed ? "You’re on the list" : subscribing ? "Saving…" : "Subscribe"}
                {!subscribed && !subscribing ? <span aria-hidden="true">→</span> : null}
              </button>
            </div>
            <small aria-live="polite">
              {subscribed
                ? "You’re on the list. Look out for a thoughtful note."
                : "One monthly digest of new writing. Unsubscribe whenever you like."}
            </small>
          </form>
        </section>
      </main>
      <SiteFooter />
      <button
        className="chat-trigger"
        type="button"
        aria-expanded={guideOpen}
        onClick={() => setGuideOpen((open) => !open)}
      >
        <span className="status-dot" />
        Ask the guide
      </button>
      {guideOpen ? (
        <aside className="chat-panel" aria-label="Fieldnotes guide">
          <div className="chat-header">
            <span>Fieldnotes guide</span>
            <button type="button" onClick={() => setGuideOpen(false)} aria-label="Close guide">
              ×
            </button>
          </div>
          <p className="guide-answer" aria-live="polite">
            {guideAnswer}
          </p>
          <div className="suggestions">
            {Object.entries(guideAnswers).map(([question, answer]) => (
              <button key={question} type="button" onClick={() => setGuideAnswer(answer)}>
                {question}
              </button>
            ))}
          </div>
        </aside>
      ) : null}
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
