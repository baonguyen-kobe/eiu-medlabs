import { reconcileExpiredPersonnelUpdates } from "@/lib/personnel-reconciliation";
import { NextRequest, NextResponse } from "next/server";

async function reconcile(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Không có quyền." }, { status: 401 });
  }
  try {
    const result = await reconcileExpiredPersonnelUpdates();
    if (result.reconciliationRequired > 0) {
      console.error("personnel.reconciliation.manual_action_required", result);
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("personnel.reconciliation.failed", error);
    return NextResponse.json(
      { error: "Không thể chạy đối soát nhân sự." },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return reconcile(request);
}

export async function POST(request: NextRequest) {
  return reconcile(request);
}
