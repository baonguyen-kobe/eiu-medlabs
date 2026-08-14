# EIU MEDLABS UI DESIGN SYSTEM V2 — MASTER

Status:
USER-APPROVED UI AUTHORITY

Canonical path:
docs/UI_DESIGN_SYSTEM_V2_MASTER.md

Authority priority:

1. Existing business/security requirements
2. This Master
3. Approved Page Overrides contained in this Master
4. Existing approved production visual where this Master is silent
5. Existing implementation / legacy CSS
6. Generic UI/UX recommendations

Governance:

When the user approves a UI/UX rule change, update this file first. Do not create another competing Master.

Last updated:
2026-08-14

---

# 0. SOURCE OF TRUTH — THỨ TỰ ƯU TIÊN

Khi có xung đột, áp dụng đúng thứ tự:

```text
1. Business/security requirement đã tồn tại
2. This Master
3. Approved Page Overrides contained in this Master
4. Existing production visual nếu không mâu thuẫn MASTER
5. Existing code / legacy CSS
6. Generic UI/UX recommendation
```

Không được nói:

> “Code cũ đang vậy nên giữ.”

Không được nói:

> “V2 hiện đại hơn nên đổi.”

Nếu MASTER đã có exact value thì dùng exact value.

---

# 1. DESIGN DIALS — FINAL

```text
Variance: 2 / 10
Motion:   2 / 10
Density:  7 / 10
```

Ý nghĩa:

- UI rất đồng bộ.
- Motion rất nhẹ.
- Admin/data-heavy, gọn nhưng không ép chữ nhỏ.
- Page mới phải tái sử dụng shared pattern.

---

# 2. BRAND MASTER

## Font

```text
Be Vietnam Pro
```

Fallback:

```css
"Be Vietnam Pro", "Segoe UI", system-ui, sans-serif
```

## Brand direction

```text
EIU Blue + Gold + Cream
```

Core colors:

```text
EIU Blue      #144069
EIU Gold      #A78656
EIU Cream     #F6F1E8
Canvas        #F8F6F1
Surface       #FFFFFF
Ink Primary   #303033
Danger        #B44425
Success       #52813B
Warning       #D88327
```

Component mới nên dùng semantic token thay vì hardcode brand hex trực tiếp khi có thể.

---

# 3. TYPOGRAPHY MASTER

Recommended semantic roles:

```text
Page title       clamp(27px, 2vw, 32px) / 1.2 / 750
Section title    16px / 1.35 / 800
Card title       15px / 1.4 / 700
Body             14px / 1.5 / 400-500
Table body       14px / 1.4 / 400-600
Table header     13px / 1.35 / 700
Field label      13px / 1.4 / 600-700
Button           14px / 1.2 / 600-700
Metadata         13px / 1.45 / 400-500
Caption          12px / 1.4 / 400-600
```

Rules:

- Không dùng 8px cho content bình thường.
- Không giảm font để “nhét” table.
- Dữ liệu số/ngày/giờ nên dùng tabular numerals khi phù hợp.

---

# 4. SPACING MASTER

Scale:

```text
4 / 8 / 12 / 16 / 24 / 32 / 48 px
```

Desktop guideline:

```text
Page gutter          ~32px
Major section gap    24–32px
Card padding         20–24px
Toolbar gap          8–12px
Field vertical gap   12–16px
```

Không thêm random spacing 13/17/23px nếu không có lý do layout rõ.

---

# 5. RADIUS MASTER

```text
Control radius     10px
Card/Table radius  15px
Dialog/Drawer      16px
Badge/Pill         999px
```

Outer component sở hữu radius và clipping.

Không để child tạo radius chỉ để vá visual.

---

# 6. SIDEBAR MASTER — FINAL

Giữ visual production đã được user duyệt.

## Desktop shell

```text
width: 244px
padding: 22px 14px 16px

background:
linear-gradient(
  180deg,
  #173F64 0%,
  #102F4D 62%,
  #0C2944 100%
)
```

## Logo

```text
height: 62px
background: #FFFFFF
border-radius: 12px
padding: 8px 10px
shadow: 0 10px 24px rgba(0,0,0,0.20)
```

