# Equipment Request Workflow and UI Handoff

Last updated: 2026-09-30

## 1. Purpose

This document is the durable handoff for the ongoing MedLabs equipment-request workflow and UI redesign.

It records the business-owner decisions accepted during the design review, the current source behavior that must be distinguished from the desired behavior, the Figma working references, and the implementation constraints that a future chat/agent must preserve.

This document is intentionally detailed so a new agent can resume the work without relying on prior chat history.

## 2. Authority and interpretation

Follow `docs/DOCUMENTATION_AUTHORITY.md`.

For this scope:

1. Explicit current user instruction remains highest priority.
2. Accepted business/security/product contracts remain authoritative.
3. This document records the currently accepted equipment-request product/UI direction and should be treated as a durable scoped decision/handoff unless explicitly superseded.
4. `docs/UI_DESIGN_SYSTEM_V2_MASTER.md` remains the visual-system authority.
5. Current application source/schema/migrations/RLS/RPC/tests remain the authority for **what the application currently does**, not for silently redefining the desired workflow recorded here.

If source and this handoff differ, do not silently copy the source behavior into the new workflow. Determine whether the source is legacy behavior that must be migrated.

## 3. Repository and branch

- Repository: `baonguyen-kobe/eiu-medlabs`
- Active integration branch: `ui-modernization`
- Release branch: `main`
- Do not merge to `main`, mutate production DB, run production migrations, or deploy production without separate explicit authorization.

## 4. Figma working file

File: **MedLabs — Equipment Handover & Adjustment Flow**

URL: https://www.figma.com/design/xfaJx1sRn1bgMl5qfCPr1h

Page: `Equipment Handover Flow`

Important distinction:

- `SOURCE · ...` frames are reconstructions of current source behavior and are comparison references.
- `PROPOSAL · ...` / `PROPOSAL v2 · ...` frames are the desired redesign direction.
- Never treat a proposal frame as proof of current runtime behavior.
- When the user edits Figma directly, the **current Figma state** is the visual source of truth for the proposal. Do not restore elements the user removed unless asked.

### Desktop references

- `41:2` — `SOURCE · Admin/Staff · Phiếu thiết bị`
- `41:265` — `SOURCE · User/TA · Phiếu thiết bị của tôi`
- `43:2` — `PROPOSAL v2 · Admin/Staff · Phiếu thiết bị`
- `43:356` — `PROPOSAL v2 · User/TA · Phiếu thiết bị của tôi`

### Responsive references

Source reconstructions:

- `57:2` — `SOURCE · iPad 1024 · Admin/Staff · Phiếu thiết bị`
- `57:196` — `SOURCE · iPad 1024 · User/TA · Phiếu thiết bị của tôi`
- `57:329` — `SOURCE · Phone 390 · Admin/Staff · Phiếu thiết bị`
- `57:457` — `SOURCE · Phone 390 · User/TA · Phiếu thiết bị của tôi`

Responsive proposals:

- `53:2` — `PROPOSAL · iPad 1024 · Admin/Staff · Phiếu thiết bị`
- `53:141` — `PROPOSAL · iPad 1024 · User/TA · Phiếu thiết bị của tôi`
- `53:242` — `PROPOSAL · Phone 390 · Admin/Staff · Phiếu thiết bị`
- `53:363` — `PROPOSAL · Phone 390 · User/TA · Phiếu thiết bị của tôi`

The responsive proposals still need one final alignment/polish pass described in section 14.

## 5. Current source entry points to inspect before implementation

At minimum inspect the effective versions on `ui-modernization` of:

- `app/equipment/requests/page.tsx`
- `app/equipment/mine/page.tsx`
- `components/equipment-request-list.tsx`
- `app/equipment/actions.ts`
- `lib/equipment-requests.ts`
- `lib/equipment-lead-time.ts`
- equipment-related Supabase schemas, effective migrations, RLS, grants, RPCs, triggers, audit/outbox behavior, and tests

