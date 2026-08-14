import { redirect } from "next/navigation";
import { setEmailDeliveryMode } from "@/app/email-notifications/actions";
import { EmailNotificationTable } from "@/components/email-notification-table";
import { WorkspaceShell } from "@/components/workspace-shell";
import { PaginationLinks } from "@/components/pagination-links";
import { getEmailTestRecipient } from "@/lib/email-notifications";
import { normalizePage, paginationRange } from "@/lib/pagination";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/viewer";

export default async function EmailNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string; page?: string }>;
}) {
  const query = await searchParams;
  const viewer = await getViewer();
  if (!viewer.canManageEmailNotifications) {
    redirect("/dashboard");
  }
  const admin = createAdminClient();
  const { data: deliverySettings } = await admin
    .from("email_delivery_settings")
    .select("delivery_mode,updated_at")
    .eq("setting_key", "primary")
    .maybeSingle();
  const deliveryMode: "off" | "test" | "live" =
    deliverySettings?.delivery_mode === "live" ||
    deliverySettings?.delivery_mode === "test"
      ? deliverySettings.delivery_mode
      : "off";
  const isAdmin = viewer.roles.includes("admin");
  const testRecipient = isAdmin ? getEmailTestRecipient() : null;
  const currentPage = normalizePage(query.page);
  const { from, to } = paginationRange(currentPage);
  const { data: notifications, count } = await admin
    .from("email_notifications")
    .select(
      "id,notification_type,recipient_email,subject,status,attempts,last_error,created_at,sent_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  return (
    <WorkspaceShell
      fullName={viewer.fullName}
      roles={viewer.roles}
      roomTypeCodes={viewer.roomTypes.map(({ code }) => code)}
      allowBasicMedicalAccess={viewer.allowBasicMedicalAccess}
      canImportSchedules={viewer.canImportSchedules}
      canManagePersonnel={viewer.canManagePersonnel}
      title="Email thông báo"
      description={
        deliveryMode === "off"
          ? "Hệ thống đang tắt gửi email. Thông báo mới chỉ được ghi nhận và không gọi Apps Script."
          : deliveryMode === "test"
            ? isAdmin
              ? `Chế độ kiểm thử; email thực tế chỉ gửi đến ${testRecipient}.`
              : "Chế độ kiểm thử đang hoạt động; người nhận gốc không nhận email."
            : "Lịch sử email thông báo. Email thất bại chỉ được gửi lại khi Admin hoặc Chuyên viên bấm Gửi lại."
      }
    >
      {query.notice ? (
        <p className="action-feedback success">{query.notice}</p>
      ) : null}
      {query.error ? (
        <p className="action-feedback error">{query.error}</p>
      ) : null}
      <section className="data-panel email-delivery-mode-panel">
        <div>
          <strong>
            Chế độ hiện tại:{" "}
            {deliveryMode === "off"
              ? "Tắt gửi"
              : deliveryMode === "test"
                ? "Kiểm thử"
                : "Gửi thật"}
          </strong>
          <p>
            {deliveryMode === "off"
              ? "Không gửi email đến người nhận gốc hoặc email kiểm thử. Email bị bỏ qua sẽ không được gửi dồn khi bật lại."
              : deliveryMode === "test"
                ? isAdmin
                  ? `Người nhận gốc không nhận email. Toàn bộ bản kiểm thử chỉ gửi đến ${testRecipient} để Admin kiểm tra nội dung.`
                  : "Người nhận gốc không nhận email trong chế độ kiểm thử."
                : "Thông báo mới được gửi thật qua Apps Script đến người nhận."}
          </p>
        </div>
        {isAdmin ? (
          <div className="email-delivery-mode-actions">
            {(
              [
                ["off", "Tắt gửi email", "button-outline-danger"],
                ["test", "Bật kiểm thử", "button-secondary"],
                ["live", "Bật gửi email thật", "button-primary"],
              ] as const
            ).map(([mode, label, className]) => (
              <form action={setEmailDeliveryMode} key={mode}>
                <input type="hidden" name="delivery_mode" value={mode} />
                <button
                  className={`button ${className}`}
                  type="submit"
                  disabled={deliveryMode === mode}
                >
                  {label}
                </button>
              </form>
            ))}
          </div>
        ) : null}
      </section>
      <div className="data-panel catalog-data-panel">
        <EmailNotificationTable
          notifications={notifications ?? []}
          isAdmin={isAdmin}
          canRetry={viewer.canManageEmailNotifications}
          deliveryMode={deliveryMode}
        />
        {!notifications?.length ? (
          <p className="panel-empty">Chưa có email thông báo.</p>
        ) : null}
        <PaginationLinks
          currentPage={currentPage}
          totalItems={count ?? 0}
          pathname="/email-notifications"
        />
      </div>
    </WorkspaceShell>
  );
}
