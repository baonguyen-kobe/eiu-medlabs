import path from "node:path";
import PDFDocument from "pdfkit";
import type { BasicMedicalConfirmationEvidence } from "@/lib/basic-medical-equipment";

const regularFontPath = path.join(
  process.cwd(),
  "node_modules",
  "@expo-google-fonts",
  "be-vietnam-pro",
  "400Regular",
  "BeVietnamPro_400Regular.ttf",
);
const boldFontPath = path.join(
  process.cwd(),
  "node_modules",
  "@expo-google-fonts",
  "be-vietnam-pro",
  "700Bold",
  "BeVietnamPro_700Bold.ttf",
);
const logoPath = path.join(process.cwd(), "public", "eiu-full-logo.jpg");
const left = 40;
const width = 515;
const contentBottom = 780;
const pageFooterY = 812;

function value(input: unknown, fallback = "—") {
  const normalized = String(input ?? "").trim();
  return normalized || fallback;
}

function legacyValue(input: string | null) {
  return input?.trim() || "Không có snapshot tên hiển thị cho bản ghi cũ.";
}

function signatureBuffer(data: string) {
  if (!data.startsWith("data:image/png;base64,")) return null;
  try {
    const result = Buffer.from(data.slice(data.indexOf(",") + 1), "base64");
    return result.length ? result : null;
  } catch {
    return null;
  }
}

function drawPageHeader(doc: PDFKit.PDFDocument, compact = false) {
  doc.image(logoPath, left, 20, { fit: compact ? [84, 26] : [112, 34] });
  doc
    .font("Bold")
    .fontSize(compact ? 10 : 14)
    .fillColor("#153f6d")
    .text("BẰNG CHỨNG XÁC NHẬN Y CƠ SỞ", left + (compact ? 94 : 126), 27, {
      width: width - (compact ? 94 : 126),
      align: "right",
    });
  doc
    .moveTo(left, 59)
    .lineTo(left + width, 59)
    .strokeColor("#ad8b55")
    .stroke();
  return 72;
}

function newContentPage(doc: PDFKit.PDFDocument) {
  doc.addPage();
  return drawPageHeader(doc, true);
}

function ensureSpace(doc: PDFKit.PDFDocument, y: number, height: number) {
  return y + height <= contentBottom ? y : newContentPage(doc);
}

function fieldHeight(doc: PDFKit.PDFDocument, label: string, content: string) {
  doc.font("Regular").fontSize(8.5);
  return (
    Math.max(
      doc.heightOfString(label, { width: 130 }),
      doc.heightOfString(content, { width: width - 132 }),
    ) + 7
  );
}

function field(
  doc: PDFKit.PDFDocument,
  label: string,
  content: string,
  y: number,
) {
  const height = fieldHeight(doc, label, content);
  const nextY = ensureSpace(doc, y, height);
  doc.font("Bold").fontSize(8).fillColor("#153f6d").text(label, left, nextY, {
    width: 130,
  });
  doc
    .font("Regular")
    .fontSize(8.5)
    .fillColor("#111827")
    .text(content, left + 132, nextY, { width: width - 132 });
  return nextY + height;
}

function section(doc: PDFKit.PDFDocument, y: number, title: string) {
  const nextY = ensureSpace(doc, y, 29);
  doc.roundedRect(left, nextY, width, 21, 3).fill("#e9f0f7");
  doc
    .font("Bold")
    .fontSize(10)
    .fillColor("#153f6d")
    .text(title, left + 8, nextY + 6, { width: width - 16 });
  return nextY + 28;
}

function drawEquipmentHeader(doc: PDFKit.PDFDocument, y: number) {
  const headers = ["Thiết bị", "ĐVT", "Trước", "Hư mới", "Sau"];
  const columns = [190, 55, 95, 60, 95];
  let x = left;
  headers.forEach((header, index) => {
    doc.rect(x, y, columns[index], 22).fill("#153f6d");
    doc
      .font("Bold")
      .fontSize(7)
      .fillColor("#fff")
      .text(header, x + 4, y + 7, {
        width: columns[index] - 8,
        align: "center",
      });
    x += columns[index];
  });
  return { columns, y: y + 22 };
}

