"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { UploadCloud } from "@/components/icons";

type Row = {
  item_name: string;
  commercial_name: string;
  item_type: string | null;
  country_of_origin: string | null;
  manufacturer: string | null;
  model: string | null;
  unit: string;
};

type Preview = {
  updated: number;
  reactivated: number;
  inserted: number;
  deactivated: number;
  deleted: number;
  fingerprint: string;
};

const normalize = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "")
    .trim();

const text = (value: unknown) => String(value ?? "").trim() || null;
const maxFileBytes = 10 * 1024 * 1024;
const maxRows = 5_000;
const rowCountErrorMessage = "File phải có từ 1 đến 5000 dòng dữ liệu.";
const requiredFieldsErrorMessage =
  "Mỗi dòng cần có Tên thiết bị, Tên thương mại và ĐVT.";
const genericImportErrorMessage = "Không thể đọc file import.";

function localParserErrorMessage(error: unknown) {
  if (
    error instanceof Error &&
    [rowCountErrorMessage, requiredFieldsErrorMessage].includes(error.message)
  ) {
    return error.message;
  }
  return genericImportErrorMessage;
}

export function CatalogReconciliationImport({
  preview,
  apply,
}: {
  preview: (rows: Row[]) => Promise<Preview>;
  apply: (
    rows: Row[],
    fingerprint: string,
  ) => Promise<{
    ok: boolean;
    message: string;
  }>;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [plan, setPlan] = useState<Preview | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function readFile(file: File | null) {
    if (!file) {
      setNotice("Vui lòng chọn file CSV hoặc XLSX.");
      return;
    }
    if (!/\.(csv|xlsx)$/i.test(file.name)) {
      setNotice("Chỉ hỗ trợ file CSV hoặc XLSX.");
      return;
    }
    if (file.size > maxFileBytes) {
      setNotice("File đối soát không được lớn hơn 10 MB.");
      return;
    }

    try {
      const XLSX = await import("@e965/xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = /\.csv$/i.test(file.name)
        ? XLSX.read(new TextDecoder().decode(buffer), { type: "string" })
        : XLSX.read(buffer, { type: "array" });
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        workbook.Sheets[workbook.SheetNames[0]],
        { defval: "", raw: false },
      );
      if (!raw.length || raw.length > maxRows) {
        throw new Error(rowCountErrorMessage);
      }
      const parsed = raw.map((source) => {
        const fields = new Map(
          Object.entries(source).map(([key, value]) => [
            normalize(key),
            text(value),
          ]),
        );
        const pick = (...keys: string[]) =>
          keys.map((key) => fields.get(key)).find(Boolean) ?? null;
        const item_name = pick("tenthietbivavattu", "tenthietbi", "itemname");
        const commercial_name = pick("tenthuongmai", "commercialname");
        const unit = pick("dvt", "donvitinh", "unit");
        if (!item_name || !commercial_name || !unit) {
          throw new Error(requiredFieldsErrorMessage);
        }
        return {
          item_name,
          commercial_name,
          unit,
          item_type: pick("loai", "itemtype"),
          country_of_origin: pick("nuocsx", "nuocsanxuat", "countryoforigin"),
          manufacturer: pick("hang", "hangsanxuat", "manufacturer"),
          model: pick("model"),
        };
      });
      setRows(parsed);
      setPlan(null);
      setNotice(`${parsed.length} dòng đã sẵn sàng để preview.`);
    } catch (error) {
      setRows(null);
      setPlan(null);
      setNotice(localParserErrorMessage(error));
    }
  }

  return (
    <div className="equipment-import-actions">
      <label className="button equipment-import-all">
        <UploadCloud size={17} /> Chọn file đối soát
        <input
          className="sr-only"
          type="file"
          accept=".csv,.xlsx"
          onChange={(event) => void readFile(event.target.files?.[0] ?? null)}
        />
      </label>
      <button
        className="button equipment-import-all"
        type="button"
        disabled={!rows || pending}
        onClick={() =>
          rows &&
          startTransition(async () => {
            try {
              setPlan(await preview(rows));
              setNotice(null);
            } catch {
              setNotice("Không thể preview file.");
            }
          })
        }
      >
        Preview đối soát
      </button>
      {notice ? <span className="field-note">{notice}</span> : null}
      <ConfirmDialog
        open={Boolean(plan)}
        title="Áp dụng đối soát danh mục?"
        description={
          plan
            ? `${plan.updated} cập nhật · ${plan.inserted} thêm mới · ${plan.reactivated} kích hoạt lại · ${plan.deactivated} ngừng sử dụng · ${plan.deleted} xóa vĩnh viễn.`
            : ""
        }
        confirmLabel="Áp dụng"
        pending={pending}
        onCancel={() => setPlan(null)}
        onConfirm={() =>
          rows &&
          plan &&
          startTransition(async () => {
            try {
              const result = await apply(rows, plan.fingerprint);
              setNotice(result.message);
              if (result.ok) {
                setPlan(null);
                setRows(null);
                router.refresh();
              }
            } catch {
              setNotice("Không thể áp dụng đối soát danh mục.");
            }
          })
        }
      />
    </div>
  );
}