Current source facts already identified during design review:

- Admin/Staff and User/TA pages share `EquipmentRequestList`.
- Admin/Staff can receive manager status controls based on permissions/domain scope.
- Existing statuses include `new`, `preparing`, `handed_over`, `returned`, `completed`, `cancelled`.
- Existing handover and return flows already use recipient signatures.
- Existing registration lead-time logic enforces the 24-hour rule for registration/late approval.
- Current add-item action for Admin/Staff is separate from the full adjustment workflow and must not be mistaken for the desired user/TA adjustment workflow.

## 6. Canonical quantity terminology

These labels are product decisions and must be used consistently in UI, specifications, and implementation discussions.

### `SL đăng ký`

Original registered/requested quantity.

- Immutable after registration.
- This is the historical baseline of what the requester originally asked for.

### `SL sẽ giao`

The single canonical term for the planned/current pre-handover quantity.

Do **not** use `SL dự kiến giao` or `SL hiện tại` for this concept.

Rules:

- Before warehouse confirms `Đã soạn`: `SL sẽ giao = SL đăng ký`.
- After warehouse confirms `Đã soạn`: `SL sẽ giao` is the warehouse's committed/planned quantity.
- Approved adjustments set this quantity to the approved absolute proposed value.

### `SL đề nghị`

Quantity requested by User/TA in an adjustment request.

- Pending until Admin/Staff approval.
- Does not directly mutate `SL sẽ giao` while pending.

### `SL thực giao` / `SL đã giao`

Actual handed-over quantity.

- Entered/confirmed at handover.
- Becomes a frozen historical snapshot after handover confirmation/signature.
- Do not silently mutate it after the signed handover.

### `SL đã trả`

Cumulative quantity returned.

- May increase during later recovery while a request is in `Trả thiếu`.

### `Chênh lệch`

Always a separate comparison column where relevant.

Do not rely only on inline `+/-` text attached to another quantity.

## 7. Roles and authorization direction

Relevant roles include Admin, Staff, Teaching Assistant, Lecturer, and the request creator/recipient according to the existing authorization model.

Decisions for the new workflow:

- Admin/Staff manage warehouse preparation, adjustment review, handover, return, and recovery actions only within their authorized equipment domain/scope.
- The request creator can submit an adjustment request.
- A relevant Teaching Assistant may submit an adjustment only when scoped to the class/assignment; **not every TA globally**.
- Existing registrant/responsible-recipient signature rules remain relevant.
- Do not broaden permissions merely to simplify UI implementation.

Exact RLS/RPC capability rules must be verified against the effective schema before implementation.

## 8. Accepted lifecycle and quantity workflow

### 8.1 Registration

- `SL đăng ký` is recorded and remains immutable.
- Existing 24-hour lead-time behavior applies to registration.
- Existing late-registration approval behavior remains separate from the new adjustment workflow.

### 8.2 Admin/Staff: `Mới` → `Đã soạn`

When Admin/Staff moves a request from `Mới` to `Đã soạn`, use a preparation modal/list.

Per row:

- Default `SL sẽ giao = SL đăng ký`.
- Admin/Staff may change the planned quantity.
- Admin/Staff may add catalog equipment not in the original request.
- A newly added catalog item conceptually has original/registered quantity `0`.

Confirming preparation persists the planned quantity and transitions the request to `Đã soạn`.

### 8.3 User/TA: `Điều chỉnh số lượng giao`

Available while request is in `Mới` or `Đã soạn`.

Important rule:

- This adjustment workflow is **not restricted by the 24-hour/date lead-time rule**.
- The 24-hour rule remains a registration rule and must not be globally weakened.

User/TA may:

- increase or decrease quantity;
- add a catalog item;
- provide a required reason.

Submitting creates a pending adjustment request. It does **not** immediately change the live planned quantity.

Adjustment table columns:

