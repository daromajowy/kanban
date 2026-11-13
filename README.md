# InteliSpaces Team / CRM and Kanban

Production: https://team.intelispaces.pl/. React and TypeScript are served by a same-origin Laravel 13 API on cyber_Folks, with a dedicated MariaDB database. Authentication, task documents and original photos no longer require Supabase. The legacy GitHub Pages workflow publishes a fixed redirect only.

## Signing in

Existing confirmed accounts keep their existing password. Every account must enroll an authenticator at its first sign-in, confirm a six-digit code, and save the ten recovery codes. Each recovery code works once. A password alone never grants access to a board or photo. Password reset preserves MFA and revokes existing sessions. An account that was invited but never activated can use the password-reset form to establish its password through its own mailbox.

There is no public registration. Board access is determined by the server's membership records. Editable names and roles in the project roster are labels; they cannot grant account access. Provisioning, revocation and MFA recovery require a trusted server administrator and independent identity verification. Never reset MFA merely because someone knows an email address or password.

## Security boundaries

- HTTPS and HSTS; host-only Secure, HttpOnly, SameSite=Strict cookies; encrypted database sessions, with 24-hour inactivity and seven-day absolute limits. Sessions survive closing the browser; explicit logout, password reset and account revocation still invalidate access.
- CSRF and origin validation, server-side membership checks on every board/photo request, login and MFA throttling, single-use TOTP time steps and hashed recovery codes.
- Application-level authenticated encryption for board documents, revisions, original photo files and MFA secrets. Passwords use bcrypt. The application key and database/mail credentials remain in the private server environment, outside source control and release archives.
- Images are immutable, MIME/content checked and size limited, and require an authenticated, MFA-verified member to download. Public signed image URLs are not used. Photos removed from a card remain in encrypted storage to avoid losing originals.
- A restrictive CSP, no external fonts or analytics, no public database connection, no debug output, and no indexing. Authentication/security events are recorded without task content or passwords.

The dedicated domain has cyber_Folks PHP separation enabled. This is shared hosting under the hosting account, not a separate operating-system security boundary. The hosting administrator and a compromised account with the application key remain privileged. Keep hosting access, the workstation and recovery material protected, and maintain framework/dependency updates.

## Development and verification

Use Node.js 24, PHP 8.4 with PDO SQLite/MySQL, mbstring, GD and ZIP, and Composer. Run `npm ci --legacy-peer-deps`, `npm run lint`, `npm test`, and `npm run build`. In `backend`, install Composer dependencies, copy `.env.example` to a private `.env`, generate a unique key and migrate a local SQLite database. For local HTTP only, set `APP_ENV=local`, a localhost APP_URL, `SESSION_SECURE_COOKIE=false`, and a cookie name without the `__Host-` prefix.

Copy the built `dist/index.html` to `backend/public/spa.html`, and the `dist/assets` and `dist/fonts` directories to `backend/public`. Serve Laravel on localhost. `/dev/preview.html` through Vite is an isolated synthetic-data UI preview, excluded from the production build. Never use production data or credentials in a public preview.

Backend checks: `php artisan test --compact` and `php vendor/bin/pint --dirty --format agent`. The feature suite covers authorization, MFA enrollment/replay/recovery, session expiry and revocation, CSRF/origin, optimistic concurrency, task round trips, private files, and encrypted backup/restore. Historical Supabase regression tests remain as documentation of the migrated data contract; no Supabase client is included in the production application bundle.

## Deployment

`scripts/package-team.py --output <new-private-build-directory> --composer <composer.phar>` builds a production archive from the checked frontend and an explicit backend allowlist. It installs locked production dependencies and excludes environments, databases, uploads, tests and development tools. Verify the resulting SHA-256 before upload.

`scripts/deploy-team.py` is a guarded first-install tool for the dedicated team domain and empty application directory. It deliberately refuses an existing installation. Updates must preserve `.env`, database contents and `storage`, retain the previous code release, and run package discovery, configuration/route caching and any reviewed forward migrations. Never run `migrate:fresh` on a live board.

The web root exposes only the gateway and public assets. The private `app` subtree is denied at both the root and subtree by Apache rules; directory listing and dotfile access are blocked. Keep these rules when changing hosting settings. Use a dedicated database user and SMTP identity, with debug disabled. The Let's Encrypt domain certificate is renewed by the existing acme.sh scheduler.

## Migration and recovery

`php artisan team:import <private-export-directory>` imports into an empty destination only. It verifies original image checksums, preserves user IDs and supported password hashes, authoritative memberships, Kanban and strategy JSON and revisions, and verifies imported documents. The extra historical `calendar_events` rows are retained verbatim as an encrypted `calendar_archive` document; neither current source frontend exposes that old standalone table. The calendar deadline view continues to derive its data from tasks.