## MedLabs Calendar

```text
font-size: 21.5px
font-weight: 800
line-height: 1.2
letter-spacing: -0.025em
color: #FFFFFF
```

## Group heading / Mục lớn

Ví dụ:

```text
KỸ NĂNG ĐIỀU DƯỠNG
QUẢN LÝ LỚP
QUẢN LÝ PHÒNG
TẠO PHIẾU
Y CƠ SỞ
QUẢN TRỊ
```

FINAL TO-BE:

```text
font-size: 14px
font-weight: 800
letter-spacing: 0.06em
text-transform: uppercase
color: #D9C49E
```

## Menu item / Mục nhỏ

```text
font-size: 12px
font-weight: 500
```

## Active menu item

```text
font-size: 12px
font-weight: 700

height: 42px
padding: 0 12px
border-radius: 11px

color: #144069
background: #FFFFFF

box-shadow:
inset 4px 0 0 #A78656,
0 8px 18px rgba(0,0,0,0.12)
```

Rules:

- Mục lớn phải lớn/đậm hơn mục nhỏ.
- Không bỏ gold left accent.
- Không đổi Sidebar thành flat blue.
- Chỉ chuẩn hóa spacing, không redesign visual identity.

---

# 7. PAGE HEADER / TOPBAR MASTER — FINAL

Áp dụng cho toàn bộ page trong WorkspaceShell.

## Shell

```text
min-height: 82px
padding: 16px 30px

background:
rgba(255,255,255,0.94)

backdrop-filter:
blur(14px)

position: sticky
top: 0
z-index: 35
```

Không dùng:

```text
min-height: 106px
padding: 24px 32px 18px
background: rgba(248,246,241,0.92)
```

Header của mọi page phải là **trắng**, không vàng nhạt.

## Page title

```text
font: Be Vietnam Pro
color: #144069
font-size: clamp(27px, 2vw, 32px)
font-weight: 750
line-height: 1.2
letter-spacing: -0.025em
margin: 0
```

## Subtitle

```text
font-size: 14px
color: #68686B
margin-top: 4px
```

Dashboard:

```text
Hôm nay 14/08/2026
```

Không hiển thị:

```text
· Xin chào ...
```

---

# 8. KPI CARD MASTER

Current production KPI card là chuẩn.

Giữ:

- white card
- subtle border
- subtle shadow
- left accent
- icon tile
- title
- large value

Rules:

- same row → same height
- same spacing
- same icon geometry
- same label/value typography

---

# 9. FORM MASTER — TẠO LỊCH SKILLS

`Tạo lịch Skills lab` là Form Master.

Structure:

```text
01 SECTION
title
helper
fields

02 SECTION
...

03 SECTION
...

Footer
Hủy | Primary action
```

## Section Number Badge — FINAL

```text
min-width: 34px
height: 30px
padding-inline: 7px

display: grid
place-items: center

background: #E5EDF5
color: #144069
border-radius: 9px

font-size: 16px
font-weight: 800
```

Không đổi thành circle/pill xanh đậm với số trắng.

## Section Heading — FINAL

```text
color: #144069
font-size: 16px
font-weight: 800
line-height: 1.35
gap với badge: 9px
```

## Field contract

```text
Label
Control
Helper text / optional
Inline error / optional
```

States:

```text
default
hover
focus
filled
read-only
disabled
error
```

---

# 10. DROPDOWN / SELECT FOCUS MASTER

Khi focus dropdown/select:

**chỉ có một viền focus cho toàn bộ control.**

Không được có:

```text
outer border
+
inner blue border/ring
```

Required:

- một focus boundary rõ
- no nested double border
- vẫn keyboard accessible
- visual giống production: một control = một viền focus

Nếu wrapper đã vẽ border thì native/select inner element không được vẽ thêm border/outline riêng.

---

# 11. FILTER / TOOLBAR CONTROL MASTER — FINAL

Áp dụng cho cùng một filter row.

## Height

```text
height: 44px
min-height: 44px
box-sizing: border-box
border-radius: 10px
```

Áp dụng cho:

