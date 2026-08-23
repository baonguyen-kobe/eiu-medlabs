import { NextResponse } from "next/server";
import {
  createEquipmentHandoverPdf,
  type EquipmentHandoverRequest,
} from "@/lib/equipment-handover-pdf";
import { formatEquipmentRequestCode } from "@/lib/equipment-request-code";
import { equipmentHandoverSelect } from "@/lib/equipment-requests";
import { createClient } from "@/lib/supabase/server";
import { canManageEquipmentRequestDomain } from "@/lib/workspace-access";
import type { AppRole } from "@/lib/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  const { requestId } = await params;
  const [{ data, error }, { data: roleRows }, { data: roomTypeRows }] =
    await Promise.all([
      supabase
        .from("equipment_requests")
        .select(equipmentHandoverSelect)
        .eq("id", requestId)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase
        .from("profile_room_types")
        .select("room_types(code)")
        .eq("profile_id", userId),
    ]);
  if (error) {
    console.error("Không thể tải phiếu giao nhận thiết bị", {
      requestId,
      error,
    });
    return NextResponse.json(
      { error: "Không thể tải phiếu giao nhận thiết bị." },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: "Không tìm thấy phiếu thiết bị." },
      { status: 404 },
    );
  }

  const roles = (roleRows ?? []).map(({ role }) => role) as AppRole[];
  const roomTypeCodes = (roomTypeRows ?? []).flatMap((row) => {
    const roomType = row.room_types as { code?: string } | null;
    return roomType?.code ? [roomType.code] : [];
  });
  const request = data as unknown as EquipmentHandoverRequest;
  if (
    !canManageEquipmentRequestDomain(
      roles,
      roomTypeCodes,
      request.request_domain,
    )
  ) {
    return NextResponse.json(
      { error: "Bạn không có quyền xuất phiếu giao nhận này." },
      { status: 403 },
    );
  }

  try {
    const output = await createEquipmentHandoverPdf(request);
    const code = formatEquipmentRequestCode(request.created_at);
    return new NextResponse(new Uint8Array(output), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="phieu-giao-nhan-${code}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Không thể tạo phiếu giao nhận thiết bị", error);
    return NextResponse.json(
      { error: "Không thể tạo phiếu giao nhận thiết bị." },
      { status: 500 },
    );
  }
}
