import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard";

export const metadata: Metadata = { title: "Writer studio" };

export default function DashboardPage() {
  return <Dashboard />;
}