- Search
- Select/dropdown
- Date input
- Xóa bộ lọc
- Filter action button cùng cấp

Không để cùng hàng tồn tại:

```text
39px / 42px / 44px
```

## Alignment

- top edge thẳng nhau
- bottom edge thẳng nhau
- vertical center đồng nhất
- `Xóa bộ lọc` phải thẳng hàng với select/date/search

## Width

- các dropdown cùng cấp: equal width
- search có thể wider có chủ đích
- reset/count compact
- không layout tự do

---

# 12. INLINE COUNT LABEL MASTER

Áp dụng cho:

```text
1/1 phiếu
5/5 thiết bị
19 lớp
22 nhân sự
...
```

Wrapper:

```text
height: 44px
display: inline-flex
align-items: center
justify-content: center
```

Rules:

- vertical-center với control bên cạnh
- không lệch lên/xuống
- consistent baseline
- không custom padding theo page

---

# 13. TABLE MASTER — CRITICAL

## Structure

```text
DataTableShell
├── FilterBar / optional
├── BulkActionBar / optional
├── TableScrollViewport
│   └── DataTable
├── EmptyState / optional
└── Pagination / optional
```

## Outer shell

Chỉ một lớp sở hữu:

```text
border
border-radius: 15px
shadow
background
clipping
```

Inner scroll viewport chỉ scrolling.

Không `shell inside shell`.

## Rounded corners

- bo kín cả 4 góc
- border continuous
- header cream clip đúng radius
- no square leak

## Header full width

Header background phải phủ đến mép phải thật sự.

Không có white gutter.

## Scrollbar gutter

For Data Table:

```text
scrollbar-gutter: auto
```

Không dùng:

```text
stable
stable both-edges
```

nếu reserve khoảng trắng.

## Page overflow

```text
Page horizontal overflow: FORBIDDEN
Table local horizontal scroll: ALLOWED
```

---

# 14. TABLE HEADER ALIGNMENT MASTER — FINAL

Tất cả Data Table header:

```text
text-align: center
vertical-align: middle
padding: 14px 16px
font-size: 13px
font-weight: 700
white-space: nowrap
```

Header phải căn giữa theo cột.

Không để header căn trái.

---

# 15. TABLE BODY CELL MASTER — FINAL

Body text:

- tên / email / note / description → căn trái
- status / short numeric có thể center nếu phù hợp
- không ép tất cả body căn center

Cell inset:

```text
padding-block: 14px
padding-inline: 16px
```

Control bên trong cell:

- không sát mép
- không negative margin
- `width:100%` chỉ trong content box
- giữ safe inset khoảng 16px nếu đủ chỗ

---

# 16. TABLE COLUMN INTENT SYSTEM

Không chia đều tất cả cột.

Concept:

```text
compact
narrow
medium
wide
flex
```

Representative:

```text
compact  ~64–96px
narrow   ~100–130px
medium   ~140–190px
wide     ~200–280px
flex     min ~220px + receives remaining space
```

Short-content columns phải nhỏ lại để nhường long-content columns.

---

# 17. EQUIPMENT TABLE MASTER — FINAL

Áp dụng cho các bảng thiết bị/vật tư.

```text
Tên thiết bị và vật tư: 275px
Tên thương mại:         275px

Loại:                   145px
Nước SX:                145px
Hãng:                    145px
Model:                   145px
ĐVT:                     145px
Trạng thái:              145px

Selection checkbox:       52px
```

Base:

```text
min-width: 1420px
table-layout: fixed
```

Rules:

- 2 cột tên phải rộng nhất
- metadata ngắn dùng width chuẩn bằng nhau
- không chia đều làm 2 cột tên bị bóp

Modal thiết bị cũng theo cùng philosophy.

---

# 18. ACTION BUTTON MASTER — FINAL

## One-line label

```text
white-space: nowrap
```

Không cho desktop label như:

- Ngừng sử dụng
- Import tất cả
- Tải template
- Xuất phiếu PDF

xuống dòng nếu có thể phân bổ width lại.

## Same group = equal geometry

Cùng action group:

```text
same height
same width/min-width
same horizontal padding
same radius
same icon size/gap
```

