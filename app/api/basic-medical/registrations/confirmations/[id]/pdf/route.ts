import { NextResponse } from "next/server";
import { createBasicMedicalEvidencePdf } from "@/lib/basic-medical-evidence-pdf";
import { isBasicMedicalConfirmationEvidenceEnabled } from "@/lib/basic-medical-confirmation-evidence";
import type { BasicMedicalConfirmationEvidence } from "@/lib/basic-medical-equipment";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isBasicMedicalConfirmationEvidenceEnabled())
    return new NextResponse(null, { status: 404 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id))
    return new NextResponse(null, { status: 404 });
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return new NextResponse(null, { status: 401 });
  const { data, error } = await supabase.rpc(
    "get_basic_medical_confirmation_evidence",
    { target_confirmation_id: id },
  );
  if (error || !data) return new NextResponse(null, { status: 404 });
  try {
    const output = await createBasicMedicalEvidencePdf(
      data as BasicMedicalConfirmationEvidence,
    );
    return new NextResponse(new Uint8Array(output), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="bang-chung-xac-nhan-y-co-so-${id}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("basic_medical.evidence_pdf_failed", {
      code: error instanceof Error ? error.name : "UNKNOWN",
    });
    return new NextResponse(null, { status: 500 });
  }
}
