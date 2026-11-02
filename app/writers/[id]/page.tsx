import type { Metadata } from "next";
import { WriterProfile } from "@/components/writer-profile";

export const metadata: Metadata = { title: "Writer profile" };

export default async function WriterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WriterProfile id={id} />;
}
