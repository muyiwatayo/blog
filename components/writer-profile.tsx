"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PostCard } from "@/components/post-card";
import {
  FriendRequestButton,
  type FriendRequestAction,
} from "@/components/friend-request-button";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { useSavedNotes } from "@/hooks/use-saved-notes";
import { createClient } from "@/lib/supabase/client";
import { getFriendshipStatus, type FriendRequest } from "@/lib/friendships";
import type { Post, Profile } from "@/lib/types";
import { getInitials } from "@/lib/types";

type WriterProfileData = {
  profile: Profile;
  posts: Post[];
  friendRequests: FriendRequest[];
  currentUserId: string | null;
};

function safeWebsite(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

export function WriterProfile({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<WriterProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [friendActionBusy, setFriendActionBusy] = useState(false);
  const { savedIds, toggleSaved: updateSaved } = useSavedNotes();

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        const supabase = createClient();
        const {
          data: { session },
          error: userError,
        } = await supabase.auth.getSession();
        if (userError) throw userError;
        const user = session?.user ?? null;
        const [profileResult, postsResult, requestsResult] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
          supabase
            .from("posts")
            .select("*")
            .eq("author_id", id)
            .eq("status", "published")
            .order("published_at", { ascending: false }),
          user
            ? supabase
                .from("friend_requests")
                .select("id, requester_id, recipient_id, status, created_at")
                .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
                .in("status", ["pending", "accepted"])
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (profileResult.error) throw profileResult.error;
        if (postsResult.error) throw postsResult.error;
        if (requestsResult.error) throw requestsResult.error;
        if (!profileResult.data) throw new Error("This writer profile could not be found.");

        if (active) {
          setData({
            profile: profileResult.data as Profile,
            posts: (postsResult.data || []) as Post[],
            friendRequests: (requestsResult.data || []) as FriendRequest[],
            currentUserId: user?.id || null,
          });
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "The writer profile could not be loaded.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadProfile();
    return () => {
      active = false;
    };
  }, [id]);

  async function handleFriendAction(action: FriendRequestAction) {
    if (!data) return;
    if (!data.currentUserId) {
      router.push("/sign-in");
      return;
    }
    if (data.currentUserId === id) return;
    setFriendActionBusy(true);
    try {
      const supabase = createClient();
      const request = data.friendRequests.find(
        (item) =>
          (item.requester_id === data.currentUserId && item.recipient_id === id) ||
          (item.requester_id === id && item.recipient_id === data.currentUserId),
      );

      if (action === "send") {
        const { data: createdRequest, error: createError } = await supabase
          .from("friend_requests")
          .insert({
            requester_id: data.currentUserId,
            recipient_id: id,
            status: "pending",
          })
          .select("id, requester_id, recipient_id, status, created_at")
          .single();
        if (createError) throw createError;
        setData((current) =>
          current
            ? {
                ...current,
                friendRequests: [
                  ...current.friendRequests,
                  createdRequest as FriendRequest,
                ],
              }
            : current,
        );
        setNotice("Friend request sent.");
      } else if (action === "accept" || action === "decline") {
        if (!request || request.status !== "pending" || request.recipient_id !== data.currentUserId) {
          throw new Error("This friend request is no longer available.");
        }
        const { error: responseError } = await supabase.rpc("respond_to_friend_request", {
          p_request_id: request.id,
          p_accept: action === "accept",
        });
        if (responseError) throw responseError;
        setData((current) =>
          current
            ? {
                ...current,
                friendRequests:
                  action === "accept"
                    ? current.friendRequests.map((item) =>
                        item.id === request.id ? { ...item, status: "accepted" } : item,
                      )
                    : current.friendRequests.filter((item) => item.id !== request.id),
              }
            : current,
        );
        setNotice(action === "accept" ? "Friend request accepted." : "Friend request declined.");
      } else {
        if (
          !request ||
          (action === "cancel" &&
            (request.status !== "pending" || request.requester_id !== data.currentUserId)) ||
          (action === "remove" && request.status !== "accepted")
        ) {
          throw new Error("This friend connection is no longer available.");
        }
        const { data: deletedRequest, error: deleteError } = await supabase
          .from("friend_requests")
          .delete()
          .eq("id", request.id)
          .select("id")
          .maybeSingle();
        if (deleteError) throw deleteError;
        if (!deletedRequest) throw new Error("This friend connection is no longer available.");
        setData((current) =>
          current
            ? {
                ...current,
                friendRequests: current.friendRequests.filter((item) => item.id !== request.id),
              }
            : current,
        );
        setNotice(action === "cancel" ? "Friend request cancelled." : "Friend removed.");
      }
    } catch (friendError) {
      setNotice(
        friendError instanceof Error
          ? friendError.message
          : "The friend request could not be updated.",
      );
    } finally {
      setFriendActionBusy(false);
    }
  }

  function toggleSaved(postId: string) {
    try {
      updateSaved(postId);
    } catch (storageError) {
      setNotice(
        storageError instanceof Error
          ? storageError.message
          : "This browser could not save the note.",
      );
    }
  }

  const name = data?.profile.display_name || "Writer";
  const website = safeWebsite(data?.profile.website || null);

  return (
    <div className="app-shell">
      <SiteHeader />
      <main>
        {loading ? (
          <div className="content-state" role="status">
            Opening writer profile…
          </div>
        ) : error || !data ? (
          <div className="content-state content-error" role="alert">
            <strong>This writer profile is unavailable.</strong>
            <span>{error || "It may have been removed."}</span>
            <Link className="text-link" href="/">
              Back to the library <span aria-hidden="true">↗</span>
            </Link>
          </div>
        ) : (
          <>
            <section className="profile-hero">
              <div className="profile-hero-inner">
                <div className="profile-avatar-xl">
                  {data.profile.avatar_url ? (
                    <Image
                      src={data.profile.avatar_url}
                      alt={`${name}'s profile`}
                      width={112}
                      height={112}
                      unoptimized
                    />
                  ) : (
                    getInitials(name)
                  )}
                </div>
                <div className="profile-hero-copy">
                  <p className="eyebrow">Writer on Fieldnotes</p>
                  <h1 className="profile-name">{name}</h1>
                  {data.profile.bio ? <p className="profile-bio">{data.profile.bio}</p> : null}
                  {website ? (
                    <a
                      className="profile-website"
                      href={website.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {website.host} ↗
                    </a>
                  ) : null}
                  <div className="profile-stats-row">
                    <div className="profile-stat-pill">
                      <strong>{data.posts.length}</strong>
                      <span>Notes</span>
                    </div>
                    {data.currentUserId && data.currentUserId !== id ? (
                      <div className="profile-stat-pill">
                        <strong>
                          {getFriendshipStatus(data.friendRequests, data.currentUserId, id) === "friends"
                            ? "Connected"
                            : "Open"}
                        </strong>
                        <span>Friendship</span>
                      </div>
                    ) : null}
                  </div>
                  {data.currentUserId === id ? (
                    <Link className="follow-btn follow-btn-edit" href="/dashboard">
                      Edit profile
                    </Link>
                  ) : (
                    <div className="profile-contact-actions">
                      <FriendRequestButton
                        status={
                          data.currentUserId
                            ? getFriendshipStatus(data.friendRequests, data.currentUserId, id)
                            : "none"
                        }
                        signedIn={Boolean(data.currentUserId)}
                        busy={friendActionBusy}
                        onAction={(action) => void handleFriendAction(action)}
                      />
                      {data.currentUserId ? (
                        <Link className="profile-message-link" href={`/messages?to=${id}`}>
                          Send a message
                        </Link>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </section>
            <section className="profile-posts-section">
              <div className="profile-posts-heading">
                <p className="eyebrow">From the notebook</p>
                <h2>Notes by {name}.</h2>
              </div>
              {data.posts.length ? (
                <div className="profile-posts-grid">
                  {data.posts.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      saved={savedIds.includes(post.id)}
                      onSave={toggleSaved}
                    />
                  ))}
                </div>
              ) : (
                <p className="empty-state">This writer has not published a note yet.</p>
              )}
            </section>
          </>
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
