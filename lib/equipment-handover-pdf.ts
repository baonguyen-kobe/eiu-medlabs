import path from "node:path";
import { formatEquipmentRequestCode } from "@/lib/equipment-request-code";
import PDFDocument from "pdfkit";
import type { EquipmentRequestListItem } from "@/lib/equipment-requests";

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
const brandLogoPath = path.join(process.cwd(), "public", "eiu-full-logo.jpg");

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const LEFT = 40;
const RIGHT = 40;
const CONTENT_WIDTH = PAGE_WIDTH - LEFT - RIGHT;
const CONTENT_BOTTOM = PAGE_HEIGHT - 42;
const BLUE = "#153f6d";
const GOLD = "#ad8b55";
const LINE = "#718096";
const LIGHT_BLUE = "#e9f0f7";
const LIGHT_GOLD = "#f4efe6";
const TEXT = "#111827";

export type EquipmentHandoverRequest = EquipmentRequestListItem & {
  responsible: { full_name: string; email: string } | null;
  handover_staff: { full_name: string } | null;
  return_staff: { full_name: string } | null;
  handover_recipient_signature: string | null;
  return_recipient_signature: string | null;
};

type Item = EquipmentHandoverRequest["equipment_request_items"][number];

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function text(value: unknown, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function formatDate(value: string | Date) {
  return dateFormatter.format(new Date(value));
}

function formatTime(value: string | Date) {
  return timeFormatter.format(new Date(value));
}

function signatureBuffer(value: string | null) {
  if (!value?.startsWith("data:image/png;base64,")) return null;
  try {
    return Buffer.from(value.slice(value.indexOf(",") + 1), "base64");
  } catch {
    return null;
  }
}

function drawBrandHeader(
  doc: PDFKit.PDFDocument,
  title = "PHIẾU GIAO NHẬN THIẾT BỊ THỰC HÀNH",
) {
  doc.image(brandLogoPath, LEFT, 20, {
    fit: [112, 34],
  });
  doc
    .font("Bold")
    .fontSize(14)
    .fillColor(BLUE)
    .text(title, LEFT + 126, 25, {
      width: CONTENT_WIDTH - 126,
      align: "right",
    });
  doc
    .moveTo(LEFT, 58)
    .lineTo(PAGE_WIDTH - RIGHT, 58)
    .lineWidth(1)
    .strokeColor(GOLD)
    .stroke();
  return 70;
}

function drawSectionTitle(doc: PDFKit.PDFDocument, y: number, title: string) {
  doc.roundedRect(LEFT, y, CONTENT_WIDTH, 22, 3).fill(LIGHT_BLUE);
  doc
    .font("Bold")
    .fontSize(10)
    .fillColor(BLUE)
    .text(title, LEFT + 8, y + 6, {
      width: CONTENT_WIDTH - 16,
    });
  return y + 26;
}

function drawCell(
  doc: PDFKit.PDFDocument,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: {
    bold?: boolean;
    align?: "left" | "center" | "right";
    fill?: string;
    color?: string;
    fontSize?: number;
    padding?: number;
  } = {},
) {
  const padding = options.padding ?? 6;
  const fontName = options.bold ? "Bold" : "Regular";
  const fontSize = options.fontSize ?? 8.5;
  const lines = wrapLines(doc, value, width - padding * 2, fontName, fontSize);
  const lineHeight = fontSize * 1.28;
  const textHeight = lines.length * lineHeight;
  const textY = y + Math.max(padding, (height - textHeight) / 2);
  if (options.fill) doc.rect(x, y, width, height).fill(options.fill);
  doc.rect(x, y, width, height).lineWidth(0.55).strokeColor(LINE).stroke();
  doc
    .font(fontName)
    .fontSize(fontSize)
    .fillColor(options.color ?? TEXT);
  lines.forEach((line, index) => {
    doc.text(line, x + padding, textY + index * lineHeight, {
      width: width - padding * 2,
      align: options.align ?? "left",
      lineBreak: false,
    });
  });
}

function wrapLines(
  doc: PDFKit.PDFDocument,
  value: string,
  width: number,
  fontName: "Regular" | "Bold",
  fontSize: number,
) {
  doc.font(fontName).fontSize(fontSize);
  const lines: string[] = [];
  value.split(/\r?\n/).forEach((paragraph) => {
    let current = "";
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      return;
    }
    words.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word;
      if (!current || doc.widthOfString(candidate) <= width) {
        current = candidate;
        return;
      }
      lines.push(current);
      current = word;
    });
    if (current) lines.push(current);
  });
  return lines.length ? lines : [""];
}

function measuredTextHeight(
  doc: PDFKit.PDFDocument,
  value: string,
  width: number,
  fontName: "Regular" | "Bold",
  fontSize: number,
) {
  return (
    wrapLines(doc, value, width, fontName, fontSize).length * fontSize * 1.28
  );
}

