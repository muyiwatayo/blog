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

type DashboardTab = "published" | "drafts";

async function prepareCoverUpload(file: File): Promise<File> {
  if (file.size <= 1024 * 1024 || typeof createImageBitmap !== "function") return file;

  const image = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    image.close();
    throw new Error("Your browser could not prepare this image. Try a smaller JPEG, PNG or WebP.");
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.84),
  );
  if (!blob) throw new Error("Your browser could not prepare this image. Try another image.");
  if (blob.type !== "image/webp") return file;
  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error("This image is still larger than 5 MB after compression. Choose a smaller image.");
  }

  const name = file.name.replace(/\.[^.]+$/, "") || "cover";
  return new File([blob], `${name}.webp`, {
    type: "image/webp",
    lastModified: file.lastModified,
  });
}

function getDashboardErrorMessage(error: unknown, fallback: string): string {
  if (
    error instanceof TypeError ||
    (error instanceof Error && /failed to fetch|network request failed/i.test(error.message))
  ) {
    return "Could not reach Supabase. Check your connection and confirm this project has the covers and draft-covers Storage buckets configured.";
  }
  return error instanceof Error ? error.message : fallback;
}

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
  const [removeCover, setRemoveCover] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardTab>("published");
  const [currentTime, setCurrentTime] = useState(0);
  const { savedCount } = useSavedNotes();

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

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

  useEffect(() => () => {
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
  }, [avatarPreviewUrl]);

  function getEditSecondsRemaining(post: Post) {
    return Math.max(
      0,
      Math.ceil((new Date(post.created_at).getTime() + 3 * 60 * 1000 - currentTime) / 1000),
    );
  }

  async function copySharedLink(path: string) {
    const link = new URL(path, window.location.origin).toString();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        const input = document.createElement("textarea");
        input.value = link;
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.append(input);
        input.select();
        const copied = document.execCommand("copy");
        input.remove();
        if (!copied) throw new Error("Copy was blocked by the browser.");
      }
      setNotice("Share link copied to your clipboard.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The share link could not be copied.");
    }
  }

  function beginEdit(post: Post) {
    const remaining = getEditSecondsRemaining(post);
    if (remaining <= 0) {
      setNotice("The 3-minute editing window has ended.");
      return;
    }
    setEditingPostId(post.id);
    setForm({
      title: post.title,
      author: post.author,
      type: post.post_type,
      category: post.category,
      body: post.body,
      status: post.status,
      is_featured: post.is_featured,
    });
    setCover(null);
    setPreviewUrl(post.image || "");
    setRemoveCover(false);
    setComposerOpen(true);
    window.setTimeout(() => {
      document.getElementById("write")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function resetComposer() {
    setEditingPostId(null);
    setForm(initialForm);
    setCover(null);
    setPreviewUrl("");
    setRemoveCover(false);
    setComposerOpen(false);
  }

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
      setRemoveCover(false);
      return;
    }
    if (!IMAGE_MIME_TYPES.includes(selected.type as (typeof IMAGE_MIME_TYPES)[number])) {
      setCover(null);
      setPreviewUrl("");
      event.currentTarget.value = "";
      setRemoveCover(false);
      setNotice("Choose a JPEG, PNG or WebP image.");
      return;
    }
    if (selected.size > MAX_IMAGE_BYTES) {
      setCover(null);
      setPreviewUrl("");
      event.currentTarget.value = "";
      setRemoveCover(false);
      setNotice("Cover images must be 5 MB or smaller.");
      return;
    }
    setCover(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    setRemoveCover(false);
    setRemoveCover(false);
  }

  function selectAvatar(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.currentTarget.files?.[0] || null;
    setNotice("");
    if (!selected) {
      setAvatarFile(null);
      setAvatarPreviewUrl("");
      return;
    }
    if (!IMAGE_MIME_TYPES.includes(selected.type as (typeof IMAGE_MIME_TYPES)[number])) {
      setAvatarFile(null);
      setAvatarPreviewUrl("");
      event.currentTarget.value = "";
      setNotice("Choose a JPEG, PNG or WebP profile photo.");
      return;
    }
    if (selected.size > MAX_IMAGE_BYTES) {
      setAvatarFile(null);
      setAvatarPreviewUrl("");
      event.currentTarget.value = "";
      setNotice("Profile photos must be 5 MB or smaller.");
      return;
    }
    setAvatarFile(selected);
    setAvatarPreviewUrl(URL.createObjectURL(selected));
    setRemoveAvatar(false);
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
      const existingPost = editingPostId
        ? data.posts.find((post) => post.id === editingPostId)
        : null;
      if (editingPostId && !existingPost) {
        throw new Error("This post could not be found in your writer studio.");
      }

      let image = removeCover
        ? null
        : existingPost?.private_image_path
          ? null
          : existingPost?.image || null;
      let privateImagePath = removeCover ? null : existingPost?.private_image_path || null;
      if (cover) {
        const uploadFile = await prepareCoverUpload(cover);
        const extension = uploadFile.type === "image/jpeg" ? "jpg" : uploadFile.type.split("/")[1];
        const imagePath = `${data.user.id}/${crypto.randomUUID()}.${extension}`;
        uploadedBucket = form.status === "draft" ? "draft-covers" : "covers";
        const { error: uploadError } = await supabase.storage
          .from(uploadedBucket)
          .upload(imagePath, uploadFile, {
            contentType: uploadFile.type,
            cacheControl: "3600",
            upsert: false,
          });
        if (uploadError) {
          throw new Error(
            `Image upload failed: ${uploadError.message}. Check that the signed-in account can upload to its own Storage folder and that the storage policies are installed.`,
          );
        }
        uploadedPath = imagePath;
        if (form.status === "draft") {
          privateImagePath = imagePath;
          image = null;
        } else {
          image = supabase.storage.from("covers").getPublicUrl(imagePath).data.publicUrl;
          privateImagePath = null;
        }
      }

      const excerpt = form.body.trim().replace(/\s+/g, " ").slice(0, 180);
      const isPublished = form.status === "published";
      const postValues = {
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
        published_at: isPublished
          ? existingPost?.published_at || new Date().toISOString()
          : null,
      };
      const postQuery = existingPost
        ? supabase
            .from("posts")
            .update(postValues)
            .eq("id", existingPost.id)
            .eq("author_id", data.user.id)
            .gt("created_at", new Date(Date.now() - 3 * 60 * 1000).toISOString())
        : supabase.from("posts").insert(postValues);
      const { data: savedPost, error: saveError } = await postQuery.select("*").single();
      if (saveError) {
        if (existingPost && /row-level security|0 rows|no rows/i.test(saveError.message)) {
          throw new Error("The 3-minute editing window has ended. Your post was not changed.");
        }
        throw saveError;
      }
      let note = savedPost as Post;
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
          ? {
              ...current,
              posts: existingPost
                ? current.posts.map((post) => (post.id === note.id ? note : post))
                : [note, ...current.posts],
            }
          : current,
      );
      if (existingPost?.private_image_path && (cover || removeCover)) {
        const { error: removeError } = await supabase.storage
          .from("draft-covers")
          .remove([existingPost.private_image_path]);
        if (removeError) console.error("Could not remove the replaced draft cover.", removeError);
      }
      resetComposer();
      formElement.reset();
      setNotice(
        existingPost
          ? "Your post has been updated."
          : isPublished
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
      setNotice(getDashboardErrorMessage(error, "Your note could not be saved."));
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
        const draftPath = post.private_image_path;
        const mimeTypeByExtension: Record<string, (typeof IMAGE_MIME_TYPES)[number]> = {
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          png: "image/png",
          webp: "image/webp",
        };
        const extension = draftPath.split(".").pop()?.toLowerCase() || "";
        const contentType =
          IMAGE_MIME_TYPES.find((type) => type === coverFile.type) ||
          mimeTypeByExtension[extension];
        if (!contentType) {
          throw new Error("This draft cover has an unsupported file type. Replace it with a JPEG, PNG or WebP image.");
        }
        const { error: uploadError } = await supabase.storage
          .from("covers")
          .upload(draftPath, coverFile, {
            contentType,
            cacheControl: "3600",
            upsert: false,
          });
        if (uploadError) {
          throw new Error(
            `Draft cover upload failed: ${uploadError.message}. Check the Storage upload policies and bucket settings.`,
          );
        }
        publicImagePath = draftPath;
        image = supabase.storage.from("covers").getPublicUrl(draftPath).data.publicUrl;
      }

      const { error: publishError } = await supabase.rpc("publish_own_draft", {
        p_post_id: post.id,
        p_image: image,
      });
      if (publishError) throw publishError;
      publicImagePath = null;
      const { data: updatedPost, error: readError } = await supabase
        .from("posts")
        .select("*")
        .eq("id", post.id)
        .eq("author_id", data.user.id)
        .single();
      if (readError) throw readError;

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
      setNotice(getDashboardErrorMessage(error, "The draft could not be published."));
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
    let uploadedAvatarPath: string | null = null;

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
      let avatarUrl = removeAvatar ? null : data.profile.avatar_url;
      let avatarPath = removeAvatar ? null : data.profile.avatar_path || null;
      if (avatarFile) {
        const extension = avatarFile.type === "image/jpeg" ? "jpg" : avatarFile.type.split("/")[1];
        uploadedAvatarPath = `${data.user.id}/avatars/${crypto.randomUUID()}.${extension}`;
        const { error: avatarUploadError } = await supabase.storage
          .from("covers")
          .upload(uploadedAvatarPath, avatarFile, {
            contentType: avatarFile.type,
            cacheControl: "3600",
            upsert: false,
          });
        if (avatarUploadError) {
          throw new Error(`Profile photo upload failed: ${avatarUploadError.message}`);
        }
        avatarPath = uploadedAvatarPath;
        avatarUrl = supabase.storage.from("covers").getPublicUrl(uploadedAvatarPath).data.publicUrl;
      }
      const { data: updatedAuth, error: authError } = await supabase.auth.updateUser({
        data: { display_name: displayName, full_name: displayName, bio, website },
      });
      if (authError) throw authError;

      const { error: profileError } = await supabase.from("profiles").upsert(
        {
          id: data.user.id,
          display_name: displayName,
          bio,
          website,
          avatar_url: avatarUrl,
          avatar_path: avatarPath,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
      if (profileError) throw profileError;

      setData((current) =>
        current && updatedAuth.user
          ? {
              ...current,
              user: updatedAuth.user,
              profile: {
                ...current.profile,
                display_name: displayName,
                bio,
                website,
                avatar_url: avatarUrl,
                avatar_path: avatarPath,
              },
            }
          : current,
      );
      if (removeAvatar && data.profile.avatar_path) {
        const { error: removeError } = await supabase.storage
          .from("covers")
          .remove([data.profile.avatar_path]);
        if (removeError) console.error("Could not remove the previous profile photo.", removeError);
      } else if (avatarFile && data.profile.avatar_path) {
        const { error: removeError } = await supabase.storage
          .from("covers")
          .remove([data.profile.avatar_path]);
        if (removeError) console.error("Could not remove the replaced profile photo.", removeError);
      }
      setAvatarFile(null);
      setAvatarPreviewUrl("");
      setRemoveAvatar(false);
      setNotice("Your profile is saved.");
    } catch (error) {
      if (uploadedAvatarPath) {
        const { error: removeError } = await createClient()
          .storage.from("covers").remove([uploadedAvatarPath]);
        if (removeError) console.error("Could not remove the unused profile photo.", removeError);
      }
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
      <div className="app-shell dashboard-app-shell">
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
      <div className="app-shell dashboard-app-shell">
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
  const avatarSrc = avatarPreviewUrl || (!removeAvatar ? data.profile.avatar_url : null);
  const publishedPosts = data.posts.filter((post) => post.status === "published");
  const draftPosts = data.posts.filter((post) => post.status === "draft");
  const visiblePosts = activeTab === "published" ? publishedPosts : draftPosts;
  const editingPost = data.posts.find((post) => post.id === editingPostId) || null;
  const editSecondsRemaining = editingPost ? getEditSecondsRemaining(editingPost) : 0;

  function openComposer() {
    resetComposer();
    setComposerOpen(true);
    window.setTimeout(() => {
      document.getElementById("write")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function openProfileEditor() {
    const editor = document.getElementById("profile-settings");
    if (editor instanceof HTMLDetailsElement) {
      editor.open = true;
      editor.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  return (
    <div className="app-shell dashboard-app-shell">
      <SiteHeader />
      <main className="dashboard-page-shell">
        <div className="dashboard-shell">
          <section className="dashboard-top dashboard-profile-header">
            <div className="dashboard-identity">
              <div className="dashboard-profile-avatar" aria-hidden="true">
                {avatarSrc ? (
                  <Image src={avatarSrc} alt="" width={160} height={160} unoptimized />
                ) : (
                  getInitials(displayName)
                )}
              </div>
              <div className="dashboard-profile-info">
                <p className="eyebrow">Your writer page</p>
                <div className="dashboard-profile-name">
                  <h1>{displayName}</h1>
                  <button className="dashboard-home" type="button" onClick={openProfileEditor}>
                    Edit profile
                  </button>
                </div>
                <p className="dashboard-profile-bio">
                  {data.profile.bio || "A quiet place for the stories you want to share."}
                </p>
                {data.profile.website ? (
                  <a
                    className="dashboard-profile-website"
                    href={data.profile.website}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {data.profile.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  </a>
                ) : null}
                <div className="dashboard-profile-counts" aria-label="Profile activity">
                  <span><strong>{publishedPosts.length}</strong> posts</span>
                  <span>
                    <strong>
                      {data.friendRequests.filter((request) => request.status === "accepted").length}
                    </strong>{" "}
                    friends
                  </span>
                  <span><strong>{savedCount}</strong> saved</span>
                </div>
              </div>
            </div>
            <div className="dashboard-actions dashboard-profile-actions">
              <button className="dashboard-home dashboard-create-button" type="button" onClick={openComposer}>
                Create story
              </button>
              <Link className="dashboard-home" href={`/writers/${data.user.id}`}>
                View profile
              </Link>
              <button
                className="dashboard-home"
                type="button"
                onClick={() => void copySharedLink(`/writers/${data.user.id}`)}
              >
                Copy profile link
              </button>
              <Link className="dashboard-home" href="/messages">
                Messages
              </Link>
              <button className="dashboard-home" type="button" onClick={() => void signOut()}>
                Sign out
              </button>
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

          <details className="profile-editor dashboard-profile-editor" id="profile-settings">
          <summary>Edit your public details</summary>
          <form className="studio-form" onSubmit={saveProfile}>
            <label>
              Profile photo <span>Optional · JPEG, PNG or WebP · up to 5 MB</span>
              <input
                className="cover-input"
                type="file"
                name="avatar"
                accept="image/jpeg,image/png,image/webp"
                onChange={selectAvatar}
              />
            </label>
            {avatarSrc ? (
              <div className="profile-photo-preview">
                <Image src={avatarSrc} alt="Profile photo preview" width={96} height={96} unoptimized />
                <button
                  type="button"
                  onClick={() => {
                    setAvatarFile(null);
                    setAvatarPreviewUrl("");
                    setRemoveAvatar(true);
                  }}
                >
                  Remove photo
                </button>
              </div>
            ) : null}
            <label>
              Display name
              <input name="display_name" defaultValue={displayName} maxLength={80} required />
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

          <section className="dashboard-composer dashboard-composer-panel" id="write" hidden={!composerOpen}>
          <div className="dashboard-heading dashboard-composer-heading">
            <div>
              <p className="eyebrow">Create a post</p>
              <h2>{editingPostId ? "Edit your post." : "Share something worth keeping."}</h2>
              <p className="dashboard-muted">
                Write a story, poem, letter or birthday tribute.
              </p>
            </div>
            <button
              className="dashboard-close-composer"
              type="button"
              onClick={resetComposer}
            >
              Close
            </button>
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
                <select
                  name="status"
                  value={form.status}
                  onChange={updateForm}
                  disabled={Boolean(editingPostId)}
                >
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
                        setRemoveCover(Boolean(editingPostId));
                      }}
                      aria-label="Remove cover image"
                    >
                      Remove image
                    </button>
                  </div>
                ) : null}
                <div className="composer-footer">
                  <span>
                    {editingPostId
                      ? editSecondsRemaining > 0
                        ? `Time left to edit: ${Math.floor(editSecondsRemaining / 60)}:${String(editSecondsRemaining % 60).padStart(2, "0")}.`
                        : "The 3-minute editing window has ended."
                      : form.status === "published"
                      ? "Readers can find this note in the public library."
                      : "Only you can see this draft."}
                  </span>
                  <button
                    className="publish-button"
                    type="submit"
                    disabled={publishing || Boolean(editingPostId && editSecondsRemaining <= 0)}
                  >
                    {publishing
                      ? form.status === "draft"
                        ? "Saving…"
                        : "Publishing…"
                      : editingPostId
                        ? "Save changes"
                      : form.status === "draft"
                        ? "Save draft"
                        : "Publish note"}
                    {!publishing ? <span aria-hidden="true">↗</span> : null}
                  </button>
                </div>
            </form>
          </section>

          <section className="dashboard-library">
            <div className="dashboard-library-heading">
              <div>
                <p className="eyebrow">Your library</p>
                <h2>Posts</h2>
              </div>
              <div className="dashboard-library-tabs" role="tablist" aria-label="Your posts">
                <button
                  id="published-tab"
                  className={activeTab === "published" ? "active" : ""}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "published"}
                  aria-controls="dashboard-posts"
                  onClick={() => setActiveTab("published")}
                >
                  Published <span>{publishedPosts.length}</span>
                </button>
                <button
                  id="drafts-tab"
                  className={activeTab === "drafts" ? "active" : ""}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "drafts"}
                  aria-controls="dashboard-posts"
                  onClick={() => setActiveTab("drafts")}
                >
                  Drafts <span>{draftPosts.length}</span>
                </button>
              </div>
            </div>
            {visiblePosts.length ? (
              <div className="dashboard-grid dashboard-post-grid" id="dashboard-posts" role="tabpanel"
                aria-labelledby={activeTab === "published" ? "published-tab" : "drafts-tab"}>
                {visiblePosts.map((post) => (
                  <article className="dashboard-note" key={post.id}>
                    {post.status === "published" ? (
                      <Link
                        className={`dashboard-post-tile${post.image ? "" : " has-no-image"}`}
                        href={`/notes/${post.id}`}
                        aria-label={`Read ${post.title}`}
                      >
                        {post.image ? (
                          <Image src={post.image} alt="" width={800} height={800} unoptimized />
                        ) : (
                          <span className="dashboard-post-placeholder" aria-hidden="true">f.</span>
                        )}
                        <span className="dashboard-post-overlay">
                          <strong>{post.title}</strong>
                          <small>{post.is_featured ? "Featured" : post.post_type}</small>
                        </span>
                      </Link>
                    ) : (
                      <div className={`dashboard-post-tile is-draft${post.image ? "" : " has-no-image"}`}>
                        {post.image ? (
                          <Image src={post.image} alt="" width={800} height={800} unoptimized />
                        ) : (
                          <span className="dashboard-post-placeholder" aria-hidden="true">f.</span>
                        )}
                        <span className="dashboard-post-overlay">
                          <strong>{post.title}</strong>
                          <small>Draft · {formatDate(post.created_at)}</small>
                        </span>
                        <button
                          className="dashboard-publish-draft"
                          type="button"
                          onClick={() => void publishDraft(post)}
                          disabled={publishing}
                        >
                          {publishing ? "Publishing…" : "Publish"}
                        </button>
                      </div>
                    )}
                    <div className="dashboard-post-actions">
                      {getEditSecondsRemaining(post) > 0 ? (
                        <button type="button" onClick={() => beginEdit(post)}>
                          Edit · {Math.floor(getEditSecondsRemaining(post) / 60)}:
                          {String(getEditSecondsRemaining(post) % 60).padStart(2, "0")}
                        </button>
                      ) : (
                        <span>Editing closed</span>
                      )}
                      {post.status === "published" ? (
                        <button
                          type="button"
                          onClick={() => void copySharedLink(`/notes/${post.id}`)}
                        >
                          Copy link
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div
                className="dashboard-empty-state"
                id="dashboard-posts"
                role="tabpanel"
                aria-labelledby={activeTab === "published" ? "published-tab" : "drafts-tab"}
              >
                <span aria-hidden="true">{activeTab === "published" ? "01" : "02"}</span>
                <div>
                  <h3>{activeTab === "published" ? "Your first post starts here." : "No drafts yet."}</h3>
                  <p>
                    {activeTab === "published"
                      ? "Share a story, letter or birthday tribute with the Fieldnotes community."
                      : "Save a work in progress privately and return to it when you are ready."}
                  </p>
                  <button className="text-link" type="button" onClick={openComposer}>
                    Create a post <span aria-hidden="true">↗</span>
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
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
