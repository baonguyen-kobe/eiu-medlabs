import { createAdminClient } from "@/lib/supabase/admin";

type PersonnelOperation = {
  id: string;
  profile_id: string;
  previous_email: string;
  requested_email: string;
  expected_version: number;
  status: string;
  expires_at: string;
  actor_id: string;
};

export type PersonnelReconciliationResult = {
  inspected: number;
  committed: number;
  rolledBack: number;
  reconciliationRequired: number;
};

/**
 * Reconciles only expired durable operations. It deliberately prefers rolling
 * Auth back to the still-authoritative profile when the DB commit never ran.
 * This function uses the server-only service client and is safe to call from a
 * protected cron endpoint or an operator task.
 */
export async function reconcileExpiredPersonnelUpdates(): Promise<PersonnelReconciliationResult> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("personnel_update_operations")
    .select(
      "id,profile_id,previous_email,requested_email,expected_version,status,expires_at,actor_id",
    )
    .in("status", [
      "reserved",
      "auth_updated",
      "rollback_required",
      "reconciliation_required",
    ])
    .lte("expires_at", now)
    .order("created_at")
    .limit(100);
  if (error) throw error;

  const result: PersonnelReconciliationResult = {
    inspected: data?.length ?? 0,
    committed: 0,
    rolledBack: 0,
    reconciliationRequired: 0,
  };

  for (const operation of (data ?? []) as PersonnelOperation[]) {
    const [{ data: profile, error: profileError }, authResult] =
      await Promise.all([
        admin
          .from("profiles")
          .select("email,access_version")
          .eq("id", operation.profile_id)
          .maybeSingle(),
        admin.auth.admin.getUserById(operation.profile_id),
      ]);
    const authEmail = authResult.data.user?.email?.trim().toLowerCase();
    const profileEmail = profile?.email?.trim().toLowerCase();
    const previousEmail = operation.previous_email.trim().toLowerCase();
    const requestedEmail = operation.requested_email.trim().toLowerCase();

    if (
      !profileError &&
      !authResult.error &&
      profileEmail === requestedEmail &&
      authEmail === requestedEmail &&
      (profile?.access_version ?? 0) > operation.expected_version
    ) {
      await resolveOperation(admin, operation.id, "committed", null);
      result.committed += 1;
      continue;
    }

    if (!profileError && !authResult.error && profileEmail === previousEmail) {
      if (authEmail === requestedEmail) {
        const { error: rollbackError } = await admin.auth.admin.updateUserById(
          operation.profile_id,
          { email: previousEmail, email_confirm: true },
        );
        if (!rollbackError) {
          await resolveOperation(
            admin,
            operation.id,
            "rolled_back",
            "Expired Auth update rolled back to profile email",
          );
          result.rolledBack += 1;
          continue;
        }
      } else if (authEmail === previousEmail) {
        await resolveOperation(
          admin,
          operation.id,
          "rolled_back",
          "Auth and profile already matched the previous email",
        );
        result.rolledBack += 1;
        continue;
      }
    }

    const details = [
      profileError?.message,
      authResult.error?.message,
      `profile=${profileEmail ?? "missing"}`,
      `auth=${authEmail ?? "missing"}`,
      `profile_version=${profile?.access_version ?? "missing"}`,
      `expected_version=${operation.expected_version}`,
    ]
      .filter(Boolean)
      .join("; ");
    const { error: lockError } = await admin
      .from("profiles")
      .update({
        is_active: false,
        can_import_schedules: false,
        allow_basic_medical_access: false,
      })
      .eq("id", operation.profile_id);
    const { error: logError } = await admin
      .from("personnel_auth_reconciliation_logs")
      .insert({
        profile_id: operation.profile_id,
        previous_email: operation.previous_email,
        requested_email: operation.requested_email,
        failure_stage: "expired_personnel_update_reconciliation",
        error_message: `${details}; profile_lock=${lockError?.message ?? "ok"}`,
        created_by: operation.actor_id,
      });
    const finalError = `${details}; profile_lock=${lockError?.message ?? "ok"}; reconciliation_log=${logError?.message ?? "ok"}`;
    await resolveOperation(
      admin,
      operation.id,
      "reconciliation_required",
      finalError,
    );
    console.error("personnel.reconciliation.required", {
      operation_id: operation.id,
      profile_id: operation.profile_id,
      error: finalError,
    });
    result.reconciliationRequired += 1;
  }
  return result;
}

async function resolveOperation(
  admin: ReturnType<typeof createAdminClient>,
  operationId: string,
  status: "committed" | "rolled_back" | "reconciliation_required",
  error: string | null,
) {
  const { error: resolveError } = await admin.rpc(
    "resolve_personnel_update_operation",
    {
      target_operation_id: operationId,
      target_status: status,
      target_error: error,
    },
  );
  if (resolveError) throw resolveError;
}
