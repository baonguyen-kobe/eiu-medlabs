import { processPendingScheduleEmails } from "@/lib/email-notifications";
import { NextRequest, NextResponse } from "next/server";

async function recover(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Không có quyền." }, { status: 401 });
  }
  try {
    await processPendingScheduleEmails();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("email.recovery.failed", error);
    return NextResponse.json(
      { error: "Không thể chạy khôi phục email." },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return recover(request);
}

export async function POST(request: NextRequest) {
  return recover(request);
}