`Tên thương mại · ĐVT · SL sẽ giao · SL đề nghị · Chênh lệch`

Baseline behavior:

- Before warehouse preparation, `SL sẽ giao` is derived from `SL đăng ký`.
- After preparation, `SL sẽ giao` is the current warehouse planned quantity.

### 8.4 Admin/Staff adjustment review

Review table:

`Tên thương mại · ĐVT · SL sẽ giao · SL đề nghị · Chênh lệch`

Approval semantics:

- Approval sets `SL sẽ giao` to the proposed **absolute quantity**.
- Never calculate the result by adding the old delta to whatever the current quantity happens to be.

Concurrency example:

- User submits `20 → 30` (`+10`).
- Staff later changes the current plan to `25` before approval.
- Approving the request must result in `30`, **not 35**.

Therefore the implementation needs a stale/concurrency guard or equivalent version/snapshot protection.

Rejection does not mutate planned quantities.

A single pending adjustment per request is desirable unless a later approved spec intentionally allows multiple concurrent requests.

### 8.5 Handover: Admin/Staff `Đã giao`

Use modal title:

`Xác nhận bàn giao thiết bị`

Table:

`Tên thương mại · ĐVT · SL sẽ giao · SL thực giao · Chênh lệch · Ghi chú*`

Rules:

- `SL thực giao` defaults to `SL sẽ giao`.
- Admin/Staff may adjust actual quantity at handover.
- `Ghi chú` column is shown only when at least one equipment row has note content.
- Keep the existing recipient signature flow at handover.
- After handover confirmation/signature, actual handed-over quantities are a frozen signed snapshot.

If post-handover additions ever become necessary, model them as a supplemental handover/revision event. Do not rewrite the already signed snapshot.

### 8.6 Initial return

Return modal table:

`Tên thương mại · ĐVT · SL đã giao · SL đã trả · Chênh lệch · Thu hồi · Ghi chú*`

The column name is exactly **`Thu hồi`**, not `Cần thu hồi`.

`Thu hồi` cells show a checkbox only; do not add repetitive text labels inside each row.

Return defaults:

- Reusable/returnable equipment: default `SL đã trả = SL đã giao`.
- Consumables/non-returnable supplies: default `SL đã trả = 0`; `Thu hồi` unchecked/disabled.
- For consumables, do not show a negative shortage difference. Show `—` instead.

Long-term data direction:

- Prefer an explicit catalog/data flag such as `return_required` instead of inferring solely from names or broad item type, if the existing catalog does not already encode this reliably.

Signature rule:

- Keep the current return signature flow.
- The registrant/receiver signs **once** at the initial return confirmation.
- Even when some equipment is missing, the initial return still gets the current return signature.
- Later recovery updates in `Trả thiếu` do **not** require the user to sign again.

### 8.7 Result after initial return

After initial return confirmation/signature:

- If any row has `SL đã trả < SL đã giao` **and** `Thu hồi` is checked → request becomes **`Trả thiếu`**.
- Otherwise → request becomes **`Hoàn Thành`**.

`Đã trả` is effectively a return transition step. The confirmed return may resolve directly to `Trả thiếu` or `Hoàn Thành`.

### 8.8 `Trả thiếu`

The recovery screen/popup focuses only on rows still requiring recovery, not the full original equipment list.

Table:

`Tên thương mại · ĐVT · SL đã giao · SL đã trả · Chênh lệch · Thu hồi · Ghi chú*`

Rules:

- Staff updates cumulative `SL đã trả`.
- When `SL đã trả == SL đã giao`, the row is no longer missing.
- When no remaining row is both short and marked `Thu hồi`, request automatically becomes `Hoàn Thành`.
- No repeated registrant/recipient signature is required for later recovery updates.

If Staff unchecks `Thu hồi` while the row is still short:

- Require `Lý do không tiếp tục thu hồi *`.
- Record the reason in audit/history.
- If this was the last missing tracked row, confirming no-recovery automatically completes the request.

