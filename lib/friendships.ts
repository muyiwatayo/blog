export type FriendRequest = {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
};

export type FriendshipStatus =
  | "none"
  | "pending_sent"
  | "pending_received"
  | "friends";

export function getFriendshipStatus(
  requests: FriendRequest[],
  currentUserId: string,
  otherUserId: string,
): FriendshipStatus {
  const relationship = requests.find(
    (request) =>
      (request.requester_id === currentUserId && request.recipient_id === otherUserId) ||
      (request.requester_id === otherUserId && request.recipient_id === currentUserId),
  );

  if (!relationship) return "none";
  if (relationship.status === "accepted") return "friends";
  if (relationship.status === "pending") {
    return relationship.requester_id === currentUserId
      ? "pending_sent"
      : "pending_received";
  }
  return "none";
}