---

# 19. CATALOG ACTION MASTER — FINAL

Áp dụng cho:

- Danh mục thiết bị
- Danh mục môn học
- Danh mục phòng
- Mẫu ca trực
- các catalog tương tự

Representative group:

```text
Kích hoạt | Sửa | Ngừng sử dụng | Xóa
```

Geometry:

```text
display: flex
align-items: center
gap: 9px

button width: 154px
button min-width: 154px
button min-height: 42px

justify-content: center
white-space: nowrap
```

Tone:

```text
Kích hoạt       Primary
Sửa             Primary/Secondary
Ngừng sử dụng   Warning
Xóa             Danger
```

## Position stability — MANDATORY

Button không được nhảy vị trí khi state thay đổi.

Các state:

```text
no selection
selected
multi-selected
editing
disabled
loading
```

Allowed:

- disabled
- color/tone
- loading text/icon

Forbidden:

- hide/remove button
- reflow toàn toolbar
- justify buttons sang vị trí khác
- button đổi slot

Nếu action chưa dùng được:

```text
keep slot
→ disabled
```

---

# 20. CATALOG CONSISTENCY MASTER

`Danh mục khác` phải đồng bộ `Danh mục thiết bị`.

Phải cùng:

- action button sizes
- icon sizes
- spacing
- toolbar placement
- disabled visual
- edit visual
- action ordering logic

Không chấp nhận:

```text
Danh mục thiết bị:
compact equal group

Danh mục khác:
buttons rải khắp hàng / nhảy vị trí
```

---

# 21. FILTER / IMPORT / ACTION GRID MASTER

Same visual row:

- same height
- same baseline
- same logical grid
- same control alignment

Desktop:

- ưu tiên 1 hàng
- nếu cần wrap → wrap nguyên control/button
- không wrap text bên trong button

Tablet/mobile:

- intentional 2-column / 1-column breakpoints
- no page horizontal overflow

---

# 22. PERSONNEL TABLE OVERRIDE — FINAL

Columns:

```text
1 Mã
2 Họ và tên
3 Email
4 Vai trò
5 Quyền bổ sung
6 Phạm vi
7 Trạng thái
8 Thao tác
```

Chức danh nằm dưới Họ tên.

Example:

```text
Nguyễn Nhựt Bảo
Chuyên viên
```

Multiple roles:

- wrap badges inside Vai trò
- không shrink font
- row tăng height nếu cần

Column intent:

```text
Mã              compact
Họ và tên       wide
Email           wide/flex
Vai trò         medium
Quyền bổ sung   medium
Phạm vi         medium
Trạng thái      narrow
Thao tác        compact
```

---

# 23. PERSONNEL EDIT DRAWER OVERRIDE — FINAL

Drawer bên phải.

Actual DOM order phải là:

```text
Thông tin cơ bản
Vai trò chính
Quyền bổ sung
Phạm vi phụ trách
Trạng thái
Mật khẩu / Bảo mật
```

Không chỉ dùng CSS `order`.

Sticky Header + Scrollable Body + Sticky Footer.

Footer:

```text
Hủy | Lưu thay đổi
```

---

# 24. CALENDAR MASTER

`Lịch Skills lab` là Calendar Master.

`Lịch Y cơ sở` dùng cùng visual Master.

Keep:

- KPI
- search/date
- previous / Tuần này / next
- date range
- Tháng / Tuần / Danh sách
- event cards
- current day highlight
- detail drawer

Skills/Y chỉ khác data/business fields, không khác visual shell.

---

# 25. DASHBOARD OVERRIDE

Keep current production direction.

Required:

- KPI Master
- white Topbar 82px
- no `Xin chào`
- `LỊCH HỌC 7 NGÀY TỚI` uses Table Master

---

# 26. CREATE BASIC MEDICAL / TẠO LỊCH Y CƠ SỞ OVERRIDE

Giữ **bố cục và nội dung nghiệp vụ hiện tại**.

Không ép thành layout Tạo lịch Skills.

Keep:

