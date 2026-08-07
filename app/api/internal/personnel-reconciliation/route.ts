import { reconcileExpiredPersonnelUpdates } from "@/lib/personnel-reconciliation";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Không có quyền." }, { status: 401 });
  }
  try {
    return NextResponse.json(await reconcileExpiredPersonnelUpdates());
  } catch (error) {
    console.error("personnel.reconciliation.failed", error);
    return NextResponse.json(
      { error: "Không thể chạy đối soát nhân sự." },
      { status: 500 },
    );
  }
}
