export const NURSING_SKILLS_ROOM_TYPE_ID =
  "40000000-0000-0000-0000-000000000001";
export const BASIC_MEDICAL_ROOM_TYPE_ID =
  "40000000-0000-0000-0000-000000000002";

export const NURSING_SKILLS_ROOM_TYPE_CODE = "nursing_skills";
export const BASIC_MEDICAL_ROOM_TYPE_CODE = "basic_medical";

export type RoomTypeScope = {
  id: string;
  code: string;
  name: string;
};

export type ScheduleScope = "skills_lab" | "basic_medical";

export function roomTypeIdForScope(scope: ScheduleScope) {
  return scope === "basic_medical"
    ? BASIC_MEDICAL_ROOM_TYPE_ID
    : NURSING_SKILLS_ROOM_TYPE_ID;
}