```text
Thao tác với phiếu đã đăng ký
Điều chỉnh phiếu
Sao chép phiếu

01 Thông tin môn học
02 Thông tin người đăng ký
03 Thông tin giảng viên phụ trách
04 Thông tin đăng ký
Session table
Ghi chú
Footer
```

Chỉ inherit:

- typography
- spacing
- field styles
- section badge
- buttons
- validation
- focus
- responsive
- table rules

---

# 27. PHIẾU Y CƠ SỞ OVERRIDE

Current layout cần standardize.

Collapsed row:

```text
Môn học
Thời gian đăng ký
Phòng
Số buổi
Trạng thái
Expand/Action
```

Expanded:

```text
Registration summary grid
Registration actions
Session table
```

Session columns:

```text
#                         compact
Ngày                      narrow
Thời gian                 narrow
Tên bài TN-TH             wide/flex
GV giảng dạy/hướng dẫn    wide
Trạng thái                medium
Thao tác                  compact
```

Không để `Tên bài TN-TH` wrap 2 dòng trong khi cột khác còn dư.

---

# 28. EQUIPMENT REQUEST OVERRIDE

Keep expanded-detail concept hiện tại.

Improve:

- spacing
- typography
- button hierarchy
- column intent
- one-line headers
- metadata grid

Approval:

```text
Approve = Primary
Reject  = Danger
```

Request actions:

```text
Export PDF = Secondary
Delete     = Danger
```

---

# 29. EQUIPMENT LIST MODAL OVERRIDE

Keep modal concept.

Inherit:

- Dialog Master
- Table Master
- Equipment column intent
- local horizontal scroll
- no white gutter
- one-line headers
- consistent add-row/footer actions

---

# 30. IMPORT MASTER — FINAL

`Import lịch Skills lab` là Import Master.

Wizard:

```text
1 Chọn file
2 Xem trước
3 Kiểm tra
4 Xác nhận
5 Kết quả
```

Keep:

- large upload dropzone
- Template CSV/XLSX
- file summary
- KPI validation summary
- preview table
- pagination
- Quay lại / Tiếp tục

Apply to:

- Import Skills
- Import Y
- Import Phiếu thiết bị
- catalog import where workflow matches

---

# 31. CATALOG IMPORT ALL — FINAL BUSINESS/UX REQUIREMENT

`Import tất cả` uses reconciliation semantics internally, but the preview modal is primarily for:

> Xem dữ liệu trong FILE sắp import trước khi áp dụng.

Final flow:

```text
Import tất cả
→ native file chooser
→ select CSV/XLSX
→ validate and parse
→ obtain server-authoritative reconciliation preview/fingerprint
→ automatically open preview modal
→ user reviews file rows
→ Hủy or Import tất cả
```

Do NOT expose a separate action named `Preview đối soát`.

Do NOT expose a primary action named `Chọn file đối soát`.

## Preview modal content

Show:

- file name;
- row count;
- file-row preview table;
- file validation errors where applicable; and
- modal-local pagination for large files.

Equipment preview columns:

```text
Tên thiết bị và vật tư
Tên thương mại
Loại
Nước SX
Hãng
Model
ĐVT
```

Do NOT require visible reconciliation KPI cards `Cập nhật`, `Thêm mới`, `Kích hoạt lại`, `Ngừng sử dụng`, or `Xóa` inside this preview modal.

The backend may still calculate reconciliation information for server-authoritative planning, fingerprint generation, stale-preview protection, internal validation, and audit. Those counts are not mandatory user-facing preview content.

## Apply semantics remain unchanged

Existing identity present in file:

- preserve UUID;
- update metadata; and
- reactivate if needed.

New identity: insert.

Current catalog identity absent from file:

- referenced/history exists: `Ngừng sử dụng`;
- truly orphan: may delete according to existing approved semantics.

Apply remains atomic, server-authoritative, and fingerprint protected.

`Hủy` performs zero mutation.

If database/catalog state changes after preview, reject stale preview. Do not silently execute a different plan; the user must obtain a fresh preview before retrying.

---

# 32. CATALOG ADD FORM

Manual add form mặc định **collapsed**.

Page ưu tiên list/filter.

Bấm:

```text
+ Thêm ...
```

mới expand manual form.

