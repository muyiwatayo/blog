import Link from "next/link";
import Image from "next/image";
import type { Post } from "@/lib/types";
import { formatDate } from "@/lib/types";

type PostCardProps = {
  post: Post;
  saved?: boolean;
  onSave?: (id: string) => void;
};

export function PostCard({ post, saved = false, onSave }: PostCardProps) {
  return (
    <article className="post-card">
      <Link className="post-card-link" href={`/notes/${post.id}`}>
        <div className="post-image">
          <Image
            fill
            unoptimized
            sizes="(max-width: 700px) 100vw, 50vw"
            src={post.image || "/social-card.svg"}
            alt={post.image ? `Cover for ${post.title}` : "Fieldnotes cover artwork"}
          />
          <span className="post-category">{post.post_type}</span>
        </div>
        <div className="post-card-content">
          <div className="post-card-top">
            <span>{post.read_time} min read</span>
          </div>
          <h3>{post.title}</h3>
          <p>{post.excerpt}</p>
        </div>
      </Link>
      <div className="post-card-bottom">
        <span className="card-byline">
          {post.author_id ? (
            <Link className="author-link" href={`/writers/${post.author_id}`}>
              {post.author}
            </Link>
          ) : (
            post.author
          )}{" "}
          · {formatDate(post.published_at || post.created_at)}
        </span>
        {onSave ? (
          <button
            className={`bookmark${saved ? " saved" : ""}`}
            type="button"
            aria-label={saved ? `Remove ${post.title} from saved notes` : `Save ${post.title}`}
            aria-pressed={saved}
            onClick={() => onSave(post.id)}
          >
            {saved ? "Saved" : "Save"}
          </button>
        ) : null}
      </div>
    </article>
  );
}
