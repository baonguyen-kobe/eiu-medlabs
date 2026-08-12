export type BasicMedicalEquipmentCatalogItem = {
  id: string;
  item_name: string;
  commercial_name: string | null;
  item_type: string | null;
  country_of_origin: string | null;
  manufacturer: string | null;
  model: string | null;
  unit: string;
  is_active: boolean;
};

export type BasicMedicalRoomInventoryItem = {
  id: string;
  room_id: string;
  catalog_item_id: string;
  total_quantity: number;
  good_quantity: number;
  damaged_quantity: number;
  is_active: boolean;
  last_damage_reported_at: string | null;
  room: {
    id: string;
    room_code: string;
    building_code: string;
    room_name: string | null;
  } | null;
  catalog: BasicMedicalEquipmentCatalogItem | null;
  last_damage_reporter: { full_name: string } | null;
};

export type BasicMedicalSessionConfirmation = {
  id: string;
  signer_id: string;
  signed_at: string;
  invalidated_at: string | null;
  signer: { full_name: string } | null;
};

export type BasicMedicalConfirmationEquipmentEvidence = {
  inventory_id: string;
  item_name_snapshot: string;
  commercial_name_snapshot: string | null;
  unit_snapshot: string;
  total_before: number;
  good_before: number;
  damaged_before: number;
  newly_damaged_quantity: number;
  total_after: number;
  good_after: number;
  damaged_after: number;
};

export type BasicMedicalConfirmationEvidence = {
  confirmation_id: string;
  registration_id_snapshot: string;
  class_schedule_id_snapshot: string;
  signer_id: string;
  signature_data: string;
  schedule_date_snapshot: string;
  start_time_snapshot: string;
  end_time_snapshot: string;
  room_id_snapshot: string;
  teaching_lecturer_id_snapshot: string;
  signed_at: string;
  invalidated_at: string | null;
  invalidated_reason: string | null;
  equipment_checks: BasicMedicalConfirmationEquipmentEvidence[];
};

export type BasicMedicalRegistrationSessionItem = {
  id: string;
  session_number: number;
  lesson_title: string;
  teaching_lecturer_id: string;
  teaching: { full_name: string } | null;
  class_schedules: {
    schedule_date: string;
    start_time: string;
    end_time: string;
  } | null;
  confirmations: BasicMedicalSessionConfirmation[];
};

export type BasicMedicalRegistrationListItem = {
  id: string;
  registration_code: string;
  created_at: string;
  academic_year: string;
  semester: string;
  start_date: string;
  end_date: string;
  student_count: number;
  note: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancel_reason?: string | null;
  courses: { course_code: string; course_name: string } | null;
  rooms: {
    id: string;
    room_code: string;
    building_code: string;
    room_name: string | null;
  } | null;
  registrant: { full_name: string } | null;
  responsible: { full_name: string } | null;
  basic_medical_registration_sessions: BasicMedicalRegistrationSessionItem[];
};

export type BasicMedicalConditionLogItem = {
  id: string;
  event_type: "damage_report" | "condition_adjustment" | "stock_adjustment";
  total_before: number;
  good_before: number;
  damaged_before: number;
  total_after: number;
  good_after: number;
  damaged_after: number;
  quantity_delta: number;
  note: string | null;
  created_at: string;
  inventory: {
    room: {
      room_code: string;
      building_code: string;
      room_name: string | null;
    } | null;
    catalog: {
      item_name: string;
      commercial_name: string | null;
      unit: string;
    } | null;
  } | null;
  actor: { full_name: string } | null;
};

export function activeSessionConfirmation(
  session: BasicMedicalRegistrationSessionItem,
) {
  return session.confirmations.find(
    (confirmation) => confirmation.invalidated_at === null,
  );
}

export function isBasicMedicalRegistrationCompleted(
  registration: BasicMedicalRegistrationListItem,
) {
  const sessions = registration.basic_medical_registration_sessions;
  return (
    sessions.length > 0 &&
    sessions.every((session) => activeSessionConfirmation(session))
  );
}

export function basicMedicalDamageEmailSubject(
  roomCode: string,
  roomName?: string | null,
) {
  const roomTitle = [roomCode.trim(), roomName?.trim()]
    .filter(Boolean)
    .join(" ");
  return `[MedLabs Calendar] Thiết bị phòng ${roomTitle} được báo Hư`;
}
