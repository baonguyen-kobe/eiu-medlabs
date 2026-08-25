# EIU MedLabs UI Modernization QA Matrix

## Evidence rules

Allowed cell states:

```text
PASS
FAIL
PARTIAL
BLOCKED
NOT_RUN
N/A
```

- `PASS` requires actual verification of that surface.
- `PARTIAL` means only part of the required behavior or static evidence was reviewed.
- `BLOCKED` records unavailable authenticated rendered access.
- Static source review is not rendered `PASS`.
- Update the last verified commit and notes whenever evidence changes.

## Route matrix

| Route                                             | Screen family                   | 375     | 768     | 1024    | 1440    | Keyboard | A11y    | Visual identity | Last verified commit | Notes                                                                                                               |
| ------------------------------------------------- | ------------------------------- | ------- | ------- | ------- | ------- | -------- | ------- | --------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `/`                                               | Redirect/alias                  | N/A     | N/A     | N/A     | N/A     | N/A      | N/A     | N/A             | `aeb9a83`            | PASS route behavior: redirects to `/dashboard`                                                                      |
| `/login`                                          | Authentication                  | PASS    | PASS    | PASS    | PASS    | PARTIAL  | PARTIAL | PASS            | `aeb9a83`            | Rendered with no horizontal overflow; axe found no definite A/AA violation; missing h1 and 4.28:1 muted text remain |
| `/forgot-password`                                | Authentication recovery         | FAIL    | NOT_RUN | NOT_RUN | FAIL    | PARTIAL  | PARTIAL | FAIL            | `aeb9a83`            | Rendered legacy shell is visibly broken at 375 and 1440                                                             |
| `/reset-password`                                 | Authentication recovery         | FAIL    | NOT_RUN | NOT_RUN | NOT_RUN | PARTIAL  | PARTIAL | FAIL            | `aeb9a83`            | Rendered legacy shell is visibly broken at 375; other widths not run                                                |
| `/change-password`                                | Authentication recovery         | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED  | PARTIAL | PARTIAL         | `aeb9a83`            | Protected rendered access unavailable; static source uses the same legacy shell pattern                             |
| `/dashboard`                                      | Dashboard                       | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED  | PARTIAL | PARTIAL         | `aeb9a83`            | Auth redirected; static audit found dead `Xem tất cả` control and table-priority opportunity                        |
| `/class-schedules`                                | Skills calendar                 | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED  | PARTIAL | PARTIAL         | `aeb9a83`            | Auth redirected; shared calendar audited statically                                                                 |
| `/staff-shifts`                                   | Staff shifts                    | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED  | PARTIAL | PARTIAL         | `aeb9a83`            | Auth redirected; static audit found labels, overlay focus, touch-target, and local-style issues                     |
| `/schedule-entry/new`                             | Skills form                     | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED  | PARTIAL | PARTIAL         | `aeb9a83`            | Auth redirected; numbered form structure audited statically                                                         |
| `/schedule-entry/import`                          | Import wizard                   | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED  | PARTIAL | PARTIAL         | `aeb9a83`            | Auth redirected; five-step flow audited statically                                                                  |
| `/imports`                                        | Import history                  | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED  | PARTIAL | PARTIAL         | `aeb9a83`            | Auth redirected; 10-column table audited statically                                                                 |
| `/classes/open`                                   | Classes pilot                   | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED  | PARTIAL | PARTIAL         | `aeb9a83`            | Auth redirected; designated representative pilot                                                                    |
| `/classes/mine`                                   | Classes pilot                   | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED  | PARTIAL | PARTIAL         | `aeb9a83`            | Auth redirected; shared `ClassRegistrationList`                                                                     |
| `/equipment/register`                             | Equipment request form          | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED  | PARTIAL | PARTIAL         | `aeb9a83`            | Auth redirected; editable table mobile risk audited statically                                                      |
| `/equipment/requests`                             | Equipment operations            | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED  | PARTIAL | PARTIAL         | `aeb9a83`            | Auth redirected; pointer-only signature is P0 static finding                                                        |
| `/equipment/import`                               | Equipment import                | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED  | PARTIAL | PARTIAL         | `aeb9a83`            | Auth redirected; wizard audited statically                                                                          |
| `/equipment/mine`                                 | Equipment operations            | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED  | PARTIAL | PARTIAL         | `aeb9a83`            | Auth redirected; shares request list and signature workflow                                                         |
| `/basic-medical/schedules`                        | Basic Medical calendar          | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED  | PARTIAL | PARTIAL         | `aeb9a83`            | Auth redirected; shared calendar audited statically                                                                 |
| `/basic-medical/new`                              | Basic Medical form              | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED  | PARTIAL | PARTIAL         | `aeb9a83`            | Auth redirected; approved distinct business layout must remain                                                      |
| `/basic-medical/registrations`                    | Basic Medical registrations     | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED  | PARTIAL | PARTIAL         | `aeb9a83`            | Auth redirected; pointer-only confirmation is P0 static finding                                                     |
| `/basic-medical/registrations/confirmations/[id]` | Evidence document               | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED  | PARTIAL | PARTIAL         | `aeb9a83`            | Auth redirected; document/evidence layout audited statically                                                        |
| `/basic-medical/import`                           | Import wizard                   | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED  | PARTIAL | PARTIAL         | `aeb9a83`            | Auth redirected; shared five-step wizard audited statically                                                         |
| `/basic-medical/equipment`                        | Basic Medical equipment         | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED  | PARTIAL | PARTIAL         | `aeb9a83`            | Auth redirected; unlabelled filters and table strategies found statically                                           |
| `/basic-medical/equipment-requests`               | Basic Medical equipment request | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED  | PARTIAL | PARTIAL         | `aeb9a83`            | Auth redirected; long form/detail workflow audited statically                                                       |
| `/admin/personnel`                                | Personnel administration        | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED  | PARTIAL | PARTIAL         | `aeb9a83`            | Auth redirected; drawer/table and request fan-out audited statically                                                |
| `/admin/equipment`                                | Equipment catalog               | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED  | PARTIAL | PARTIAL         | `aeb9a83`            | Auth redirected; approved wide equipment table direction                                                            |
| `/admin/catalogs`                                 | Redirect/alias                  | N/A     | N/A     | N/A     | N/A     | N/A      | N/A     | N/A             | `aeb9a83`            | PASS route behavior by source: admin-gated redirect to `/admin/courses`                                             |
| `/admin/courses`                                  | Catalog administration          | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED  | PARTIAL | PARTIAL         | `aeb9a83`            | Auth redirected; shared catalog manager audited statically                                                          |
| `/admin/rooms`                                    | Catalog administration          | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED  | PARTIAL | PARTIAL         | `aeb9a83`            | Auth redirected; room and room-type tables audited statically                                                       |
| `/admin/class-schedules`                          | Redirect/alias                  | N/A     | N/A     | N/A     | N/A     | N/A      | N/A     | N/A             | `aeb9a83`            | PASS route behavior by source: redirects to `/classes/open`                                                         |
| `/admin/audit`                                    | Audit log                       | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED  | PARTIAL | PARTIAL         | `aeb9a83`            | Auth redirected; focusable horizontal audit table audited statically                                                |
| `/email-notifications`                            | Notification operations         | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED  | PARTIAL | PARTIAL         | `aeb9a83`            | Auth redirected; summary/detail mobile opportunity audited statically                                               |

## Coverage summary

```text
App Router page routes represented: 32
Rendered-screen routes represented: 29
Redirect/alias routes represented: 3
Protected rendered baseline: BLOCKED — approved authentication/environment unavailable
```
