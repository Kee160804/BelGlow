import type { Metadata } from "next";
import CustomerAccount from "@/components/account/CustomerAccount";

export const metadata: Metadata = {
  title: "My Account | BelGlow",
  description: "Manage your BelGlow orders, saved products, and account details.",
};

export default function AccountPage() {
  return <CustomerAccount />;
}
