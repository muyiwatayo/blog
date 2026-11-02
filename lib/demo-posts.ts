import type { Post } from "@/lib/types";

export const demoPosts: Post[] = [
  {
    id: "sample-attention",
    title: "The quiet architecture of attention",
    excerpt:
      "A field guide to making room for the thoughts that do not arrive with a notification sound.",
    body:
      "Attention is not a personality trait. It is a place we make. It lives in the space between the alert and the answer, in the walk without a podcast, in the notebook left open on the table.\n\nThe work is not to become unreachable. It is to decide what deserves to reach us.",
    post_type: "Essay",
    category: "Essays",
    author: "Mina Kwon",
    author_id: "",
    read_time: 2,
    image: "/covers/attention.svg",
    private_image_path: null,
    status: "published",
    is_featured: true,
    published_at: "2026-10-12T10:00:00.000Z",
    created_at: "2026-10-12T10:00:00.000Z",
  },
  {
    id: "sample-birthday",
    title: "For the person who makes every room softer",
    excerpt:
      "A birthday letter about the small, generous ways a friend makes an ordinary day feel like a place to stay.",
    body:
      "You have always known how to make a room feel less like a room and more like somewhere we can all exhale.\n\nI hope today gives some of that gentleness back to you: in a second cup of tea, in a message from an old friend, in the steady knowledge that your being here has made so many days better.",
    post_type: "Birthday special",
    category: "Celebrations",
    author: "Theo Hart",
    author_id: "",
    read_time: 1,
    image: "/covers/birthday.svg",
    private_image_path: null,
    status: "published",
    is_featured: false,
    published_at: "2026-10-06T10:00:00.000Z",
    created_at: "2026-10-06T10:00:00.000Z",
  },
  {
    id: "sample-letters",
    title: "A letter to the slow afternoon",
    excerpt:
      "No appointment, no particular plan. Just a little time left open and a light that takes its time moving across the floor.",
    body:
      "Dear afternoon,\n\nThank you for not asking me to be useful. For the long shadow of the window plant. For a cup that has gone a little cold while I was looking out of the window.\n\nI had forgotten there was enough time to simply be here.\n\nWith care,\nSomeone finally sitting still",
    post_type: "Letter",
    category: "Community",
    author: "Mina Kwon",
    author_id: "",
    read_time: 1,
    image: "/covers/letters.svg",
    private_image_path: null,
    status: "published",
    is_featured: false,
    published_at: "2026-09-28T10:00:00.000Z",
    created_at: "2026-09-28T10:00:00.000Z",
  },
];
