export type Post = {
  id: string;
  title: string;
  excerpt: string;
  body: string;
  post_type: string;
  category: string;
  author: string;
  author_id: string;
  read_time: number;
  image: string | null;
  private_image_path: string | null;
  status: "draft" | "published";
  is_featured: boolean;
  published_at: string | null;
  created_at: string;
};

export type Profile = {
  id: string;
  display_name: string | null;
  bio: string | null;
  website: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export const POST_TYPES = [
  "Essay",
  "Poem",
  "Story",
  "Novel",
  "Letter",
  "Birthday special",
] as const;

export const POST_CATEGORIES = [
  "Essays",
  "Culture",
  "Making",
  "Community",
  "Celebrations",
] as const;

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function getDisplayName(
  metadata: Record<string, unknown> | undefined,
  email: string | undefined,
) {
  const name = metadata?.display_name || metadata?.full_name;
  return typeof name === "string" && name.trim()
    ? name.trim()
    : email?.split("@")[0] || "Writer";
}

export function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function formatDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}