Figma reference for this state exists as:

- `32:2` — `EDITABLE · Admin / Trả thiếu · Bỏ Thu hồi`

### 8.9 `Hoàn Thành`

Final readonly equipment history table:

`Tên thương mại · ĐVT · SL đăng ký · SL đã giao · SL đã trả · Ghi chú*`

Do not include `SL sẽ giao` in the default completed table. Planned-quantity history can remain available in deeper audit/history if required.

There is **no `Kết quả` column** anywhere in this workflow.

## 9. Equipment-table display rules

These are accepted across the workflow tables/modals:

- Prioritize/show **`Tên thương mại`** because commercial name is the unique useful identifier; generic equipment name may duplicate.
- Standard label is exactly `Tên thương mại`.
- Always show **`ĐVT`** on equipment tables. It is display-only, not editable.
- Remove `Xuất xứ`, `Nhà sản xuất`, `Model`, and `Phân loại` from operational workflow tables.
- In equipment item tables, show the **`Ghi chú` column only if at least one row contains a note**; if every row is empty, hide the entire column.
- Do not add a `Kết quả` column.

Difference styling direction:

- Positive difference: green soft badge/text treatment.
- Negative difference: red treatment.
- Newly added item: purple treatment.
- Unchanged: `—`.

## 10. Request-detail UI rules

The following rules apply to the request page detail/cards and are separate from the conditional equipment-table note-column rule above.

### `Ghi chú` request card

- The request-level `Ghi chú` card remains visible even when there is no content.
- If empty, leave the body visually empty; do not hide the card.
- Do not insert explanatory placeholder copy such as `Không ẩn ghi chú nếu trống` into the final UI.

### Fixed-size scrollable containers

The following request-detail content areas use fixed-size containers with vertically scrollable bodies when content overflows:

- `Lịch sử xử lý`
- `Đăng ký trễ`
- `Ghi chú`

Pattern:

- title/header remains fixed;
- only the body scrolls;
- scrollbar only needs to become visible when content overflows.

### `Lịch sử xử lý`

Default presentation:

- Show the **2 most recent actions**.
- Then show `+ N thao tác trước đó` for older actions.
- Older actions may be expanded/loaded into the same scrollable history body.

Do not revert to showing 3 recent actions by default.

## 11. Status labels and color direction

Canonical wording currently used by source and proposal:

- `Mới`
- `Đã soạn`
- `Đã giao`
- `Đã trả`
- `Hoàn Thành`
- future desired status: `Trả thiếu`

Use **`Hoàn Thành`** consistently with capital `T`.

Current source status-pill geometry observed during review:

- height/min-height: 30px
- font: Be Vietnam Pro, 12px, weight 800
- horizontal/vertical padding: `5px 11px`
- border: `1px solid currentColor`
- radius: `999px`
- desktop request-list status slot: approximately 148px wide

Current source color mapping:

- `Mới`: text/border `#c81e1e`, background `#fff1f1`
- `Đã soạn`: text/border `#b45309`, background `#fff7e8`
- `Đã giao`: text/border `#1d4ed8`, background `#eff6ff`
- `Đã trả`: text/border `#6d28d9`, background `#f5f3ff`
- `Hoàn Thành`: text/border `#15803d`, background `#f0fdf4`

Active manager status buttons use solid versions of the same families.

`Trả thiếu` should have a distinct red/red-soft treatment so it cannot be confused with a normal completed return.

Action color decision:

- `Hủy` = red.
- `Từ chối` = red.
- Primary confirmations remain blue.

## 12. Desktop proposal decisions

The desktop proposal is not a major product redesign. It is a clearer re-layout of the same request-management information model.

Accepted direction:

