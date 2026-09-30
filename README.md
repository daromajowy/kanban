# Delitech Kanban
React + TypeScript on GitHub Pages, with shared board data and authentication in Supabase.

## Local development
Use Node.js 24. Run `npm ci --legacy-peer-deps`, then `npm run dev`.
`npm run lint`, `npm test` and `npm run build` are the deployment checks.
A separate development-only entry at `/dev/preview.html` contains synthetic data for visual and drag-and-drop testing. It is not included in the production build and never grants database access.

## Authentication and data access
There are no embedded account passwords or master codes. The production entry always verifies the Supabase user and protected membership before mounting the workspace. Old local auth/session records are removed.

`src/config.public.json` contains only the project's public API URL, publishable key and board ID. These identifiers are deliberately public; the database protects data independently. A separate deployment can override them with the three variables in `.env.example`. Never use a secret or service-role key in the frontend.

The migration in `supabase/migrations` creates:
- `kanban_boards`: board data with revision numbers;
- `kanban_members`: authoritative user-to-board grants, readable only by the relevant user;
- `save_kanban_board`: the only browser write route, checking authenticated membership and the expected revision in one transaction.

Anonymous access, direct table updates and browser changes to membership are denied. Any authorized member can edit board content; the editable roster and role labels inside that content never confer login rights. A changed browser role cannot grant access. The RPC's SECURITY DEFINER advisory is expected: its entry checks auth.uid() and membership, it has an empty search_path and its EXECUTE grant excludes anonymous users.

## Initial setup and inviting people
1. Apply the migration to the intended Supabase project and create a board.
2. In Supabase Authentication → URL Configuration, set the deployed app URL, including its GitHub Pages subdirectory. Add only the exact production/preview redirect URLs you use.
3. Disable public signups and anonymous sign-in in Authentication → Sign In / Providers. Configure the password minimum to 12 characters. Membership RLS still denies outsiders independently of signup settings.
4. Invite a user through Authentication → Users. They set their own password. Set a sufficiently long invite expiry for onboarding only if needed; do not publish invite links.
5. After the user row exists, grant board membership in the trusted SQL editor. Example (replace the placeholders, use an exact auth.users email):

```sql
insert into public.kanban_members (board_id, user_id, display_name, role)
select '<board-uuid>'::uuid, id, 'Display name', 'admin'
from auth.users where email = '<invited-email>';
```

Use role `member` for teammates. Revoke access by deleting the corresponding `kanban_members` row. No browser account can edit these grants, including an app admin. Deleting someone from the editable project roster only unassigns their tasks; it does not revoke access.

Default Supabase email sending has restrictions. If invitations or password reset emails are blocked, configure a transactional SMTP provider in the dashboard; never place SMTP credentials in this repository.

## Existing data
Old tasks stay in their browser storage until explicitly imported. On the same origin/browser, the first admin can use Eksport → Importuj lokalne zadania while the cloud board is empty. Only tasks, roster and stages are accepted; old credentials and permissions are not imported. A fork/preview uses a different origin, so it cannot read local data from the original GitHub Pages address.

## Collaboration
Changes use revision compare-and-swap. If another person saves first, the stale write is rejected, the current board is loaded, and the user can retry; a task form remains open with its draft. The board refreshes every 15 seconds and on window focus. A failed write rolls back locally and shows an error; unsaved changes are not presented as a successful save.

Custom stages are inserted before Zrobione. The built-in `done` stage is the completion stage used by deadline calculations. Drag by the grip with a mouse or long press on touch; space, arrows and space support keyboard movement. Every card also has a stage selector. Card ordering is stored in the task array and preserved when filters are active.

Stages can also be dragged by their heading grip, including Zrobione. Moving a stage changes only its position, never its task statuses. The heading menu offers eight colors and left/right buttons as an alternative to dragging. Stage order and colors are saved through the same revision-protected board write as tasks.

The header's sun/moon buttons select a white or dark gray appearance. This is a per-browser preference (`kanban-theme` in local storage), independent of shared board data. Compact cards retain assignment, stage selection and checklist progress; opening a card shows its full title and description.

CSV, Markdown and full JSON exports include custom stages. Export is explicit and local; there is no simulated GitHub sync.

## Deployment
Enable GitHub Pages with GitHub Actions as its source. The deployment workflow uses the same checked source and public config; it does not apply migrations or create accounts. Merge the reviewed change only after the backend and first account are ready. The previous site remains vulnerable until the new frontend is actually deployed.

Keep `package-lock.json` committed: both the dependency cache and `npm ci` require it. Use Node.js 24 for the same toolchain as CI.

Rollback the frontend by redeploying its previous commit only with awareness that the old auth was client-side. The new database does not expose old credentials and is independent of the old local storage; preserve it when troubleshooting.

