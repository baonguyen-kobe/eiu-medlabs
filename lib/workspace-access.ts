import type { AppRole } from "@/lib/viewer";

const nursingSkillsRoomTypeCode = "nursing_skills";
const basicMedicalRoomTypeCode = "basic_medical";

function hasAnyRole(roles: AppRole[], allowed: AppRole[]) {
  return roles.some((role) => allowed.includes(role));
}

export function isWorkspaceManager(roles: AppRole[]) {
  return hasAnyRole(roles, ["admin", "staff"]);
}

export function canUseSkillsWorkspace(
  roles: AppRole[],
  roomTypeCodes: string[],
) {
  return (
    isWorkspaceManager(roles) ||
    (roomTypeCodes.includes(nursingSkillsRoomTypeCode) &&
      hasAnyRole(roles, ["lecturer", "teaching_assistant", "viewer"]))
  );
}

export function canViewBasicMedicalSchedules(
  roles: AppRole[],
  roomTypeCodes: string[],
) {
  return (
    isWorkspaceManager(roles) ||
    (roomTypeCodes.includes(basicMedicalRoomTypeCode) &&
      hasAnyRole(roles, ["lecturer", "teaching_assistant", "viewer"]))
  );
}

export function canViewBasicMedicalRegistrations(
  roles: AppRole[],
  roomTypeCodes: string[],
) {
  return (
    isWorkspaceManager(roles) ||
    (roomTypeCodes.includes(basicMedicalRoomTypeCode) &&
      hasAnyRole(roles, ["lecturer", "teaching_assistant", "viewer"]))
  );
}

export function canCreateBasicMedicalSchedules(
  roles: AppRole[],
  roomTypeCodes: string[],
  allowBasicMedicalAccess: boolean,
) {
  return (
    isWorkspaceManager(roles) ||
    (allowBasicMedicalAccess &&
      roomTypeCodes.includes(basicMedicalRoomTypeCode) &&
      hasAnyRole(roles, ["lecturer", "teaching_assistant"]))
  );
}

export function canImportBasicMedicalSchedules(
  roles: AppRole[],
  roomTypeCodes: string[],
  canImportSchedules: boolean,
) {
  return (
    roles.includes("admin") ||
    (canImportSchedules &&
      roomTypeCodes.includes(basicMedicalRoomTypeCode) &&
      hasAnyRole(roles, ["staff", "lecturer", "teaching_assistant"]))
  );
}

export function defaultWorkspacePath(
  roles: AppRole[],
  roomTypeCodes: string[],
) {
  return !canUseSkillsWorkspace(roles, roomTypeCodes) &&
    canViewBasicMedicalSchedules(roles, roomTypeCodes)
    ? "/basic-medical/schedules"
    : "/dashboard";
}
