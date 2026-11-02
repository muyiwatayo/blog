"use client";

import Link from "next/link";
import Image from "next/image";
import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  FriendRequestButton,
  type FriendRequestAction,
} from "@/components/friend-request-button";
import { useSavedNotes } from "@/hooks/use-saved-notes";
import { getFriendshipStatus, type FriendRequest } from "@/lib/friendships";
import { createClient } from "@/lib/supabase/client";
import {
  IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  POST_CATEGORIES,
  POST_TYPES,
  type Post,
  type Profile,
  formatDate,
  getDisplayName,
  getInitials,
} from "@/lib/types";

type DashboardData = {
  user: User;
  profile: Profile;
  posts: Post[];
  friendRequests: FriendRequest[];
  requestProfiles: Profile[];
};

const initialForm = {
  title: "",
  author: "",
  type: "Story",
  category: "Community",
  body: "",
  status: "published" as Post["status"],
  is_featured: false,
};

export function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState(initialForm);
  const [cover, setCover] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const { savedCount } = useSavedNotes();

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      try {
        const supabase = createClient();
        const { data: userResult, error: userError } = await supabase.auth.getSession();
        if (userError) throw userError;
        if (!userResult.session?.user) {
          router.replace("/sign-in");
          return;
        }

        const user = userResult.session.user;
        const displayName = getDisplayName(user.user_metadata, user.email);
        const [profileResult, postsResult, friendRequestsResult] =
          await Promise.all([
            supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
            supabase
              .from("posts")
              .select("*")
              .eq("author_id", user.id)
              .order("created_at", { ascending: false }),
            supabase
              .from("friend_requests")
              .select("id, requester_id, recipient_id, status, created_at")
              .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
              .in("status", ["pending", "accepted"]),
          ]);
        if (profileResult.error) throw profileResult.error;
        if (postsResult.error) throw postsResult.error;
        if (friendRequestsResult.error) throw friendRequestsResult.error;

        const friendRequests = (friendRequestsResult.data || []) as FriendRequest[];
        const incomingIds = friendRequests
          .filter(
            (request) =>
              request.status === "pending" && request.recipient_id === user.id,
          )
          .map((request) => request.requester_id);
        const incomingProfilesResult = incomingIds.length
          ? await supabase
              .from("profiles")
              .select("*")
              .in("id", incomingIds)
          : { data: [], error: null };
        if (incomingProfilesResult.error) throw incomingProfilesResult.error;

        const posts = await Promise.all(
          ((postsResult.data || []) as Post[]).map(async (post) => {
            if (!post.private_image_path) return post;
            const { data: signedImage, error: imageError } = await supabase.storage
              .from("draft-covers")
              .createSignedUrl(post.private_image_path, 3600);
            if (imageError) throw imageError;
            return { ...post, image: signedImage.signedUrl };
          }),
        );

        let profile = profileResult.data as Profile | null;
        if (!profile) {
          const { data: createdProfile, error: createError } = await supabase
            .from("profiles")
            .insert({
              id: user.id,
              display_name: displayName,
              bio: "",
              website: "",
            })
            .select("*")
            .single();
          if (createError) throw createError;
          profile = createdProfile as Profile;
        }

        if (active) {
          setData({
            user,
            profile,
            posts,
            friendRequests,
            requestProfiles: (incomingProfilesResult.data || []) as Profile[],
          });
        }
      } catch (error) {
        if (active) {
          setLoadError(
            error instanceof Error ? error.message : "Your writer studio could not be loaded.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadDashboard();
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function updateForm(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = event.currentTarget;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function selectCover(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.currentTarget.files?.[0] || null;
    setNotice("");
    if (!selected) {
      setCover(null);
      setPreviewUrl("");
      return;
    }
    if (!IMAGE_MIME_TYPES.includes(selected.type as (typeof IMAGE_MIME_TYPES)[number])) {
      setCover(null);
      setPreviewUrl("");
      event.currentTarget.value = "";
      setNotice("Choose a JPEG, PNG or WebP image.");
      return;
    }
    if (selected.size > MAX_IMAGE_BYTES) {
      setCover(null);
      setPreviewUrl("");
      event.currentTarget.value = "";
      setNotice("Cover images must be 5 MB or smaller.");
      return;
    }
    setCover(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    const formElement = event.currentTarget;
    setPublishing(true);
    setNotice("");
    const supabase = createClient();
    let uploadedPath: string | null = null;
    let uploadedBucket = "covers";

    try {
      let image: string | null = null;
      let privateImagePath: string | null = null;
      if (cover) {
        const extension = cover.type === "image/jpeg" ? "jpg" : cover.type.split("/")[1];
        uploadedPath = `${data.user.id}/${crypto.randomUUID()}.${extension}`;
        uploadedBucket = form.status === "draft" ? "draft-covers" : "covers";
        const { error: uploadError } = await supabase.storage
          .from(uploadedBucket)
          .upload(uploadedPath, cover, {
            contentType: cover.type,
            cacheControl: "3600",
            upsert: false,
          });
        if (uploadError) throw uploadError;
        if (form.status === "draft") {
          privateImagePath = uploadedPath;
        } else {
          image = supabase.storage.from("covers").getPublicUrl(uploadedPath).data.publicUrl;
        }
      }

      const excerpt = form.body.trim().replace(/\s+/g, " ").slice(0, 180);
      const isPublished = form.status === "published";
      const { data: publishedPost, error: insertError } = await supabase
        .from("posts")
        .insert({
          title: form.title.trim(),
          excerpt,
          body: form.body.trim(),
          post_type: form.type,
          category: form.type === "Birthday special" ? "Celebrations" : form.category,
          author: form.author.trim(),
          author_id: data.user.id,
          read_time: Math.max(1, Math.ceil(form.body.trim().split(/\s+/).length / 180)),
          image,
          private_image_path: privateImagePath,
          status: form.status,
          is_featured: isPublished && form.is_featured,
          published_at: isPublished ? new Date().toISOString() : null,
        })
        .select("*")
        .single();
      if (insertError) throw insertError;
      let note = publishedPost as Post;
      if (note.private_image_path) {
        const { data: signedImage, error: imageError } = await supabase.storage
          .from("draft-covers")
          .createSignedUrl(note.private_image_path, 3600);
        if (imageError) {
          console.error("The draft cover could not be previewed.", imageError);
        } else {
          note = { ...note, image: signedImage.signedUrl };
        }
      }

      setData((current) =>
        current
          ? { ...current, posts: [note, ...current.posts] }
          : current,
      );
      setForm(initialForm);
      setCover(null);
      setPreviewUrl("");
      formElement.reset();
      setNotice(
        isPublished
          ? form.is_featured
            ? "Your note is published and featured on the homepage."
            : "Your note is published."
          : "Your draft is saved. Only you can see it.",
      );
    } catch (error) {
      if (uploadedPath) {
        const { error: removeError } = await supabase.storage
          .from(uploadedBucket)
          .remove([uploadedPath]);
        if (removeError) {
          console.error("Could not remove the unused cover image.", removeError);
        }
      }
      setNotice(error instanceof Error ? error.message : "Your note could not be saved.");
    } finally {
      setPublishing(false);
    }
  }

  async function publishDraft(post: Post) {
    if (!data) return;
    setPublishing(true);
    setNotice("");
    const supabase = createClient();
    let publicImagePath: string | null = null;

    try {
      let image = post.image && !post.private_image_path ? post.image : null;
      if (post.private_image_path) {
        const { data: coverFile, error: downloadError } = await supabase.storage
          .from("draft-covers")
          .download(post.private_image_path);
        if (downloadError) throw downloadError;
        publicImagePath = post.private_image_path;
        const { error: uploadError } = await supabase.storage
          .from("covers")
          .upload(publicImagePath, coverFile, {
            contentType: coverFile.type || "application/octet-stream",
            cacheControl: "3600",
            upsert: true,
          });
        if (uploadError) throw uploadError;
        image = supabase.storage.from("covers").getPublicUrl(publicImagePath).data.publicUrl;
      }

      const { data: updatedPost, error: updateError } = await supabase
        .from("posts")
        .update({
          status: "published",
          is_featured: false,
          image,
          private_image_path: null,
          published_at: new Date().toISOString(),
        })
        .eq("id", post.id)
        .eq("author_id", data.user.id)
        .eq("status", "draft")
        .select("*")
        .single();
      if (updateError) throw updateError;

      if (post.private_image_path) {
        const { error: removeError } = await supabase.storage
          .from("draft-covers")
          .remove([post.private_image_path]);
        if (removeError) console.error("Could not remove the private draft cover.", removeError);
      }
      setData((current) =>
        current
          ? {
              ...current,
              posts: current.posts.map((item) =>
                item.id === post.id ? (updatedPost as Post) : item,
              ),
            }
          : current,
      );
      setNotice("Your draft is published.");
    } catch (error) {
      if (publicImagePath) {
        const { error: cleanupError } = await supabase.storage
          .from("covers")
          .remove([publicImagePath]);
        if (cleanupError) {
          console.error("Could not remove the unpublished cover image.", cleanupError);
        }
      }
      setNotice(error instanceof Error ? error.message : "The draft could not be published.");
    } finally {
      setPublishing(false);
    }
  }

  async function handleFriendAction(
    otherUserId: string,
    action: FriendRequestAction,
  ) {
    if (!data || (action !== "accept" && action !== "decline")) return;
    const request = data.friendRequests.find(
      (item) =>
        item.status === "pending" &&
        item.requester_id === otherUserId &&
        item.recipient_id === data.user.id,
    );
    if (!request) {
      setNotice("This friend request is no longer available.");
      return;
    }

    setNotice("");
    try {
      const { error } = await createClient().rpc("respond_to_friend_request", {
        p_request_id: request.id,
        p_accept: action === "accept",
      });
      if (error) throw error;
      setData((current) =>
        current
          ? {
              ...current,
              friendRequests:
                action === "accept"
                  ? current.friendRequests.map((item) =>
                      item.id === request.id
                        ? { ...item, status: "accepted" }
                        : item,
                    )
                  : current.friendRequests.filter((item) => item.id !== request.id),
              requestProfiles:
                action === "decline"
                  ? current.requestProfiles.filter((profile) => profile.id !== otherUserId)
                  : current.requestProfiles,
            }
          : current,
      );
      setNotice(action === "accept" ? "Friend request accepted." : "Friend request declined.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "The friend request could not be updated.",
      );
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    setSavingProfile(true);
    setNotice("");
    const values = new FormData(event.currentTarget);
    const displayName = String(values.get("display_name") || "").trim();
    const bio = String(values.get("bio") || "").trim();
    const websiteInput = String(values.get("website") || "").trim();

    try {
      let website = "";
      if (websiteInput) {
        const parsedWebsite = new URL(websiteInput);
        if (parsedWebsite.protocol !== "https:" && parsedWebsite.protocol !== "http:") {
          throw new Error("Enter a website address that begins with http:// or https://.");
        }
        website = parsedWebsite.toString();
      }

      const supabase = createClient();
      const { error: profileError } = await supabase.from("profiles").upsert(
        {
          id: data.user.id,
          display_name: displayName,
          bio,
          website,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
      if (profileError) throw profileError;

      const { error: authError } = await supabase.auth.updateUser({
        data: { display_name: displayName, full_name: displayName, bio, website },
      });
      if (authError) throw authError;

      const { data: refreshedUser, error: refreshError } = await supabase.auth.getUser();
      if (refreshError) throw refreshError;
      setData((current) =>
        current && refreshedUser.user
          ? {
              ...current,
              user: refreshedUser.user,
              profile: { ...current.profile, display_name: displayName, bio, website },
            }
          : current,
      );
      setNotice("Your profile is saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Your profile could not be saved.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function signOut() {
    const { error } = await createClient().auth.signOut();
    if (error) {
      setNotice(error.message);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="app-shell">
        <SiteHeader />
        <main className="dashboard-page-shell">
          <div className="content-state" role="status">
            Opening your writer studio…
          </div>
        </main>
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="app-shell">
        <SiteHeader />
        <main className="dashboard-page-shell">
          <div className="content-state content-error" role="alert">
            <strong>Your writer studio could not be opened.</strong>
            <span>{loadError || "Sign in again to continue."}</span>
            <Link className="text-link" href="/sign-in">
              Return to sign in <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const displayName = data.profile.display_name || getDisplayName(data.user.user_metadata, data.user.email);

  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="dashboard-page-shell">
        <div className="dashboard-shell">
          <section className="dashboard-top">
            <div className="dashboard-identity">
              <div className="initials-badge">{getInitials(displayName)}</div>
              <div>
                <p className="eyebrow">Your writer studio</p>
                <h1>Good to see you, {displayName}.</h1>
                <p>Build your library one thoughtful piece at a time.</p>
              </div>
            </div>
            <div className="dashboard-actions">
              <Link className="dashboard-home" href="/">
                Read the library
              </Link>
              <Link className="dashboard-home" href="/#writers">
                Meet writers
              </Link>
              <button className="dashboard-home" type="button" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          </section>

          <section className="dashboard-stats dashboard-stats-6" aria-label="Your account activity">
            <div>
              <strong>{data.posts.filter((post) => post.status === "published").length}</strong>
              <span>Published notes</span>
            </div>
            <div>
              <strong>{data.posts.filter((post) => post.status === "draft").length}</strong>
              <span>Drafts</span>
            </div>
            <div>
              <strong>
                {data.friendRequests.filter((request) => request.status === "accepted").length}
              </strong>
              <span>Friends</span>
            </div>
            <div>
              <strong>
                {
                  data.friendRequests.filter(
                    (request) =>
                      request.status === "pending" &&
                      request.recipient_id === data.user.id,
                  ).length
                }
              </strong>
              <span>Requests received</span>
            </div>
            <div>
              <strong>{savedCount}</strong>
              <span>Saved notes</span>
            </div>
            <div>
              <strong className="dashboard-account">{data.user.email}</strong>
              <span>Account</span>
            </div>
          </section>

          {data.requestProfiles.length ? (
            <section className="dashboard-friend-requests" aria-labelledby="friend-requests-title">
              <div>
                <p className="eyebrow">Your community</p>
                <h2 id="friend-requests-title">Friend requests</h2>
              </div>
              <div className="dashboard-friend-list">
                {data.requestProfiles.map((requestProfile) => {
                  const name = requestProfile.display_name || "Fieldnotes writer";
                  return (
                    <article className="dashboard-friend-row" key={requestProfile.id}>
                      <Link
                        className="dashboard-friend-person"
                        href={`/writers/${requestProfile.id}`}
                      >
                        <span className="dashboard-friend-avatar" aria-hidden="true">
                          {getInitials(name)}
                        </span>
                        <span>
                          <strong>{name}</strong>
                          <small>Would like to connect</small>
                        </span>
                      </Link>
                      <FriendRequestButton
                        status={getFriendshipStatus(
                          data.friendRequests,
                          data.user.id,
                          requestProfile.id,
                        )}
                        signedIn
                        onAction={(action) =>
                          void handleFriendAction(requestProfile.id, action)
                        }
                      />
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          <div className="dashboard-content-grid">
            <section className="dashboard-composer" id="write">
              <div className="dashboard-heading">
                <p className="eyebrow">A new contribution</p>
                <h2>Put something into the world.</h2>
                <p className="dashboard-muted">
                  Stories, poems, letters and birthday tributes all belong here.
                </p>
              </div>
              <form className="studio-form" onSubmit={publish}>
                <label>
                  Title
                  <input
                    name="title"
                    value={form.title}
                    onChange={updateForm}
                    maxLength={140}
                    placeholder="Give your note a name"
                    required
                  />
                </label>
                <div className="composer-row">
                  <label>
                    By
                    <input
                      name="author"
                      value={form.author || displayName}
                      onChange={updateForm}
                      maxLength={80}
                      required
                    />
                  </label>
                  <label>
                    Format
                    <select name="type" value={form.type} onChange={updateForm}>
                      {POST_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {form.type !== "Birthday special" ? (
                  <label>
                    Section
                    <select name="category" value={form.category} onChange={updateForm}>
                      {POST_CATEGORIES.filter((category) => category !== "Celebrations").map(
                        (category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                ) : (
                  <p className="field-note">
                    Birthday specials will appear in the Celebrations section.
                  </p>
                )}
                <label>
                  Publish setting
                  <select name="status" value={form.status} onChange={updateForm}>
                    <option value="published">Publish to the homepage</option>
                    <option value="draft">Save as a private draft</option>
                  </select>
                </label>
                {form.status === "published" ? (
                  <label className="featured-option">
                    <input
                      type="checkbox"
                      checked={form.is_featured}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, is_featured: event.target.checked }))
                      }
                    />
                    Feature this note at the top of the homepage
                  </label>
                ) : null}
                <label>
                  Your piece
                  <textarea
                    name="body"
                    value={form.body}
                    onChange={updateForm}
                    minLength={40}
                    maxLength={30000}
                    placeholder={
                      form.type === "Birthday special"
                        ? "Write a note for someone worth celebrating…"
                        : "Write your thought, essay, poem or story…"
                    }
                    required
                  />
                </label>
                <label className="cover-label">
                  Cover image <span>Optional · JPEG, PNG or WebP · up to 5 MB</span>
                  <input
                    className="cover-input"
                    type="file"
                    name="cover"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={selectCover}
                  />
                </label>
                {previewUrl ? (
                  <div className="cover-preview">
                    <Image
                      src={previewUrl}
                      alt="Preview of your note cover"
                      width={800}
                      height={450}
                      unoptimized
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setCover(null);
                        setPreviewUrl("");
                      }}
                      aria-label="Remove cover image"
                    >
                      Remove image
                    </button>
                  </div>
                ) : null}
                <div className="composer-footer">
                  <span>
                    {form.status === "published"
                      ? "Readers can find this note in the public library."
                      : "Only you can see this draft."}
                  </span>
                  <button className="publish-button" type="submit" disabled={publishing}>
                    {publishing
                      ? form.status === "draft"
                        ? "Saving…"
                        : "Publishing…"
                      : form.status === "draft"
                        ? "Save draft"
                        : "Publish note"}
                    {!publishing ? <span aria-hidden="true">↗</span> : null}
                  </button>
                </div>
              </form>
            </section>

            <aside className="dashboard-side">
              <section className="profile-summary">
                <p className="eyebrow">Your public page</p>
                <h2>Let readers meet you.</h2>
                <p>
                  {data.profile.bio || "Add a short introduction to your writer profile."}
                </p>
                <Link className="text-link" href={`/writers/${data.user.id}`}>
                  View public profile <span aria-hidden="true">↗</span>
                </Link>
              </section>
              <details className="profile-editor">
                <summary>Edit your profile</summary>
                <form className="studio-form" onSubmit={saveProfile}>
                  <label>
                    Display name
                    <input
                      name="display_name"
                      defaultValue={displayName}
                      maxLength={80}
                      required
                    />
                  </label>
                  <label>
                    Short bio
                    <textarea
                      name="bio"
                      defaultValue={data.profile.bio || ""}
                      maxLength={240}
                      rows={4}
                      placeholder="Tell readers a little about yourself"
                    />
                  </label>
                  <label>
                    Website
                    <input
                      name="website"
                      type="url"
                      defaultValue={data.profile.website || ""}
                      placeholder="https://yoursite.com"
                    />
                  </label>
                  <button className="publish-button" type="submit" disabled={savingProfile}>
                    {savingProfile ? "Saving…" : "Save profile"}
                  </button>
                </form>
              </details>
            </aside>
          </div>

          <section className="dashboard-library">
            <div className="dashboard-heading">
              <p className="eyebrow">Your library</p>
              <h2>Notes you have made.</h2>
            </div>
            {data.posts.length ? (
              <div className="dashboard-grid">
                {data.posts.map((post) => (
                  <article className="dashboard-note" key={post.id}>
                    {post.image ? (
                      <Image
                        className="dashboard-note-image"
                        src={post.image}
                        alt={`Cover for ${post.title}`}
                        width={800}
                        height={450}
                        unoptimized
                      />
                    ) : null}
                    <span>
                      {post.status === "draft" ? "Draft" : post.is_featured ? "Featured" : post.post_type}
                    </span>
                    <h3>
                      {post.status === "published" ? (
                        <Link href={`/notes/${post.id}`}>{post.title}</Link>
                      ) : (
                        post.title
                      )}
                    </h3>
                    <p>{post.excerpt}</p>
                    <small>
                      {formatDate(post.created_at)} · {post.read_time} min read
                    </small>
                    {post.status === "draft" ? (
                      <button
                        className="publish-button dashboard-publish-draft"
                        type="button"
                        onClick={() => void publishDraft(post)}
                        disabled={publishing}
                      >
                        Publish draft
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-state">
                Your published notes will appear here. Start with a story, letter,
                poem or birthday special.
              </p>
            )}
          </section>
        </div>
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
