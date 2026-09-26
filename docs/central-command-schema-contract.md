# Central Command Schema Contract

This document defines the tables in each client ERP database that
**Server Company Central Command** reads from and writes to.  Central
Command is a separate application that Web Master Consultancy operates
to manage all client company ERP instances from one place; the client
side lives in its own repository:
[dennisgoh84-webmaster/websoft-service-erp](https://github.com/dennisgoh84-webmaster/websoft-service-erp).

The tables listed here are the API boundary between the two systems.
**This doc is kept in both repos** — breaking changes to these tables
must be coordinated with the client ERP repo and mirrored in its copy.

See [planned-work.md §8](https://github.com/dennisgoh84-webmaster/websoft-service-erp/blob/main/docs/planned-work.md#8-server-company-central-command----remote-adbanner-push--license-enforcement-raised-2026-09-12)
in that repo for full context and open questions.

---

## 1. Advertisement / Banner Push

Central Command pushes ads/banners into client databases.  Different
clients can see different ads -- the selection is made at Central
Command, not at the client side.

### `announcements` table

| Column | Type | Purpose |
|---|---|---|
| `id` | `uuid` PK | Unique identifier per announcement |
| `tag` | `varchar(30)` nullable | Short label shown as a badge (e.g. "New", "Update") |
| `text` | `text` not null | One-line announcement message |
| `sort_order` | `integer` not null, default 0 | Display order (ascending) |
| `is_active` | `boolean` not null, default true | Soft-delete: false hides the announcement |
| `source` | `varchar(10)` not null, default `'local'`, check in (`'central'`, `'local'`) | Who owns the row (added 2026-09-24). Central Command stamps every pushed row `'central'`; the client ERP treats those as **read-only** (403 on edit/hide/delete). `'local'` rows are the client's own "company announcements" — Central Command never reads or writes them. |
| `created_at` | `timestamptz` | Auto-set on insert |

**Central Command writes**: `INSERT`, `UPDATE`, and soft-delete
(`is_active = false`), always with `source = 'central'` (the upsert's
`ON CONFLICT ... DO UPDATE` sets it too, so rows pushed before the
`source` column existed become `'central'` on their next push).  The
client ERP renders `WHERE is_active = true`, Central Command's rows
first (`source = 'central'`), then its own, each group `ORDER BY
sort_order`.  Pushes are one-way (2026-09-24): the client cannot edit,
reorder, hide or delete a `'central'` row, so hide/show and ordering
are set in Central Command and mirrored by the next push (which sends
hidden rows too, as `is_active = false`).

**Central Command's own code**: `App\Services\ClientDbService::pushAnnouncements()`
**Client source model**: `backend-php/app/Models/Announcement.php`

### `ad_banner_settings` table

Split 2026-09-16 from a fixed-`id=1` singleton into two independent
rows, keyed by `slot` — `login` (the client's Login page, before
signing in) and `app` (the banner shown alongside the sidebar on every
page after signing in). Each slot's promo video is independently either
an external URL or a file the client uploaded locally; Central Command
can only push a URL to either slot (see below).

| Column | Type | Purpose |
|---|---|---|
| `slot` | `varchar(20)` PK | `'login'` or `'app'` |
| `video_url` | `varchar(1000)` nullable | URL of this slot's promo video, if not using an uploaded file |
| `video_stored_filename` | `varchar(255)` nullable | Set only when the client uploaded a file locally for this slot — Central Command never writes this |
| `video_original_filename` | `varchar(255)` nullable | ″ |
| `video_content_type` | `varchar(100)` nullable | ″ |
| `video_file_size_bytes` | `bigint` nullable | ″ |
| `managed_by_central_command` | `boolean` not null, default false | Added 2026-09-24. `true` while Central Command owns this slot's video: the client's own admin screen is locked for it (403 on save/upload/remove). Set on every non-empty URL push; cleared when Central Command pushes an empty URL, which hands the slot back to the client. |
| `updated_at` | `timestamptz` | Auto-updated on write |

**Central Command writes**: `UPDATE ... WHERE slot = :slot` to set or
clear one slot's promo video URL. A push is necessarily URL-only —
there is no mechanism to transfer an uploaded file's bytes to a remote
client — so it also clears that slot's `video_stored_filename` and the
other three upload columns, superseding whatever the client had
uploaded locally for that slot, the same way saving a URL from the
client's own admin screen does. The same statement sets
`managed_by_central_command` to whether the pushed URL is non-empty
(one-way lock, see the column above); pushing a hidden video from
Central Command sends an empty URL, i.e. clears and releases the slot.

**Central Command's own code**: `App\Services\ClientDbService::pushVideoUrl()`
(takes a `slot` argument), backed by its own `video_settings` table
(now also `slot`-columned — see `App\Models\VideoSetting`).
**Client source model**: `backend-php/app/Models/AdBannerSettings.php`

---

## 1b. Remote Upgrades (added 2026-09-24)

Central Command starts an upgrade or rollback of a client install by
writing a row into the client's `upgrade_requests` table; a systemd
timer on the client's own host (`deploy/upgrade-agent.sh`) picks it up
within a minute, runs `deploy/upgrade.sh <target_ref>`, and reports
back. Central Command never runs code on the client — it only queues
work and reads the result. The client's database is never restored by
an upgrade or rollback, only migrated forward.

### `upgrade_agent_state` table (singleton, `id = 1`)

Written by the client's agent on every heartbeat; **read-only for
Central Command.**

| Column | Type | Purpose |
|---|---|---|
| `id` | `smallint` PK | Always `1` |
| `current_sha` | `varchar(40)` | Commit checked out on the host |
| `current_subject` | `text` | Its commit message subject |
| `current_committed_at` | `timestamptz` | Its commit date |
| `remote_sha` / `remote_subject` / `remote_committed_at` | ″ | Same for `origin/main` as last fetched |
| `commits_behind` | `integer` | `HEAD..origin/main` count — 0 means up to date |
| `agent_host` | `varchar(200)` | Hostname the agent runs on |
| `last_heartbeat_at` | `timestamptz` | Agent is considered offline after 5 minutes without one |

### `upgrade_requests` table

| Column | Type | Purpose |
|---|---|---|
| `id` | `uuid` PK | Central Command generates it |
| `kind` | `varchar(10)` | `'upgrade'` or `'rollback'` (label only; both check out `target_ref`) |
| `target_ref` | `varchar(80)` | Commit sha (normally `remote_sha`, or a previous `from_sha` for a rollback) |
| `status` | `varchar(10)` | `pending` → `running` → `succeeded` \| `failed`; `cancelled` only from `pending` |
| `requested_by` | `varchar(200)` | `central-command:<admin uuid>` |
| `requested_at` / `started_at` / `finished_at` | `timestamptz` | Lifecycle timestamps |
| `from_sha` / `to_sha` | `varchar(40)` | Commit before / after the run |
| `log` | `text` | Tail of `deploy/upgrade.sh` output (≤ 60 KB) |
| `error` | `text` | Short failure reason |

**Central Command writes**: `INSERT` with `status = 'pending'` (refused
by its own code while another request is pending/running), and `UPDATE
... SET status = 'cancelled' WHERE status = 'pending'`. Everything else
is written by the client's agent through its own API.

**Central Command's own code**: `App\Services\ClientDbService::readUpgradeStatus()`,
`requestUpgrade()`, `cancelUpgradeRequest()`
**Client source**: `backend-php/app/Models/UpgradeRequest.php`,
`UpgradeAgentState.php`, `deploy/upgrade-agent.sh`

---

## 2. License Enforcement

Central Command disables/enables module licenses remotely for non-paying
or subscribing customers.

### `company_modules` table

| Column | Type | Purpose |
|---|---|---|
| `id` | `uuid` PK | Row identifier |
| `company_id` | `uuid` FK → `companies.id` | Which company this module license belongs to |
| `module_key` | `varchar(50)` FK → `modules.key` | Which module (e.g. `billing`, `finance_accounting`) |
| `enabled` | `boolean` default false | **The switch**: `false` disables the module for this company |
| `license_type` | `enum(included, add_on, trial)` | License category |
| `notes` | `text` nullable | Admin notes |
| `enabled_at` | `timestamptz` nullable | When the module was enabled |
| `updated_at` | `timestamptz` | Auto-updated on write |

**Central Command writes**: `UPDATE company_modules SET enabled = false`
to expire a module for a non-paying client, or `SET enabled = true` to
restore it.  May also update `license_type` and `notes`.

**Unique constraint**: `(company_id, module_key)` — one row per module
per company.

**Central Command's own code**: `App\Services\ClientDbService::pushLicenseChange()`
**Client source model**: `backend-php/app/Models/CompanyModule.php`

### `modules` table (read-only reference)

| Column | Type | Purpose |
|---|---|---|
| `key` | `varchar(50)` PK | Module identifier (e.g. `crm`, `billing`) |
| `name` | `varchar(100)` | Human-readable name |
| `description` | `text` nullable | What the module does |
| `is_built` | `boolean` default false | Whether application code for this module exists |

**Central Command reads**: to discover the available module keys when
building UI for license management.  Does not write to this table.

**Client source model**: `backend-php/app/Models/ModuleCatalog.php`

---

## 3. Client Identification

### `companies` table (relevant columns)

| Column | Type | Purpose |
|---|---|---|
| `id` | `uuid` PK | Company identifier within this client database |
| `code` | `varchar(10)` unique | System-generated short code, `C001`, `C002`, … in creation order; never edited |
| `name` | `varchar(200)` | Company name |
| `uen` | `varchar(50)` nullable | Singapore UEN / business registration number |

Central Command uses the `companies` table to identify which companies
exist in a client database and map them to its own client registry.

**Client source model**: `backend-php/app/Models/Company.php`

---

## 4. How the client ERP enforces licenses

The enforcement point is `App\Services\Authority::requireModuleAccess()`
(`backend-php/app/Services/Authority.php`). On every API call that
touches a gated module, this function:

1. Looks up `CompanyModule` for `(current_user.company_id, module_key)`
2. If the row doesn't exist or `enabled = false`, returns **403
   Forbidden** — the user cannot access that module
3. The frontend sidebar also checks module access and hides nav items
   for disabled modules (see `Layout.tsx :: can()`)

Central Command's `UPDATE company_modules SET enabled = false` therefore
takes effect on the next API call the client makes — no restart needed,
no cache to invalidate.

---

## 5. Schema versioning

**Contract change 2026-09-15, resolved on Central Command's side
2026-09-16.** The client ERP retired its Python/Alembic backend — there
is no `alembic_version` table on any client database any more. Central
Command now checks Laravel's own `migrations` table instead:

```sql
SELECT migration FROM migrations ORDER BY batch DESC, id DESC LIMIT 1
```

That row's `migration` value (the latest applied migration filename,
e.g. `2026_09_30_000100_create_system_mail_settings_table`) is what
Central Command calls the client's **migration head** — stored on
`clients.last_known_migration_head`, checked before every write via
`App\Services\ClientDbService::checkMigrationHead()`. (Which code a
client runs is its upgrade agent's report, shown in Client Upgrades as
"Version abc1234 · DD/MM/YYYY" -- the same wording as its login screen.)

`checkMigrationHead()` also optionally refuses a client whose head is
behind `centralcommand.min_client_migration_head`
(`CC_MIN_CLIENT_MIGRATION_HEAD`) — unset by default (no floor), since
Laravel's date-prefixed migration filenames already sort correctly as
plain strings, no version parsing needed. Renamed 2026-09-16 from the
dead pre-Laravel `min_client_alembic_head` config, which nothing ever
actually read.

Current head: the last file in `backend-php/database/migrations/`.

---

## 6. Settled decisions (resolved 2026-09-12, schema versioning updated 2026-09-16)

1. **Client DB connection registry** → DECIDED: Central Command's own
   database has a `clients` table with host, port, db_name, username,
   password, TLS flag per client.  Admin adds clients via the UI.
2. **Network access** → DECIDED: Internet with TLS + auth.  Each
   client's PostgreSQL is exposed with TLS encryption and credentials.
3. **Schema versioning** → DECIDED: read the client's migration head
   before writing, refuse if incompatible. ~~`alembic_version` table~~
   → Laravel's `migrations` table since 2026-09-15 (see §5).
4. **Ad targeting rules** → DECIDED: Manual per-client.  Admin assigns
   ads to specific client instances via the UI.
5. **Audit trail** → DECIDED: Central Command's own `push_logs` table
   only.  Don't log in the client's Event Logs.
6. **Scope beyond ads and licenses** → DECIDED: Yes, config updates
   too.  Push SQL-based configuration changes (tax rate updates, new
   default settings) to client databases.  **REVERSED 26/09/2026**
   (Dennis): Config Updates removed from Central Command -- raw SQL run
   on every client's live database, with no preview or undo, was too
   risky. Changes to a client's database ship through upgrades
   (migrations) instead. The `config_updates` / `config_push_logs`
   tables are left in Central Command's own database, unused.

---

## 7. Server/system configuration push (`planned-work.md #8c`, built 2026-09-16)

Central Command owns the client install's **system-level** mailboxes
centrally and pushes them down, rather than each install hand-editing
`backend-php/.env`. Distinct from each company's own document-email
mailbox (Company Setup → Outbound email), which stays entirely
client-side and Central Command never touches.

### `system_mail_settings` table

| Column | Type | Purpose |
|---|---|---|
| `purpose` | `varchar(20)` PK | `otp` (sign-in codes, password resets, portal invites) or `helpdesk` (Outlook Add-in acknowledgements) |
| `host` | `varchar(255)` nullable | SMTP host |
| `port` | `integer` default 587 | SMTP port |
| `username` | `varchar(255)` nullable | SMTP username |
| `password` | `text` nullable | **Encrypted at rest via the client's own Eloquent `encrypted` cast** — see below |
| `use_tls` | `boolean` default true | STARTTLS on/off |
| `from_email` | `varchar(255)` nullable | Sender address |
| `from_name` | `varchar(255)` nullable | Sender display name |
| `updated_at` | `timestamptz` | Auto-updated on write |

**Central Command writes**: `UPSERT ... ON CONFLICT (purpose) DO UPDATE`,
one row per purpose. A push with an empty password leaves the client's
existing password untouched (`COALESCE` against the current value)
rather than clearing it.

**The password column is not a plain write target.** The client's own
`SystemMailSetting` model casts it `'password' => 'encrypted'` —
Laravel transparently encrypts on write and decrypts on read using
*that install's own* `APP_KEY`. A raw plaintext write would leave a
value the client's app cannot decrypt, breaking mail silently. Central
Command reproduces the client's own encryption instead of trying to
work around it: it stores that client's `APP_KEY` (`clients.app_key`,
never returned by the API, same treatment as `db_password`) and uses
Laravel's own `Illuminate\Encryption\Encrypter` — available in Central
Command's own `vendor/laravel/framework`, since both apps are Laravel —
to produce ciphertext byte-for-byte identical to what the client's own
cast would have written.

**Central Command's own code**: `App\Services\ClientDbService::pushSystemMailSetting()`
and `::encryptForClient()`
**Client source model**: `backend-php/app/Models/SystemMailSetting.php`

---

Last updated: 2026-09-16 (fixed against a real client install: `companies.registration_number` renamed to `uen`, `min_client_migration_head` push guard wired up and renamed from the dead pre-Laravel `min_client_alembic_head`; schema versioning switched to Laravel migrations; System Mail Settings push built)
