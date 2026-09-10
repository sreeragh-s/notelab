# Calendar parity implementation ledger

Accepted scope: Google-backed web, macOS and Windows workflows using Zilobase UI and workspace content. Additional calendar providers and mobile are deferred. Each pass has a separate feature commit.

Reference: [Notion Calendar documentation](https://www.notion.com/help/category/notion-calendar/all), reviewed September 10, 2026.

| Pass | Feature | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Google event capabilities | Implemented | Shared capability tests; Calendar integration tests; web editor regression; workspace typecheck; architecture link checks. |
| 2 | Personal calendar source catalog | Implemented | 12 Calendar integration tests including owner isolation, account deduplication, expired memberships and rollout filtering; server/web typechecks; architecture checks. |
| 3 | Google connection onboarding | Implemented | Return-path test; OAuth replay/cancellation and reconnect deduplication integration tests; server/web typechecks; architecture checks. Live desktop OAuth acceptance pending. |
| 4 | Source organization | Implemented | Source-order behavioral tests; preference schema tests; web typecheck; selection regression. |
| 5 | Calendar-specific event panel | Implemented | Seven sidebar browser tests including independent pagination, selected-source creation, read-only creation denial and persistent ordering; source-order tests; web typecheck; architecture checks. |
| 6 | Configurable multi-day views | Implemented | Shared layout tests exercise all 31 counts with weekends on/off across DST; browser test covers count controls, navigation, reload and mini-calendar selection; web typecheck. |
| 7 | Grid density | Pending | — |
| 8 | General preferences | Pending | — |
| 9 | Labeled time zones | Pending | — |
| 10 | Travel time zones | Pending | — |
| 11 | Cross-period search | Pending | — |
| 12 | Commands and shortcut discovery | Pending | — |
| 13 | Formatted descriptions | Pending | — |
| 14 | Participant response notes | Pending | — |
| 15 | Merged event presentation | Pending | — |
| 16 | Multiple event selection | Pending | — |
| 17 | Bulk event changes | Pending | — |
| 18 | Focus time | Pending | — |
| 19 | Out of office | Pending | — |
| 20 | Birthdays | Pending | — |
| 21 | Event-type conversion | Pending | — |
| 22 | Contact search | Pending | — |
| 23 | Room booking | Pending | — |
| 24 | Teammate overlays | Pending | — |
| 25 | Teammate drag-to-create | Pending | — |
| 26 | Conferencing defaults | Pending | — |
| 27 | Zoom generation | Pending | — |
| 28 | Meeting join actions | Pending | — |
| 29 | Page and link attachments | Pending | — |
| 30 | Workspace sources | Pending | — |
| 31 | Database date projection | Pending | — |
| 32 | Database grid scheduling | Pending | — |
| 33 | Unscheduled database items | Pending | — |
| 34 | Database property editing | Pending | — |
| 35 | Database duplication and moves | Pending | — |
| 36 | Meeting notes | Pending | — |
| 37 | Automatic meeting notes | Pending | — |
| 38 | Home upcoming events | Pending | — |
| 39 | Individual and bulk blocking | Pending | — |
| 40 | Automatic blocking rules | Pending | — |
| 41 | Blocking recovery | Pending | — |
| 42 | One-off scheduling drafts | Pending | — |
| 43 | Public booking | Pending | — |
| 44 | Recurring availability | Pending | — |
| 45 | Booking management | Pending | — |
| 46 | Event-to-availability conversion | Pending | — |
| 47 | Invitation notifications | Pending | — |
| 48 | Meeting alerts | Pending | — |
| 49 | Upcoming meeting context | Pending | — |
| 50 | Desktop tray agenda | Pending | — |
| 51 | Global shortcuts | Pending | — |
| 52 | Desktop background lifecycle | Pending | — |
| 53 | Native scale controls | Pending | — |
| 54 | Local event links | Pending | — |
| 55 | Account lifecycle | Pending | — |
| 56 | Connection health | Pending | — |
| 57 | Language selection | Pending | — |

## Release acceptance

Implementation status is not live-provider certification. Google/Zoom live checks and macOS/Windows acceptance remain pending. Public scheduling remains disabled until concurrency, privacy and recovery checks pass.