function infoRowHeight(
  doc: PDFKit.PDFDocument,
  values: [string, string, string, string],
  widths: number[],
) {
  return Math.max(
    25,
    ...values.map((value, index) => {
      const fontName = index % 2 === 0 ? "Bold" : "Regular";
      return (
        measuredTextHeight(doc, value, widths[index] - 12, fontName, 8.5) + 12
      );
    }),
  );
}

function drawInformationTable(
  doc: PDFKit.PDFDocument,
  y: number,
  request: EquipmentHandoverRequest,
) {
  const schedule = request.class_schedules;
  const room = schedule?.rooms;
  const widths = [78, 172, 78, CONTENT_WIDTH - 328];
  const rows: Array<[string, string, string, string]> = [
    [
      "Họ tên",
      text(request.profiles?.full_name, "—"),
      "Email",
      text(request.email_snapshot, "—"),
    ],
    [
      "Mã phiếu",
      formatEquipmentRequestCode(request.created_at),
      "Số điện thoại",
      text(request.phone_snapshot, "—"),
    ],
    [
      "Ngày đăng ký",
      formatDate(request.created_at),
      "Số lượng SV",
      text(schedule?.student_count, "—"),
    ],
    [
      "Mã môn học",
      text(schedule?.course_code_snapshot, "—"),
      "Học kì",
      text(request.semester, "—"),
    ],
    [
      "Tên môn học",
      text(schedule?.course_name_snapshot, "—"),
      "Ngày học",
      schedule
        ? `${schedule.start_time.slice(0, 5)} - ${schedule.end_time.slice(0, 5)}, ${formatDate(`${schedule.schedule_date}T00:00:00+07:00`)}`
        : "—",
    ],
    [
      "Giảng viên",
      text(request.responsible?.full_name, "—"),
      "Phòng/Lab",
      room ? `${room.room_code}.${room.building_code}` : "—",
    ],
    [
      "Email",
      text(request.responsible?.email, "—"),
      "Loại Lab",
      "Kỹ năng Điều dưỡng",
    ],
  ];

  const subHeaderHeight = 21;
  drawCell(
    doc,
    "Thông tin người đăng ký",
    LEFT,
    y,
    CONTENT_WIDTH,
    subHeaderHeight,
    {
      bold: true,
      fill: LIGHT_GOLD,
      color: BLUE,
    },
  );
  y += subHeaderHeight;
  rows.slice(0, 3).forEach((row) => {
    const height = infoRowHeight(doc, row, widths);
    let x = LEFT;
    row.forEach((value, index) => {
      drawCell(doc, value, x, y, widths[index], height, {
        bold: index % 2 === 0,
        fill: index % 2 === 0 ? "#f8fafc" : undefined,
      });
      x += widths[index];
    });
    y += height;
  });
  drawCell(doc, "Thông tin môn học", LEFT, y, CONTENT_WIDTH, subHeaderHeight, {
    bold: true,
    fill: LIGHT_GOLD,
    color: BLUE,
  });
  y += subHeaderHeight;
  rows.slice(3).forEach((row) => {
    const height = infoRowHeight(doc, row, widths);
    let x = LEFT;
    row.forEach((value, index) => {
      drawCell(doc, value, x, y, widths[index], height, {
        bold: index % 2 === 0,
        fill: index % 2 === 0 ? "#f8fafc" : undefined,
      });
      x += widths[index];
    });
    y += height;
  });
  return y;
}

function groupItems(items: Item[]) {
  const groups = new Map<string, Item[]>();
  items.forEach((item) => {
    const skillName = text(item.skill_name, "Kỹ năng/Bài thực hành");
    const group = groups.get(skillName) ?? [];
    group.push(item);
    groups.set(skillName, group);
  });
  return [...groups.entries()];
}

const equipmentColumns = [28, 225, 47, 47, 48, CONTENT_WIDTH - 395];
const equipmentHeaders = [
  "STT",
  "Tên thiết bị",
  "SL giao",
  "SL trả",
  "ĐVT",
  "Ghi chú",
];

function drawEquipmentHeader(doc: PDFKit.PDFDocument, y: number) {
  let x = LEFT;
  equipmentHeaders.forEach((header, index) => {
    drawCell(doc, header, x, y, equipmentColumns[index], 30, {
      bold: true,
      align: "center",
      fill: BLUE,
      color: "#ffffff",
      fontSize: 8,
      padding: 5,
    });
    x += equipmentColumns[index];
  });
  return y + 30;
}

