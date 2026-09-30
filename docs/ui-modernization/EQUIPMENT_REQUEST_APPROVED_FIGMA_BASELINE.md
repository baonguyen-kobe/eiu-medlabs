# Equipment Request Approved Figma Baseline

Last updated: 2026-09-30

This document records the Figma artifacts explicitly approved by the business owner for the Equipment Request / Handover redesign. These are no longer merely exploratory proposals.

Read this document together with `docs/ui-modernization/EQUIPMENT_REQUEST_WORKFLOW_HANDOFF.md`.

## 1. Approved workflow design chain

The following sequence is approved as the canonical workflow design baseline in the Figma file **MedLabs — Equipment Handover & Adjustment Flow**:

Figma: https://www.figma.com/design/xfaJx1sRn1bgMl5qfCPr1h

Page: `Equipment Handover Flow`

Approved sequence:

1. `10:2` — `REFERENCE · Existing equipment modal`
2. `10:160` — `EDITABLE · Admin / Mới → Đã soạn`
3. `10:318` — `EDITABLE · User/TA / Điều chỉnh số lượng giao`
4. `10:476` — `EDITABLE · Admin / Duyệt điều chỉnh`
5. `24:16` — `EDITABLE · Admin / Đã soạn → Đã giao`
6. `24:345` — `EDITABLE · Admin / Xác nhận Đã trả`
7. `25:2` — `EDITABLE · Admin / Trả thiếu`
8. `25:287` — `EDITABLE · Hoàn thành / Danh sách thiết bị`
9. `32:2` — `EDITABLE · Admin / Trả thiếu · Bỏ Thu hồi`

These frames encode the approved workflow terminology, quantity semantics, table columns, recovery behavior, and handover/return direction described in the workflow handoff.

Do not replace this sequence with older source-layout frames or earlier abandoned mockups unless the business owner explicitly changes direction.

## 2. Approved desktop page proposals

The following two desktop page designs are approved as the visual baseline for the redesigned request pages:

- `43:2` — `PROPOSAL v2 · Admin/Staff · Phiếu thiết bị`
- `43:356` — `PROPOSAL v2 · User/TA · Phiếu thiết bị của tôi`

These two `PROPOSAL v2` frames are approved despite retaining the word `PROPOSAL` in their Figma names.

Interpretation for future agents:

- Treat the **current state of these two Figma frames** as the approved desktop visual baseline.
- The user may directly edit these frames in Figma; therefore inspect the live/current frame before implementation and do not restore removed elements from an older screenshot or chat summary.
- `SOURCE · ...` frames remain comparison references only and do not override the approved `PROPOSAL v2` desktop direction.

## 3. Responsive status

The iPad/phone proposal frames are **not yet approved as final baseline** at the time of this record.

They are undergoing one additional polish/alignment pass for gutters, filters, action grouping, confirmation layout, card placement, and cross-breakpoint consistency.

Responsive proposal frames currently under review:

- `53:2` — `PROPOSAL · iPad 1024 · Admin/Staff · Phiếu thiết bị`
- `53:141` — `PROPOSAL · iPad 1024 · User/TA · Phiếu thiết bị của tôi`
- `53:242` — `PROPOSAL · Phone 390 · Admin/Staff · Phiếu thiết bị`
- `53:363` — `PROPOSAL · Phone 390 · User/TA · Phiếu thiết bị của tôi`

Do not infer final responsive acceptance until the business owner explicitly approves the polished responsive set.

## 4. Implementation handoff rule

When implementation begins, a new agent/chat must use both:

1. `EQUIPMENT_REQUEST_WORKFLOW_HANDOFF.md` for business/workflow/data/UI rules; and
2. this file for which Figma artifacts are approved versus still under review.

If Figma and an old screenshot/chat summary differ, inspect the current Figma frames and follow the latest explicit user decision.
