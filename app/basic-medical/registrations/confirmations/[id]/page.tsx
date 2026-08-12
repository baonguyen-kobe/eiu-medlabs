import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { isBasicMedicalConfirmationEvidenceEnabled } from "@/lib/basic-medical-confirmation-evidence";
import type { BasicMedicalConfirmationEvidence } from "@/lib/basic-medical-equipment";
import { getViewer } from "@/lib/viewer";
import { canViewBasicMedicalRegistrations } from "@/lib/workspace-access";

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatDate(value: string) {
  return value.split("-").reverse().join("/");
}

function formatTime(value: string) {
  return value.slice(0, 5);
}

export default async function BasicMedicalConfirmationEvidencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isBasicMedicalConfirmationEvidenceEnabled()) notFound();

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const viewer = await getViewer();
  const roomTypeCodes = viewer.roomTypes.map(({ code }) => code);
  if (!canViewBasicMedicalRegistrations(viewer.roles, roomTypeCodes)) {
    notFound();
  }

  const { data, error } = await viewer.supabase.rpc(
    "get_basic_medical_confirmation_evidence",
    { target_confirmation_id: id },
  );
  if (error || !data) notFound();
  const evidence = data as unknown as BasicMedicalConfirmationEvidence;
  const invalidated = evidence.invalidated_at !== null;

  return (
    <WorkspaceShell
      fullName={viewer.fullName}
      roles={viewer.roles}
      roomTypeCodes={roomTypeCodes}
      allowBasicMedicalAccess={viewer.allowBasicMedicalAccess}
      canImportSchedules={viewer.canImportSchedules}
      canManagePersonnel={viewer.canManagePersonnel}
      title="Bằng chứng xác nhận Y cơ sở"
      description="Bản ghi lịch sử chỉ sử dụng dữ liệu đã chụp tại thời điểm ký."
    >
      <p>
        <Link href="/basic-medical/registrations">
          ← Trở lại danh sách phiếu
        </Link>
      </p>

      {invalidated ? (
        <div className="action-feedback error" role="status">
          <strong>Xác nhận đã vô hiệu</strong>
          <br />
          {evidence.invalidated_reason || "Không có lý do được ghi nhận."}
          {evidence.invalidated_at
            ? ` · ${dateTimeFormatter.format(new Date(evidence.invalidated_at))}`
            : null}
        </div>
      ) : (
        <p className="action-feedback success">Xác nhận đang có hiệu lực.</p>
      )}

      <section className="data-panel equipment-request-list-panel">
        <div className="equipment-request-detail-grid">
          <div>
            <span>Thời điểm ký</span>
            <strong>
              {dateTimeFormatter.format(new Date(evidence.signed_at))}
            </strong>
          </div>
          <div>
            <span>Người ký (ID tại thời điểm ký)</span>
            <strong className="mono">{evidence.signer_id}</strong>
          </div>
          <div>
            <span>Lịch đã chụp</span>
            <strong>
              {formatDate(evidence.schedule_date_snapshot)} ·{" "}
              {formatTime(evidence.start_time_snapshot)}–
              {formatTime(evidence.end_time_snapshot)}
            </strong>
          </div>
          <div>
            <span>Phòng (ID tại thời điểm ký)</span>
            <strong className="mono">{evidence.room_id_snapshot}</strong>
          </div>
          <div>
            <span>Giảng viên buổi học (ID đã chụp)</span>
            <strong className="mono">
              {evidence.teaching_lecturer_id_snapshot}
            </strong>
          </div>
          <div>
            <span>Mã lịch (đã chụp)</span>
            <strong className="mono">
              {evidence.class_schedule_id_snapshot}
            </strong>
          </div>
        </div>

        <h2>Chữ ký điện tử</h2>
        {/* eslint-disable-next-line @next/next/no-img-element -- authorized data URL is not an optimizable asset */}
        <img
          alt="Chữ ký điện tử đã lưu tại thời điểm xác nhận"
          className="basic-medical-signature-image"
          src={evidence.signature_data}
        />

        <h2>Tình trạng thiết bị đã chụp</h2>
        <div className="responsive-table">
          <table className="data-table basic-medical-condition-table">
            <thead>
              <tr>
                <th>Thiết bị</th>
                <th>ĐVT</th>
                <th>Trước (Tốt/Hư/Tổng)</th>
                <th>Hư mới</th>
                <th>Sau (Tốt/Hư/Tổng)</th>
              </tr>
            </thead>
            <tbody>
              {evidence.equipment_checks.map((check) => (
                <tr key={check.inventory_id}>
                  <td>
                    <strong>{check.item_name_snapshot}</strong>
                    <br />
                    <span>{check.commercial_name_snapshot || "—"}</span>
                  </td>
                  <td>{check.unit_snapshot}</td>
                  <td>
                    {check.good_before}/{check.damaged_before}/
                    {check.total_before}
                  </td>
                  <td>{check.newly_damaged_quantity}</td>
                  <td>
                    {check.good_after}/{check.damaged_after}/{check.total_after}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </WorkspaceShell>
  );
}
