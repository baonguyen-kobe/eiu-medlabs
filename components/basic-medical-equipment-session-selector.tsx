"use client";

import { useRouter } from "next/navigation";
import { SearchableCombobox } from "@/components/searchable-combobox";

export type BasicMedicalEquipmentSessionOption = {
  value: string;
  label: string;
  keywords: string;
};

export function BasicMedicalEquipmentSessionSelector({
  sessions,
  mode,
  requestKey,
}: {
  sessions: BasicMedicalEquipmentSessionOption[];
  mode?: "copy";
  requestKey?: string;
}) {
  const router = useRouter();
  return (
    <section className="data-panel">
      <label>
        Buổi học Y cơ sở *
        <SearchableCombobox
          value=""
          options={sessions}
          onChange={(sessionId) => {
            if (!sessionId) return;
            const query = new URLSearchParams({ session: sessionId });
            if (mode) query.set("mode", mode);
            if (requestKey) query.set("request", requestKey);
            router.push(`/basic-medical/equipment-requests?${query}`);
          }}
          required
          ariaLabel="Buổi học Y cơ sở"
          placeholder="Tìm ngày, môn học, buổi học hoặc phòng…"
        />
      </label>
      {!sessions.length ? (
        <p className="panel-empty">
          Không có buổi học Y cơ sở đang hoạt động để đăng ký thiết bị.
        </p>
      ) : null}
    </section>
  );
}