function formatSignedAt(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

export async function createBasicMedicalEvidencePdf(
  evidence: BasicMedicalConfirmationEvidence,
) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    bufferPages: true,
  });
  doc.registerFont("Regular", regularFontPath);
  doc.registerFont("Bold", boldFontPath);
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  let y = drawPageHeader(doc);
  y = section(doc, y, "I. THÔNG TIN BUỔI HỌC");
  y = field(
    doc,
    "Môn học",
    `${legacyValue(evidence.course_code_snapshot)} · ${legacyValue(evidence.course_name_snapshot)}`,
    y,
  );
  y = field(
    doc,
    "Ngày / giờ",
    `${value(evidence.schedule_date_snapshot)} · ${value(evidence.start_time_snapshot).slice(0, 5)}–${value(evidence.end_time_snapshot).slice(0, 5)}`,
    y,
  );
  y = field(
    doc,
    "Phòng học",
    [
      evidence.building_code_snapshot,
      evidence.room_code_snapshot,
      evidence.room_name_snapshot,
    ]
      .filter((part): part is string => Boolean(part?.trim()))
      .join(" · ") || legacyValue(null),
    y,
  );
  y = field(
    doc,
    "Giảng viên giảng dạy",
    legacyValue(evidence.teaching_lecturer_name_snapshot),
    y,
  );

  y = section(doc, y + 8, "II. THÔNG TIN XÁC NHẬN");
  y = field(
    doc,
    "Người xác nhận",
    legacyValue(evidence.signer_name_snapshot),
    y,
  );
  y = field(doc, "Thời điểm ký", formatSignedAt(evidence.signed_at), y);
  y = field(
    doc,
    "Trạng thái",
    evidence.invalidated_at
      ? `Đã vô hiệu · ${value(evidence.invalidated_reason)}`
      : "Đang có hiệu lực",
    y,
  );

  y = section(doc, y + 8, "III. CHỮ KÝ ĐIỆN TỬ");
  y = ensureSpace(doc, y, 92);
  const signature = signatureBuffer(evidence.signature_data);
  if (signature) doc.image(signature, left + 10, y, { fit: [250, 80] });
  else
    doc
      .font("Regular")
      .fontSize(8)
      .fillColor("#64748b")
      .text("Chữ ký được lưu nhưng không thể hiển thị.", left + 10, y + 12);
  y += 92;

  y = section(doc, y, "IV. TÌNH TRẠNG THIẾT BỊ ĐÃ CHỤP");
  let table = drawEquipmentHeader(doc, ensureSpace(doc, y, 52));
  y = table.y;
  if (!evidence.equipment_checks.length) {
    y = ensureSpace(doc, y, 28);
    doc
      .font("Regular")
      .fontSize(8)
      .fillColor("#111827")
      .text("Không có dòng điều kiện thiết bị được lưu.", left + 5, y + 10);
    y += 28;
  }

  evidence.equipment_checks.forEach((check) => {
    const equipmentName = `${value(check.item_name_snapshot)}${check.commercial_name_snapshot ? `\n${check.commercial_name_snapshot}` : ""}`;
    const values = [
      equipmentName,
      value(check.unit_snapshot),
      `${check.good_before}/${check.damaged_before}/${check.total_before}`,
      String(check.newly_damaged_quantity),
      `${check.good_after}/${check.damaged_after}/${check.total_after}`,
    ];
    const height = Math.max(
      30,
      doc
        .font("Regular")
        .fontSize(8)
        .heightOfString(equipmentName, {
          width: table.columns[0] - 8,
        }) + 10,
    );
    if (y + height > contentBottom) {
      y = newContentPage(doc);
      table = drawEquipmentHeader(doc, y);
      y = table.y;
    }
    let x = left;
    values.forEach((cell, index) => {
      doc
        .rect(x, y, table.columns[index], height)
        .lineWidth(0.4)
        .strokeColor("#718096")
        .stroke();
      doc
        .font("Regular")
        .fontSize(7.5)
        .fillColor("#111827")
        .text(cell, x + 4, y + 5, {
          width: table.columns[index] - 8,
          align: index > 0 ? "center" : "left",
        });
      x += table.columns[index];
    });
    y += height;
  });

  y = section(doc, y + 12, "V. THÔNG TIN KỸ THUẬT");
  y = field(doc, "Confirmation ID", evidence.confirmation_id, y);
  y = field(doc, "Registration ID", evidence.registration_id_snapshot, y);
  y = field(doc, "Schedule ID", evidence.class_schedule_id_snapshot, y);
  y = field(doc, "Room ID", evidence.room_id_snapshot, y);
  y = field(doc, "Lecturer ID", evidence.teaching_lecturer_id_snapshot, y);
  field(doc, "Signer ID", evidence.signer_id, y);

  const pages = doc.bufferedPageRange();
  for (let index = pages.start; index < pages.start + pages.count; index += 1) {
    doc.switchToPage(index);
    doc
      .font("Regular")
      .fontSize(7)
      .fillColor("#64748b")
      .text(
        `Bằng chứng xác nhận Y cơ sở · Trang ${index + 1}/${pages.count}`,
        left,
        pageFooterY,
        { width },
      );
  }
  doc.end();
  return done;
}