function itemRowHeight(doc: PDFKit.PDFDocument, item: Item) {
  const catalog = item.equipment_catalog;
  const values = [
    "1",
    text(catalog?.commercial_name || catalog?.item_name, "—"),
    String(item.quantity),
    "",
    text(catalog?.unit, "—"),
    text(item.note),
  ];
  return Math.max(
    28,
    ...values.map(
      (value, index) =>
        measuredTextHeight(
          doc,
          value,
          equipmentColumns[index] - 10,
          "Regular",
          8,
        ) + 12,
    ),
  );
}

function addContinuationPage(doc: PDFKit.PDFDocument, requestCode: string) {
  doc.addPage();
  let y = drawBrandHeader(doc);
  doc
    .font("Regular")
    .fontSize(8)
    .fillColor("#64748b")
    .text(`Mã phiếu: ${requestCode} - Danh mục thiết bị (tiếp theo)`, LEFT, y, {
      width: CONTENT_WIDTH,
      align: "right",
    });
  y += 18;
  return drawSectionTitle(doc, y, "II. DANH MỤC THIẾT BỊ");
}

function drawEquipmentGroups(
  doc: PDFKit.PDFDocument,
  y: number,
  request: EquipmentHandoverRequest,
) {
  const requestCode = formatEquipmentRequestCode(request.created_at);
  const groups = groupItems(request.equipment_request_items);
  if (!groups.length) {
    drawCell(doc, "Phiếu chưa có thiết bị.", LEFT, y, CONTENT_WIDTH, 30, {
      align: "center",
    });
    return y + 30;
  }

  groups.forEach(([skillName, items]) => {
    const titleHeight = Math.max(
      24,
      doc
        .font("Bold")
        .fontSize(8.5)
        .heightOfString(skillName.toUpperCase(), {
          width: CONTENT_WIDTH - 12,
        }) + 12,
    );
    if (y + titleHeight + 58 > CONTENT_BOTTOM)
      y = addContinuationPage(doc, requestCode);
    drawCell(
      doc,
      skillName.toUpperCase(),
      LEFT,
      y,
      CONTENT_WIDTH,
      titleHeight,
      {
        bold: true,
        fill: LIGHT_GOLD,
        color: BLUE,
      },
    );
    y += titleHeight;
    y = drawEquipmentHeader(doc, y);

    items.forEach((item, itemIndex) => {
      const height = itemRowHeight(doc, item);
      if (y + height > CONTENT_BOTTOM) {
        y = addContinuationPage(doc, requestCode);
        drawCell(
          doc,
          `${skillName.toUpperCase()} (tiếp theo)`,
          LEFT,
          y,
          CONTENT_WIDTH,
          titleHeight,
          {
            bold: true,
            fill: LIGHT_GOLD,
            color: BLUE,
          },
        );
        y += titleHeight;
        y = drawEquipmentHeader(doc, y);
      }
      const catalog = item.equipment_catalog;
      const values = [
        String(itemIndex + 1),
        text(catalog?.commercial_name || catalog?.item_name, "—"),
        String(item.quantity),
        "",
        text(catalog?.unit, "—"),
        text(item.note),
      ];
      let x = LEFT;
      values.forEach((value, index) => {
        drawCell(doc, value, x, y, equipmentColumns[index], height, {
          align: [0, 2, 3, 4].includes(index) ? "center" : "left",
          fontSize: 8,
          padding: 5,
        });
        x += equipmentColumns[index];
      });
      y += height;
    });
  });
  return y;
}

function drawSignatureBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  title: string,
  dateLabel: string,
  timeLabel: string,
  signatures?: {
    left?: Buffer | null;
    right?: Buffer | null;
    leftName?: string;
    rightName?: string;
    leftTypedNameOnly?: boolean;
    rightTypedNameOnly?: boolean;
  },
) {
  const height = 126;
  doc.rect(x, y, width, height).lineWidth(0.65).strokeColor(LINE).stroke();
  doc
    .font("Bold")
    .fontSize(9.5)
    .fillColor(BLUE)
    .text(title, x + 8, y + 8, {
      width: width - 16,
      align: "center",
    });
  doc
    .font("Regular")
    .fontSize(8)
    .fillColor(TEXT)
    .text(`Ngày: ${dateLabel}     Giờ: ${timeLabel}`, x + 8, y + 28, {
      width: width - 16,
      align: "center",
    });
  const half = (width - 16) / 2;
  doc
    .font("Bold")
    .fontSize(8)
    .text("Người bàn giao", x + 8, y + 50, {
      width: half,
      align: "center",
    });
  doc.text("Người nhận", x + 8 + half, y + 50, {
    width: half,
    align: "center",
  });
  doc.font("Regular").fontSize(7.5).fillColor("#64748b");
  doc.text(
    signatures?.leftTypedNameOnly ? "Họ và tên" : "Ký, ghi rõ họ tên",
    x + 8,
    y + 66,
    {
      width: half,
      align: "center",
    },
  );
  doc.text(
    signatures?.rightTypedNameOnly ? "Họ và tên" : "Ký, ghi rõ họ tên",
    x + 8 + half,
    y + 66,
    {
      width: half,
      align: "center",
    },
  );
  if (signatures?.left) {
    doc.image(signatures.left, x + 14, y + 75, {
      fit: [half - 12, 30],
      align: "center",
      valign: "center",
    });
  }
  if (signatures?.leftName) {
    doc
      .font("Regular")
      .fontSize(6.5)
      .fillColor(TEXT)
      .text(signatures.leftName, x + 8, y + 111, {
        width: half,
        align: "center",
      });
  }
  if (signatures?.right) {
    doc.image(signatures.right, x + 8 + half + 6, y + 75, {
      fit: [half - 12, 30],
      align: "center",
      valign: "center",
    });
  }
  if (signatures?.rightName) {
    doc
      .font("Regular")
      .fontSize(6.5)
      .fillColor(TEXT)
      .text(signatures.rightName, x + 8 + half, y + 111, {
        width: half,
        align: "center",
      });
  }
  doc
    .moveTo(x + 18, y + 108)
    .lineTo(x + half - 2, y + 108)
    .strokeColor(LINE)
    .stroke();
  doc
    .moveTo(x + half + 18, y + 108)
    .lineTo(x + width - 18, y + 108)
    .strokeColor(LINE)
    .stroke();
}

