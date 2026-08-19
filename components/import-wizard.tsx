"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  FileSpreadsheet,
  UploadCloud,
  X,
} from "@/components/icons";
import { useMemo, useState, useTransition } from "react";
import Papa from "papaparse";
import Link from "next/link";
import {
  importScheduleRows,
  validateScheduleRows,
  type ImportResult,
  type ImportValidationResult,
} from "@/app/schedule-entry/import/actions";
import {
  importHeaderLabels,
  importHeaders,
  type ImportHeader,
} from "@/lib/import-template";
import {
  formatImportDate,
  getImportFormatIssues,
  normalizeImportRowValues,
  normalizeImportTime,
} from "@/lib/import-values";
import { PaginationControls } from "@/components/pagination-controls";
import { TABLE_PAGE_SIZE, totalPagesFor } from "@/lib/pagination";
import { CANONICAL_SEMESTERS, isCanonicalSemester } from "@/lib/semesters";

type Row = Record<string, unknown>;
type ValidationRow = ImportValidationResult["rows"][number];

const visibleHeaders = importHeaders.slice(0, 9);
const optionalSkillsLabHeaders = new Set<ImportHeader>([
  "lecturer_email",
  "note",
]);

function displayImportValue(row: Row, header: ImportHeader) {
  if (header === "schedule_date") return formatImportDate(row[header]) || "—";
  if (header === "start_time" || header === "end_time") {
    return (
      normalizeImportTime(row[header]) ?? (String(row[header] ?? "") || "—")
    );
  }
  return String(row[header] ?? "").trim() || "—";
}

function validationMessage(review: ValidationRow) {
  const messages = [...review.errors, ...review.warnings];
  if (messages.length) return messages.join("; ");
  return "Hợp lệ";
}

function statusLabel(status: ValidationRow["status"]) {
  if (status === "duplicate") return "Trùng";
  if (status === "conflict") return "Xung đột";
  if (status === "error") return "Cần sửa";
  if (status === "warning") return "Hợp lệ, có lưu ý";
  return "Hợp lệ";
}