- Admin/Staff and User/TA share the same visual language and list structure.
- Proposal list uses **`Giảng viên`** as the summary column rather than the source's equipment-count column.
- Equipment count/list access lives in a dedicated `Thiết bị` card inside expanded details.
- Admin/Staff expanded detail includes management/status controls, confirmation state, equipment summary, late-registration card, request information, and history.
- User/TA does not receive manager controls.
- Request-level `Ghi chú`, `Đăng ký trễ`, and `Lịch sử xử lý` follow the scrollable-card rule above.
- `Xử lý phiếu` is the preferred Admin section title because the block contains more than status alone.

## 13. Source-responsive behavior versus desired responsive proposal

Do not confuse the two.

### Current source behavior

The current equipment request list switches to its dedicated mobile two-band row at `<= 920px`.

At 1024px the source still behaves as desktop/table layout and may retain the desktop sidebar/table overflow behavior.

At `<= 920px`, current source mobile summary uses columns roughly equivalent to:

`Môn học · Ngày · Phòng/Lab · Trạng thái · chevron`

At narrow phone widths the source further compresses typography and spacing.

### Desired responsive proposal

The proposal intentionally modernizes this:

- iPad 1024 uses responsive top header/menu instead of retaining the full desktop sidebar.
- Phone uses request cards rather than squeezing the source two-band condensed table into the viewport.
- Expanded information is reorganized into role-appropriate cards.

This is an intentional proposal, not a claim that source already behaves this way.

## 14. Accepted final responsive polish direction

The user approved one more polish/alignment pass before treating responsive proposal frames as final baseline.

Apply the following without changing the agreed product content.

### 14.1 Global alignment/grid

Use a deliberate shared gutter system:

- iPad: **24px page gutter**.
- Phone: **16px page gutter**.

Title, filters, request cards, and expanded content should align to the same page gutter for each breakpoint.

Use a constrained spacing vocabulary where practical:

- 8px — small internal gap
- 12px — compact/card gap
- 16px — normal card padding/section gap
- 24px — iPad page gutter / larger separation

### 14.2 iPad filters

On iPad, filters are already visible, so do not keep a redundant `Bộ lọc` button.

- Keep visible search/scope/status/date controls.
- Keep `Xóa bộ lọc`.
- Reserve the collapsed `Bộ lọc` interaction for phone.

### 14.3 Request list summary

- Use `Phòng/Lab`, not only `Phòng`.
- Preserve domain/scope information such as `Kỹ năng Điều dưỡng` in the proposal summary without adding an unnecessarily wide extra column; placing it as a secondary line inside the course cell/card is acceptable.
- Keep `Giảng viên` as the proposal summary field.

### 14.4 Admin `Xử lý phiếu`

Separate status progression from utility/destructive actions.

Conceptually:

- **Trạng thái:** `Mới · Đã soạn · Đã giao · Đã trả · Hoàn Thành`
- **Tiện ích:** `Xuất PDF · Xóa phiếu`

Phone direction:

- status controls may use a balanced `3 + 2` grid;
- `Xuất PDF` and `Xóa phiếu` should form a separate balanced 2-column row below;
- avoid leaving `Xóa phiếu` alone on a visually orphaned row.

### 14.5 `Bàn giao / Trả thiết bị` confirmation layout

iPad direction: use an explicit aligned 3-column grid per row:

`Phase | Recipient confirmation | Warehouse confirmation`

Examples:

- `Bàn giao | Người nhận · Đã ký | Kho · Đã xác nhận`
- `Trả thiết bị | Người trả · Đã ký | Kho · Đã xác nhận`

Phone direction:

- each phase becomes a compact block;
- phase title first;
- confirmation statuses below in two aligned columns;
- do not allow recipient and warehouse text to overlap.

### 14.6 Card consistency and note placement

For the polished proposal, keep the mental model consistent:

- left/main area: `Thông tin phiếu`
- right/supporting area on iPad: `Thiết bị → Đăng ký trễ → Ghi chú → Lịch sử xử lý` where applicable
- User/TA omits Admin-only history/manager controls when not authorized.