---

# 33. EVIDENCE OVERRIDE

Keep document-style.

Evidence là approved exception.

Principles:

- document/readability first
- signature/evidence prominent
- metadata secondary
- invalidation visible
- PDF/export compatible

---

# 34. LOGIN OVERRIDE

Keep gần production hiện tại.

Inherit shared:

- font
- input
- button
- focus
- error
- accessibility

Không redesign login thành unrelated visual family.

---

# 35. BUTTON / STATUS STATE MASTER

Buttons:

```text
default
hover
focus-visible
pressed
disabled
loading
```

Inputs:

```text
default
hover
focus
filled
read-only
disabled
error
```

Rows:

```text
default
hover
selected
expanded
inactive
warning
```

Dialogs:

```text
closed
opening
open
pending
error
closing
```

---

# 36. MODAL / DRAWER MASTER

Dialog:

- shared shell
- focus trap
- ESC when safe
- focus return
- pending handling
- one semantic tone

Drawer:

```text
Sticky Header
Scrollable Body
Sticky Footer
```

No browser-native `prompt()` for business input.

Browser `confirm()` should be migrated to shared ConfirmDialog where in UI V2 scope.

---

# 37. INLINE COUNTER + ACTION ALIGNMENT ACCEPTANCE

For every toolbar containing:

```text
Search
Filters
Xóa bộ lọc
Counter
Action buttons
```

verify:

```text
all controls same 44px row height
counter visually centered
reset button same height
same baseline
no vertical drift
```

---

# 38. RESPONSIVE MASTER

```text
Desktop productivity first
Tablet/mobile fully operable
```

Desktop:

- dense
- one-line table headers
- one-line button labels

Tablet:

- intentional wrap
- local table scroll

Mobile:

- no page horizontal scroll
- controls 1 or 2 columns
- table can horizontal-scroll internally
- modal/drawer fit viewport

---

# 39. ACCESSIBILITY MASTER

Target WCAG AA-oriented.

Required:

- keyboard navigation
- visible focus
- no focus hidden under sticky UI
- accessible names for icon-only controls
- color not only status signal
- reduced motion
- accessible form errors
- modal/drawer focus management

Do not fix visual issues by removing focus outline entirely.

---

# 40. ANTI-PATTERNS — REJECT

Do not introduce:

- custom table shell per page
- custom filter visual per page
- another modal implementation
- random radius/shadow
- hardcoded page-specific table header color
- white table gutter
- multi-line desktop table headers due poor width planning
- page-level horizontal scroll
- tiny font to fit data
- equal-width table columns regardless content
- buttons that move position between states
- buttons that wrap text on desktop
- multiple different control heights in same row
- double focus border
- duplicate CSS override instead of fixing shared contract
- CSS `order` to fake semantic DOM order
- browser prompt for business input
- visual refactor combined with unrelated business/security change

---

# 41. VISUAL REGRESSION REQUIREMENT

Representative viewports:

```text
1920
1440
1366
1024
820
390
```

Representative pages:

```text
Tổng quan
Lịch Skills lab
Skills detail drawer
Tạo lịch Skills lab
Nhân sự
Personnel edit drawer
Danh mục thiết bị
Danh mục khác
Lớp đang mở
Phiếu thiết bị của tôi
Phiếu Y cơ sở
Tạo lịch Y cơ sở
Import lịch Skills lab
Evidence
Login
```

Must visually inspect:

- Sidebar hierarchy
- Topbar white/82px
- title
- section badge
- table rounded edge
- right-edge gutter
- table header center
- cell padding
- equipment column proportions
- filter alignment
- counter alignment
- focus border
- button sizes
- button no-wrap
- action position stability
- catalog consistency

`page.screenshot()` alone is capture, not final regression assertion.

Where feasible, use approved `toHaveScreenshot()` baseline later.

---

# 42. REQUIRED IMPLEMENTATION STRATEGY

Do not patch page-by-page first.

Preferred order:

```text
1. Fix shared tokens
2. Fix shared Workspace/PageHeader
3. Fix shared table shell/header/body
4. Fix shared filter/control contracts
5. Fix shared action/button group
6. Fix shared dialog/drawer
7. Apply page-family overrides
8. Remove obsolete legacy CSS causing specificity conflicts
9. Visual test representative pages
```

