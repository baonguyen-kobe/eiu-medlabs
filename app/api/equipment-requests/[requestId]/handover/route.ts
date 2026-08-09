import { NextResponse } from "next/server";
import {
  createEquipmentHandoverPdf,
  equipmentHandoverPdfSelect,
  type EquipmentHandoverRequest,
} from "@/lib/equipment-handover-pdf";
import { formatEquipmentRequestCode } from "@/lib/equipment-request-code";
import { createClient } from "@/lib/supabase/server";

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

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "staff"]);
  if (!roles?.length) {
    return NextResponse.json(
      { error: "Chỉ Admin và Staff được xuất phiếu giao nhận." },
      { status: 403 },
    );
  }

  const { requestId } = await params;
  const { data, error } = await supabase
    .from("equipment_requests")
    .select(equipmentHandoverPdfSelect)
    .eq("id", requestId)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json(
      { error: "Không tìm thấy phiếu thiết bị." },
      { status: 404 },
    );
  }

  try {
    const request = data as unknown as EquipmentHandoverRequest;
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