In particular, the Admin iPad proposal should move the request-level `Ghi chú` into the supporting-card stack instead of embedding it inside `Thông tin phiếu`, matching the cross-breakpoint card model.

### 14.7 Elements already considered stable

Do not redesign these without new feedback:

- `Thiết bị` card with large count + caption + full-width `Xem toàn bộ danh sách` action.
- Fixed-height scrollable `Đăng ký trễ` card.
- Fixed-height scrollable `Ghi chú` card, visible even when empty.
- `Lịch sử xử lý` with 2 latest events + `+ N thao tác trước đó`.
- Current overall card hierarchy and EIU visual language.

## 15. Implementation data-model implications

The exact schema/API names are **not yet approved by this document**, but the implementation must be capable of preserving these invariants:

- immutable original registered quantity;
- mutable planned pre-handover quantity (`SL sẽ giao`);
- absolute proposed adjustment quantities with submission snapshot/version protection;
- frozen signed actual-handover snapshot;
- cumulative returned quantity;
- explicit return/recovery requirement per item when needed;
- pending adjustment header/items and approval/rejection history;
- `Trả thiếu` lifecycle state or equivalent explicit durable state;
- no mutation of signed snapshots;
- auditable reason when recovery is abandoned;
- atomic lifecycle transitions and correct authorization scope.

Do not pick column/table names only from this list. Inspect effective schemas and migrations first and design the smallest safe forward change.

## 16. Implementation process requirements

This feature is cross-cutting: UI + workflow + authorization + database state + signatures + audit/history + possibly notifications/tests.

Before implementation:

1. Read `AGENTS.md` and `docs/DOCUMENTATION_AUTHORITY.md`.
2. Read this handoff fully.
3. Read `docs/UI_DESIGN_SYSTEM_V2_MASTER.md` and current `docs/ui-modernization/{CURRENT,TRACKER,DECISIONS}.md`.
4. Read `NEXTJS_AGENTS.md` before changing Next.js behavior.
5. Load the required Supabase skill before Supabase work and inspect effective schema/migrations/RLS/RPC/grants/tests.
6. Inspect the current source files listed in section 5.
7. Because this changes lifecycle/schema/security/workflow behavior, prepare a scoped OpenSpec/change contract before implementation unless the repository's current governance clearly provides an already-approved equivalent spec.
8. Preserve existing handover signature and initial return signature semantics.
9. Verify desktop + iPad + phone against the approved Figma proposal after the final polish pass.
10. Do not claim production state from repository state.

## 17. Explicit non-goals / things not to regress

- Do not weaken the 24-hour registration rule globally.
- Do not apply that registration lead-time restriction to the new User/TA quantity-adjustment workflow.
- Do not let pending adjustments directly mutate live planned quantities.
- Do not apply a submitted delta to a later changed baseline; approval targets the submitted absolute quantity.
- Do not mutate signed handover quantities after signature.
- Do not require the recipient to re-sign later `Trả thiếu` recovery updates.
- Do not show consumable `SL đã trả = 0` as a negative shortage when return is not required.
- Do not broaden TA access to unrelated classes.
- Do not add `Kết quả` columns.
- Do not restore source-only responsive layouts into the proposal simply because they currently exist in code.
- Do not remove the request-level `Ghi chú` card just because it is empty.

## 18. Resume checklist for a new chat/agent

When resuming this exact work:

1. Read this document before making any equipment workflow/UI change.
2. Inspect the **current** Figma proposal frames because the user may have manually edited them after this document was written.
3. Distinguish SOURCE and PROPOSAL frames.
4. Finish the responsive polish in section 14 if it has not yet been visually accepted.
5. Obtain user visual acceptance of the proposal before translating it into code.
6. When coding begins, re-inspect effective source/schema instead of assuming the source facts in this handoff are still current.
7. Record any superseding business decision in this document and/or `DECISIONS.md` rather than leaving it only in chat.