Important:

If legacy CSS has higher specificity than V2 `:where(...)`, do NOT assume later V2 selector wins.

Check **computed style**.

Remove or rewrite the old conflicting rule when necessary.

---

# 43. SAFETY RULES

This task is UI Design System work.

DO NOT:

- alter DB schema
- run production migrations
- deploy production
- modify production secrets
- weaken authorization
- change role/capability logic
- change business status transitions
- touch PR #2
- change production email behavior

Production must remain unchanged.

---

# 44. REQUIRED CHECKS BEFORE REPORTING DONE

At minimum run relevant:

```text
format
lint
typecheck
targeted Node tests
UI V2 source-contract tests
Playwright critical UI tests
visual capture at representative widths
```

Do not say PASS because a test file exists.

Actually run it.

---

# 45. REQUIRED FINAL REPORT FORMAT

When finished, report:

```text
MACHINE:
BRANCH:
BASE SHA:
HEAD SHA:
TASK:

FILES CHANGED:

MASTER AREAS IMPLEMENTED:
- Sidebar
- Topbar
- Form section
- Table
- Filter
- Counter
- Dropdown focus
- Buttons
- Catalog
- Personnel
- Y
- Import
...

KNOWN EXCEPTIONS:
...

TESTS:
- command
- result

VISUAL CHECKS:
- page
- viewport
- result

PRODUCTION CHANGED:
NO

BUSINESS LOGIC CHANGED:
NO

AUTHORIZATION CHANGED:
NO

READY FOR REVIEW:
YES/NO
```

If anything is still uncertain, say `PARTIAL` or `CANNOT VERIFY`.

Do not mark FIXED based only on source presence.

---

# 46. FINAL DEFINITION OF DONE

This task is DONE only when:

- approved Master values are implemented;
- Sidebar group 14px / menu 12px;
- Topbar is white and 82px;
- Page title exact Master;
- Section badge exact Master;
- Table header centered;
- cells have safe inset;
- table shell rounded 4 corners;
- no right-edge white gutter;
- Equipment name columns prioritized;
- filters same 44px height;
- reset aligned;
- counters centered;
- dropdown focus has one border;
- action labels do not wrap desktop;
- same action group buttons equal size;
- catalog buttons do not jump position;
- Danh mục khác matches Danh mục thiết bị;
- Personnel final column structure remains correct;
- Password section is truly last in DOM;
- Y Create preserves approved business layout;
- Y Registration is standardized;
- Import Master remains 5-step;
- Import All automatically opens a file-row preview before apply;
- Import All file contents are visible before mutation;
- Import All reconciliation semantics remain server-authoritative;
- Import All keeps fingerprint/stale-preview protection; and
- Import All reconciliation KPI cards are NOT required in the preview UI;
- no page-level horizontal overflow;
- representative visual checks pass;
- no business/security/production regression.

---

# FINAL INSTRUCTION

Do not interpret this prompt as:

> “Make the UI look nicer.”

Interpret it as:

> **“Implement the exact MedLabs UI Design System Master approved by the user, consolidate repeated patterns into shared components/tokens, preserve business behavior, and remove UI drift.”**

If current local implementation conflicts with this MASTER, **MASTER wins**.

---

# MASTER GOVERNANCE

1. This file is the canonical UI/UX authority for MedLabs.
2. Future approved UI/UX changes update this file first.
3. Implementation prompts should reference this file rather than reproducing the entire Design System.
4. If current UI implementation conflicts with this Master, Master wins unless an existing business/security requirement has higher authority.
5. An explicit new user-approved rule supersedes an older UI rule. Update the canonical file so the repository remains the authority.
6. Do not create competing Master files.
7. Historical UI docs remain context only where they conflict with this Master.
8. Review actual/computed UI outcome, not merely source presence.
9. Shared primitive/pattern correction takes precedence over page-specific CSS patching when the same problem exists across a component family.
10. Legitimate business workflow differences use Page Overrides; they do not create a separate visual language.
