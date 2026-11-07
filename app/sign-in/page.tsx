import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return <AuthForm key="sign-in" mode="sign-in" />;
}
