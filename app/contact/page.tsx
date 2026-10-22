import type { Metadata } from "next";
import ContactPage from "@/components/contact/ContactPage";

export const metadata: Metadata = {
  title: "Contact & Support | BelGlow",
  description: "Contact BelGlow for help with orders, accounts, selling, products, or general marketplace questions.",
};

export default function ContactRoute() {
  return <ContactPage />;
}