function ImportRowsTable({
  rows,
  validationByRow,
  includedIndexes,
  showValidation = false,
}: {
  rows: Row[];
  validationByRow?: Map<number, ValidationRow>;
  includedIndexes?: number[];
  showValidation?: boolean;
}) {
  const indexes = includedIndexes ?? rows.map((_, index) => index);
  const [currentPage, setCurrentPage] = useState(1);
  const safePage = Math.min(
    currentPage,
    totalPagesFor(indexes.length, TABLE_PAGE_SIZE),
  );
  const pageIndexes = indexes.slice(
    (safePage - 1) * TABLE_PAGE_SIZE,
    safePage * TABLE_PAGE_SIZE,
  );

  return (
    <div>
      <div
        className="preview-table-wrap"
        role="region"
        aria-label="Dữ liệu import; vuốt ngang để xem đầy đủ"
        tabIndex={0}
      >
        <table className="preview-table">
          <thead>
            <tr>
              <th>Dòng</th>
              {visibleHeaders.map((header) => (
                <th key={header}>{importHeaderLabels[header]}</th>
              ))}
              {showValidation ? <th>Kiểm tra</th> : null}
            </tr>
          </thead>
          <tbody>
            {pageIndexes.map((index) => {
              const rowNumber = index + 2;
              const review = validationByRow?.get(rowNumber);
              const rowInvalid =
                review?.status === "error" ||
                review?.status === "duplicate" ||
                review?.status === "conflict";
              return (
                <tr className={rowInvalid ? "row-error" : ""} key={index}>
                  <td>{rowNumber}</td>
                  {visibleHeaders.map((header) => (
                    <td key={header}>
                      {displayImportValue(rows[index], header)}
                    </td>
                  ))}
                  {showValidation ? (
                    <td className="preview-status-cell">
                      {review ? (
                        <>
                          <span
                            className={`preview-status preview-status-${review.status}`}
                          >
                            {statusLabel(review.status)}
                          </span>
                          <small>{validationMessage(review)}</small>
                        </>
                      ) : (
                        "Chưa có kết quả"
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <PaginationControls
        currentPage={safePage}
        totalItems={indexes.length}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}

export function ImportWizard({
  embedded = false,
  scope = "skills_lab",
}: {
  embedded?: boolean;
  scope?: "skills_lab" | "basic_medical";
}) {
  const [semester, setSemester] = useState("");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [step, setStep] = useState(1);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [validation, setValidation] = useState<ImportValidationResult | null>(
    null,
  );
  const [dragActive, setDragActive] = useState(false);
  const [pending, startTransition] = useTransition();

  async function readFile(file: File) {
    setError("");
    setResult(null);
    setValidation(null);
    if (
      scope === "skills_lab" &&
      (!semester || !isCanonicalSemester(semester))
    ) {
      setError("Vui lòng chọn Học kỳ trước khi chọn file import.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("File vượt quá giới hạn 5 MB.");
      return;
    }
    if (!/\.(csv|xlsx)$/i.test(file.name)) {
      setError("Chỉ hỗ trợ file CSV UTF-8 hoặc XLSX.");
      return;
    }
    setFileName(file.name);

    try {
      let parsedRows: Row[];
      if (file.name.toLowerCase().endsWith(".csv")) {
        const text = await file.text();
        const parsed = Papa.parse<Row>(text, {
          header: true,
          skipEmptyLines: true,
        });
        if (parsed.errors.length > 0) throw new Error(parsed.errors[0].message);
        parsedRows = parsed.data;
      } else {
        const XLSX = await import("@e965/xlsx");
        const workbook = XLSX.read(await file.arrayBuffer(), {
          type: "array",
          cellDates: true,
        });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        parsedRows = XLSX.utils.sheet_to_json<Row>(firstSheet, {
          defval: "",
          raw: true,
        });
      }
      if (parsedRows.length > 500) {
        setRows([]);
        setError(
          `File có ${parsedRows.length} dòng, vượt giới hạn 500 dòng mỗi lần import. Vui lòng chia file thành nhiều phần.`,
        );
        return;
      }
      setRows(parsedRows.map(normalizeImportRowValues));
      setStep(2);
    } catch {
      setRows([]);
      setError(
        "Không thể đọc file. Hãy tải lại template và kiểm tra định dạng.",
      );
    }
  }

  const requiredHeaders =
    scope === "skills_lab"
      ? importHeaders.filter((header) => !optionalSkillsLabHeaders.has(header))
      : importHeaders;
  const missingHeaders = requiredHeaders.filter(
    (header) => rows[0] && !(header in rows[0]),
  );
  const localReviews = useMemo(
    () => rows.map((row) => getImportFormatIssues(row)),
    [rows],
  );
  const preliminaryInvalidRows = localReviews.filter(
    (issues) => issues.length > 0,
  ).length;
  const validationByRow = useMemo(
    () => new Map(validation?.rows.map((row) => [row.rowNumber, row]) ?? []),
    [validation],
  );
  const creatableIndexes = useMemo(
    () =>
      validation?.rows
        .filter(({ status }) => status === "valid" || status === "warning")
        .map(({ rowNumber }) => rowNumber - 2) ?? [],
    [validation],
  );

  function resetImport() {
    setRows([]);
    setFileName("");
    setResult(null);
    setValidation(null);
    setError("");
    setStep(1);
  }

  function runValidation() {
    setError("");
    startTransition(async () => {
      try {
        const validationResult = await validateScheduleRows(
          JSON.stringify(rows),
          scope,
          semester,
        );
        setValidation(validationResult);
        if (validationResult.ok) {
          setRows(validationResult.normalizedRows);
          setStep(3);
        } else setError(validationResult.message);
      } catch {
        setError("Không thể kiểm tra dữ liệu với máy chủ. Vui lòng thử lại.");
      }
    });
  }

  function completeImport() {
    setError("");
    startTransition(async () => {
      try {
        const importResult = await importScheduleRows(
          fileName,
          JSON.stringify(rows),
          scope,
          semester,
        );
        setResult(importResult);
        if (importResult.ok) setStep(5);
        else setError(importResult.message);
      } catch {
        setError(
          "Không thể kết nối tới máy chủ import. Dữ liệu chưa được gửi lại; vui lòng thử lại.",
        );
      }
    });
  }

  const canCreate = creatableIndexes.length > 0;

  return (
    <div className={`import-layout ${embedded ? "embedded" : ""}`}>
      {!embedded ? (
        <div className="import-heading">
          <div>
            <span className="eyebrow dark">Tạo phiếu hàng loạt</span>
            <h1>
              {scope === "basic_medical"
                ? "Import lịch Y cơ sở"
                : "Import lịch Skills lab"}
            </h1>
            <p>
              Tải template chuẩn, điền dữ liệu và kiểm tra từng dòng trước khi
              tạo lịch.
            </p>
          </div>
          <div className="template-actions">
            <Link
              className="button button-secondary"
              download
              href={`/api/import-template/csv?scope=${scope}`}
              prefetch={false}
            >
              <Download size={16} /> Template CSV
            </Link>
            <Link
              className="button button-primary"
              download
              href={`/api/import-template/xlsx?scope=${scope}`}
              prefetch={false}
            >
              <Download size={16} /> Template XLSX
            </Link>
          </div>
        </div>
      ) : null}

      <div className="import-stepper-bar">
        {scope === "skills_lab" ? (
          <div className="import-semester-control">
            <label htmlFor="import-semester-select">
              <span>Học kỳ</span> <span className="text-danger">*</span>
            </label>
            <select
              id="import-semester-select"
              name="semester"
              value={semester}
              onChange={(event) => {
                const val = event.target.value;
                setSemester(val);
                if (val) setError("");
              }}
              disabled={step > 1}
              className="import-semester-select"
            >
              <option value="">Chọn học kỳ</option>
              {CANONICAL_SEMESTERS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <ol className="stepper">
          {["Chọn file", "Xem trước", "Kiểm tra", "Xác nhận", "Kết quả"].map(
            (label, index) => (
              <li className={step >= index + 1 ? "active" : ""} key={label}>
                <span>
                  {step > index + 1 ? <Check size={14} /> : index + 1}
                </span>
                <b>{label}</b>
              </li>
            ),
          )}
        </ol>
      </div>

      {step === 1 ? (
        <section className="import-panel">
          <label
            className={`drop-zone ${dragActive ? "drag-active" : ""} ${scope === "skills_lab" && !semester ? "drop-zone-blocked" : ""}`}
            htmlFor={
              scope === "skills_lab" && !semester
                ? undefined
                : "schedule-import-file"
            }
            onClick={(event) => {
              if (
                scope === "skills_lab" &&
                (!semester || !isCanonicalSemester(semester))
              ) {
                event.preventDefault();
                setError("Vui lòng chọn Học kỳ trước khi chọn file import.");
              }
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              if (
                !event.currentTarget.contains(
                  event.relatedTarget as Node | null,
                )
              ) {
                setDragActive(false);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              if (
                scope === "skills_lab" &&
                (!semester || !isCanonicalSemester(semester))
              ) {
                setError("Vui lòng chọn Học kỳ trước khi chọn file import.");
                return;
              }
              const file = event.dataTransfer.files?.[0];
              if (file) void readFile(file);
            }}
          >
            <span>
              <UploadCloud size={28} />
            </span>
            <strong>Chọn hoặc kéo thả file vào đây</strong>
            <small>
              {scope === "skills_lab" && !semester
                ? "Vui lòng chọn Học kỳ ở phía trên trước khi tải file"
                : "Hỗ trợ CSV UTF-8 và XLSX, tối đa 5 MB"}
            </small>
          </label>
          <input
            id="schedule-import-file"
            hidden
            type="file"
            accept=".csv,.xlsx"
            onChange={(event) => {
              if (
                scope === "skills_lab" &&
                (!semester || !isCanonicalSemester(semester))
              ) {
                setError("Vui lòng chọn Học kỳ trước khi chọn file import.");
                event.currentTarget.value = "";
                return;
              }
              const file = event.currentTarget.files?.[0];
              if (file) void readFile(file);
            }}
          />
          {error ? (
            <p className="form-error" role="alert">
              <AlertTriangle size={15} /> {error}
            </p>
          ) : null}
        </section>
      ) : step === 5 && result ? (
        <section className="import-panel import-result">
          <span className="result-icon">
            <Check size={30} />
          </span>
          <h2>Import đã hoàn tất</h2>
          <p>{result.message}</p>
          <div className="import-stats">
            {scope === "skills_lab" && (result.semester || semester) ? (
              <article>
                <span>Học kỳ</span>
                <strong>{result.semester || semester}</strong>
              </article>
            ) : null}
            <article>
              <span>Tổng dòng</span>
              <strong>{result.totalRows}</strong>
            </article>
            <article>
              <span>Đã tạo lịch</span>
              <strong>{result.importedRows}</strong>
            </article>
            <article className="warning">
              <span>Cảnh báo</span>
              <strong>{result.warningRows}</strong>
            </article>
            <article className="danger">
              <span>Lỗi</span>
              <strong>{result.errorRows ?? 0}</strong>
            </article>
            <article>
              <span>Trùng</span>
              <strong>{result.duplicateRows ?? 0}</strong>
            </article>
            <article className="danger">
              <span>Xung đột</span>
              <strong>{result.conflictRows ?? 0}</strong>
            </article>
          </div>
          {result.issues?.length ? (
            <div className="import-issues" role="alert">
              <strong>Tổng hợp các dòng không được tạo hoặc có lưu ý</strong>
              <ul>
                {result.issues.slice(0, 12).map((issue) => (
                  <li key={`${issue.rowNumber}-${issue.errors.join("-")}`}>
                    <b>Dòng {issue.rowNumber}</b>
                    {issue.errors.length ? `: ${issue.errors.join("; ")}` : ""}
                    {issue.warnings.length
                      ? ` — ${issue.warnings.join("; ")}`
                      : ""}
                  </li>
                ))}
              </ul>
              {result.issues.length > 12 ? (
                <small>
                  Còn {result.issues.length - 12} dòng khác trong file lỗi tải
                  xuống.
                </small>
              ) : null}
            </div>
          ) : null}
          <small className="mono">Mã phiên: {result.batchId}</small>
          {typeof result.durationMs === "number" ? (
            <small className="import-duration">
              Thời gian xử lý:{" "}
              {(result.durationMs / 1000).toLocaleString("vi-VN", {
                maximumFractionDigits: 1,
              })}{" "}
              giây
            </small>
          ) : null}
          <div className="import-footer centered">
            {result.batchId &&
            (result.errorRows ?? 0) +
              (result.duplicateRows ?? 0) +
              (result.conflictRows ?? 0) >
              0 ? (
              <Link
                className="button button-secondary"
                href={`/api/import-errors/${result.batchId}`}
              >
                <Download size={16} /> Tải file lỗi / trùng / xung đột
              </Link>
            ) : null}
            <button className="button button-secondary" onClick={resetImport}>
              Import file khác
            </button>
            <Link
              className="button button-primary"
              href={
                scope === "basic_medical"
                  ? "/basic-medical/schedules"
                  : "/class-schedules"
              }
            >
              Xem lịch đã tạo <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      ) : (
        <section className="import-panel">
          <div className="file-summary">
            <span>
              <FileSpreadsheet size={22} />
            </span>
            <div>
              <strong>{fileName}</strong>
              <small>
                {scope === "skills_lab" && semester ? (
                  <span>
                    Học kỳ: <b>{semester}</b> ·{" "}
                  </span>
                ) : null}
                {step === 2
                  ? `${rows.length} dòng được đọc để xem trước`
                  : step === 3
                    ? `Đã kiểm tra ${rows.length} dòng`
                    : `${creatableIndexes.length} dòng sẽ được tạo lịch`}
              </small>
            </div>
            <button aria-label="Chọn file khác" onClick={resetImport}>
              <X size={17} />
            </button>
          </div>

          {step === 2 ? (
            <>
              <div className="import-stats">
                {scope === "skills_lab" && semester ? (
                  <article>
                    <span>Học kỳ</span>
                    <strong>{semester}</strong>
                  </article>
                ) : null}
                <article>
                  <span>Tổng dòng</span>
                  <strong>{rows.length}</strong>
                </article>
                <article>
                  <span>Đủ dữ liệu sơ bộ</span>
                  <strong>
                    {Math.max(0, rows.length - preliminaryInvalidRows)}
                  </strong>
                </article>
                <article className="warning">
                  <span>Cần bổ sung</span>
                  <strong>{preliminaryInvalidRows}</strong>
                </article>
                <article className={missingHeaders.length ? "danger" : ""}>
                  <span>Thiếu cột</span>
                  <strong>{missingHeaders.length}</strong>
                </article>
              </div>
              {missingHeaders.length ? (
                <p className="inline-warning">
                  <AlertTriangle size={16} /> File đang thiếu:{" "}
                  {missingHeaders
                    .map((header) => importHeaderLabels[header])
                    .join(", ")}
                  .
                </p>
              ) : null}
              <ImportRowsTable key="preview-table" rows={rows} />
            </>
          ) : null}

          {step === 3 && validation ? (
            <>
              <div className="import-stats">
                {scope === "skills_lab" && semester ? (
                  <article>
                    <span>Học kỳ</span>
                    <strong>{semester}</strong>
                  </article>
                ) : null}
                <article>
                  <span>Tổng dòng</span>
                  <strong>{validation.totalRows}</strong>
                </article>
                <article>
                  <span>Có thể tạo</span>
                  <strong>
                    {validation.validRows + validation.warningRows}
                  </strong>
                </article>
                <article className="danger">
                  <span>Cần sửa</span>
                  <strong>{validation.errorRows}</strong>
                </article>
                <article className="warning">
                  <span>Trùng, không tạo</span>
                  <strong>{validation.duplicateRows}</strong>
                </article>
                <article className="danger">
                  <span>Xung đột</span>
                  <strong>{validation.conflictRows}</strong>
                </article>
              </div>
              <p className="import-step-note">
                Kiểm tra từng dòng trong cột <b>Kiểm tra</b>. Bạn vẫn có thể
                tiếp tục; các dòng lỗi, trùng và xung đột sẽ bị loại ở bước xác
                nhận.
              </p>
              <ImportRowsTable
                key="validation-table"
                rows={rows}
                validationByRow={validationByRow}
                showValidation
              />
            </>
          ) : null}

          {step === 4 && validation ? (
            <>
              <div className="import-stats">
                {scope === "skills_lab" && semester ? (
                  <article>
                    <span>Học kỳ</span>
                    <strong>{semester}</strong>
                  </article>
                ) : null}
                <article>
                  <span>Tổng dòng ban đầu</span>
                  <strong>{validation.totalRows}</strong>
                </article>
                <article>
                  <span>Sẽ tạo lịch</span>
                  <strong>{creatableIndexes.length}</strong>
                </article>
                <article className="danger">
                  <span>Đã loại do lỗi</span>
                  <strong>{validation.errorRows}</strong>
                </article>
                <article className="warning">
                  <span>Đã loại do trùng</span>
                  <strong>{validation.duplicateRows}</strong>
                </article>
                <article className="danger">
                  <span>Đã loại do xung đột</span>
                  <strong>{validation.conflictRows}</strong>
                </article>
              </div>
              <p className="import-step-note">
                Danh sách dưới đây chỉ còn các dòng hợp lệ có thể tạo mới.
              </p>
              {canCreate ? (
                <ImportRowsTable
                  key="confirmation-table"
                  rows={rows}
                  includedIndexes={creatableIndexes}
                />
              ) : (
                <p className="inline-warning">
                  <AlertTriangle size={16} /> Không có dòng hợp lệ để tạo lịch.
                </p>
              )}
            </>
          ) : null}

          {error ? (
            <p className="form-error">
              <AlertTriangle size={15} /> {error}
            </p>
          ) : null}

          <div className="import-footer">
            <button
              className="button button-secondary"
              disabled={pending}
              onClick={() => setStep(Math.max(1, step - 1))}
            >
              <ArrowLeft size={16} /> Quay lại
            </button>
            <button
              className="button button-primary"
              disabled={
                pending ||
                missingHeaders.length > 0 ||
                rows.length === 0 ||
                (step === 4 && !canCreate)
              }
              onClick={() => {
                if (step === 2) runValidation();
                else if (step === 3) setStep(4);
                else completeImport();
              }}
            >
              {pending
                ? step === 2
                  ? "Đang kiểm tra…"
                  : "Đang tạo lịch…"
                : step === 4
                  ? "Tạo lịch"
                  : "Tiếp tục"}{" "}
              <ArrowRight size={16} />
            </button>
          </div>
          {pending ? (
            <p className="import-progress" role="status">
              {step === 2
                ? `Đang kiểm tra danh mục và dữ liệu trùng cho ${rows.length} dòng…`
                : `Đang tạo lịch cho ${creatableIndexes.length} dòng hợp lệ…`}
            </p>
          ) : null}
        </section>
      )}
    </div>
  );
}
