import Link from "next/link";
import type { EquipmentRequestDomain } from "@/lib/equipment-requests";

export function EquipmentRegistrationDomainSwitch({
  activeDomain,
  canUseSkills,
  canUseBasicMedical,
}: {
  activeDomain: EquipmentRequestDomain;
  canUseSkills: boolean;
  canUseBasicMedical: boolean;
}) {
  if (!canUseSkills || !canUseBasicMedical) return null;

  return (
    <nav className="segmented-control" aria-label="Loại phiếu thiết bị">
      <Link
        className={activeDomain === "nursing_skills" ? "selected" : ""}
        href="/equipment/register"
      >
        Kỹ năng Điều dưỡng
      </Link>
      <Link
        className={activeDomain === "basic_medical" ? "selected" : ""}
        href="/equipment/register?domain=basic_medical"
      >
        Y cơ sở
      </Link>
    </nav>
  );
}
