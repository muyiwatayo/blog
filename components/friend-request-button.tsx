"use client";

import type { FriendshipStatus } from "@/lib/friendships";

export type FriendRequestAction =
  | "send"
  | "cancel"
  | "accept"
  | "decline"
  | "remove";

type FriendRequestButtonProps = {
  status: FriendshipStatus;
  signedIn: boolean;
  busy?: boolean;
  onAction: (action: FriendRequestAction) => void;
};

export function FriendRequestButton({
  status,
  signedIn,
  busy = false,
  onAction,
}: FriendRequestButtonProps) {
  if (!signedIn) {
    return (
      <button
        className="friend-request-button"
        type="button"
        onClick={() => onAction("send")}
      >
        Sign in to add friend
      </button>
    );
  }

  if (status === "pending_received") {
    return (
      <span className="friend-request-actions">
        <button
          className="friend-request-button friend-request-primary"
          type="button"
          disabled={busy}
          onClick={() => onAction("accept")}
        >
          Accept request
        </button>
        <button
          className="friend-request-secondary"
          type="button"
          disabled={busy}
          onClick={() => onAction("decline")}
        >
          Decline
        </button>
      </span>
    );
  }

  if (status === "pending_sent") {
    return (
      <button
        className="friend-request-button"
        type="button"
        disabled={busy}
        onClick={() => onAction("cancel")}
      >
        Request sent · cancel
      </button>
    );
  }

  if (status === "friends") {
    return (
      <button
        className="friend-request-button friend-request-connected"
        type="button"
        disabled={busy}
        onClick={() => onAction("remove")}
      >
        Friends · remove
      </button>
    );
  }

  return (
    <button
      className="friend-request-button friend-request-primary"
      type="button"
      disabled={busy}
      onClick={() => onAction("send")}
    >
      Send friend request
    </button>
  );
}