Before cutover, freeze source writes, save source permissions for rollback, take a final consistent export, import and verify, then disable old application access and publish redirects. Keep the source snapshot as a private rollback archive; do not make both backends writable. The temporary photo-transfer endpoint must remain disabled after copying.

`php artisan team:backup` produces an encrypted archive and verifies every original photo checksum and document decryption before finalizing it. Photo ciphertext is streamed into the archive rather than loading all attachments into memory. The encrypted manifest contains accounts, memberships, documents, history and audit events; session cookies and password-reset tokens are excluded. Run the scheduler every minute with PHP 8.4 and 512 MB CLI memory; backups run daily at 02:20 Europe/Warsaw. Successfully verified backups older than 14 days are rotated only after a new verified copy exists. Review the private backup log for failures.

`php artisan team:backup --verify=<file>` checks an archive. `php artisan team:restore <file>` restores only to an empty migrated database and empty photo storage, and invalidates sessions. Restore requires the corresponding APP_KEY. Keep an encrypted backup off the hosting account and preserve the key separately in protected administrator storage. A same-server backup alone does not protect against loss of the hosting account. Regularly test a restore in an isolated environment. Restore data only for disaster recovery; a code rollback must preserve newer live edits.

## Working with boards

Kanban stages, multiple responsible people, rich text, photos, comments, checklists, colors and exports retain their existing behavior. The deadline view reads task dates. Strategy cards support multiple parent connections, independent branch copying, editable tasks, colors and drag positioning. Deleting a parent preserves its children; cycle validation rejects loops.

Board saves use revision compare-and-swap. A concurrent change is rejected rather than overwriting someone else's edit; drafts stay available for retry. Polling refreshes shared data, while background refreshes alone do not keep an idle login alive. Theme, zoom and collapsed branches are local view preferences. Exports are explicit downloads and may contain important data; store them with appropriate access controls.


## CRM workspace

The authenticated landing screen is the CRM; its sidebar switches to Kanban and strategy without a second login. It includes companies, contacts, editable categories/tags, a configurable sales pipeline, investments and their participants, contact history, follow-up tasks, a calendar, versioned offers, private PDF/images, lead sources, sales reports, automation rules and after-sales records. Subiekt integration and spreadsheet/CSV importing are intentionally excluded.

Records have an owner and team or restricted visibility. Access is also constrained by every parent record; only the owner or an authoritative administrator may change sharing or archive the record. Team editors can update permitted content. Every write uses a record revision, stores encrypted history and validates related-record membership. Administrators can configure stages and automation rules. Shared Kanban roster roles do not grant CRM access.

The Designers tab has a color-category board and list view, individual collaboration strategies, searchable dated notes, and filters for category, strategy, city and owner. Administrators can rename, recolor and reorder categories and edit the proposed strategies; options assigned to active records cannot be removed. Designer profiles and their notes use the same encrypted records, access checks, version history and backups as the rest of the CRM. Excel data will be imported separately through a reviewed administrator operation; no spreadsheet import interface is included.

Outlook correspondence is linked explicitly using HTTPS message links on Microsoft Outlook domains. The app neither holds Microsoft mailbox credentials nor automatically reads/sends email. The authenticated user opens the original message in their own Microsoft account. CRM notes can hold the agreed summary.

Attachments are authenticated downloads (PDF, JPEG, PNG or WebP, maximum 5 MiB), encrypted outside the public directory with integrity checks. The existing 1 GiB board quota now includes both Kanban images and CRM documents. Archived records and files remain available in encrypted backup/history; archiving a parent also hides its descendants from normal views.

Offers keep separate numbered versions and per-version PDFs. Reports separate currencies and derive conversion only from won/lost deals; the weighted forecast uses configured stage probabilities. No currency conversion or invented demo revenue is displayed in production. CRM follow-ups can link an existing Kanban task or create a generic shared task; client titles, dates and private notes are not copied into the shared board. The two records retain their own statuses.

The existing minute scheduler runs team:crm-reminders every five minutes. It generates private in-app notices for due work and executes configured inactivity rules. Offer-sent and stage-change rules run in the same transaction as their triggering record update. Unique event keys prevent duplicate tasks/notices on repeated scheduler runs. Notifications are filtered by current record permissions, and recipients must be active members with access. These automations do not send client mail.

Backups use format v3 and include CRM records, revisions, settings, notices, automation deduplication keys and all encrypted attachments. The reader also accepts legacy v1/v2 backups. Restore still requires an empty destination, does not restore sessions, and verifies bytes before committing. A code rollback must retain the additive CRM tables and newer data.

For browser QA only, php artisan db:seed --class=CrmDemoSeeder creates explicitly fictitious data and a local test account. It refuses non-local environments, non-SQLite databases and nonempty user tables. The seeder is excluded from production release packages. The local UI visibly labels all data as synthetic.
