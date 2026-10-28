import { NextResponse } from "next/server";
import { deliverPendingEmails } from "@/lib/resend";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    return NextResponse.json(await deliverPendingEmails({ limit: 50 }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Email processing failed." }, { status: 500 });
  }
}
