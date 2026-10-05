import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Shop | BelGlow",
  description: "Browse the BelGlow beauty and self-care marketplace.",
};

export default function AccountPage() {
  redirect("/shop");
}
