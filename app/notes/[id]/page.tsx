import type { Metadata } from "next";
import { NotePage } from "@/components/note-page";

export const metadata: Metadata = { title: "A Fieldnotes story" };

export default async function NoteRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <NotePage id={id} />;
}