function drawSignatures(
  doc: PDFKit.PDFDocument,
  y: number,
  request: EquipmentHandoverRequest,
) {
  if (y + 154 > CONTENT_BOTTOM) {
    doc.addPage();
    y = drawBrandHeader(doc);
  }
  y += 12;
  const gap = 10;
  const width = (CONTENT_WIDTH - gap) / 2;
  const handoverAt = request.handover_effective_at ?? request.receive_at;
  const returnAt = request.return_effective_at ?? request.return_at;
  drawSignatureBox(
    doc,
    LEFT,
    y,
    width,
    "XÁC NHẬN GIAO DỤNG CỤ",
    formatDate(handoverAt),
    formatTime(handoverAt),
    {
      leftName: request.handover_staff?.full_name,
      leftTypedNameOnly: true,
      right: signatureBuffer(request.handover_recipient_signature),
      rightName: request.profiles?.full_name,
    },
  );
  drawSignatureBox(
    doc,
    LEFT + width + gap,
    y,
    width,
    "XÁC NHẬN TRẢ DỤNG CỤ",
    formatDate(returnAt),
    formatTime(returnAt),
    {
      left: signatureBuffer(request.return_recipient_signature),
      leftName: request.profiles?.full_name,
      rightName: request.return_staff?.full_name,
      rightTypedNameOnly: true,
    },
  );
}

function addFooters(doc: PDFKit.PDFDocument, requestCode: string) {
  const pages = doc.bufferedPageRange();
  for (let index = pages.start; index < pages.start + pages.count; index += 1) {
    doc.switchToPage(index);
    doc
      .moveTo(LEFT, PAGE_HEIGHT - 31)
      .lineTo(PAGE_WIDTH - RIGHT, PAGE_HEIGHT - 31)
      .lineWidth(0.45)
      .strokeColor("#cbd5e1")
      .stroke();
    doc
      .font("Regular")
      .fontSize(7)
      .fillColor("#64748b")
      .text(`Mã phiếu ${requestCode}`, LEFT, PAGE_HEIGHT - 24, {
        width: CONTENT_WIDTH / 2,
      });
    doc.text(
      `Trang ${index + 1}/${pages.count}`,
      LEFT + CONTENT_WIDTH / 2,
      PAGE_HEIGHT - 24,
      {
        width: CONTENT_WIDTH / 2,
        align: "right",
      },
    );
  }
}

export async function createEquipmentHandoverPdf(
  request: EquipmentHandoverRequest,
) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    bufferPages: true,
    info: {
      Title: `Phiếu giao nhận thiết bị ${formatEquipmentRequestCode(request.created_at)}`,
      Author: "MedLabs Calendar",
      Subject: "Phiếu giao nhận thiết bị thực hành",
    },
  });
  doc.registerFont("Regular", regularFontPath);
  doc.registerFont("Bold", boldFontPath);

  const chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  let y = drawBrandHeader(doc);
  y = drawSectionTitle(doc, y, "I. THÔNG TIN CHUNG");
  y = drawInformationTable(doc, y, request);
  y = drawSectionTitle(doc, y + 12, "II. DANH MỤC THIẾT BỊ");
  y = drawEquipmentGroups(doc, y, request);
  drawSignatures(doc, y, request);
  addFooters(doc, formatEquipmentRequestCode(request.created_at));
  doc.end();
  return completed;
}
