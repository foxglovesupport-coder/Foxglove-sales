# Foxglove Sales Management — Login Phase

## 1. Configure
Copy `config.example.js` to `config.js` and replace:
- `SUPABASE_URL` with Project URL
- `SUPABASE_PUBLISHABLE_KEY` with publishable key (`sb_publishable_...`) or legacy `anon` key.

**Never use the service_role key, sb_secret key, or database password in frontend code.**

## 2. Supabase Authentication settings
Dashboard > Authentication > URL Configuration:
- Site URL: your actual website origin (e.g. `http://localhost:5500` during local development)
- Redirect URLs: add `http://localhost:5500/**` for local testing, and later your actual HTTPS production URL.

If password reset emails are not arriving, inspect Auth email configuration and rate limits. For production, configure custom SMTP.

## 3. Run locally
Serve the folder with a local HTTP server (do not double-click `index.html`):

```bash
python -m http.server 5500
```

Open http://localhost:5500/ . Alternatively use VS Code Live Server.

## 4. Test
- Sign in with your existing Supabase Auth email/password.
- Confirm profile role displays as Superadmin.
- Test password show/hide, logout, forgot password and mobile width.
- Test wrong credentials and archived account.

## Important security note
The previous `profiles` RLS policies allow managers to read profiles, but do **not** by themselves revoke all database access from an archived user. In later phases every business table and Edge Function must explicitly check `status='active'` and enforce row permissions. No admin creation or management actions are enabled in this phase.

## Logo
`assets/foxglove-logo.png` is cropped from the provided screenshot, so its quality is limited. Replace it with the original high-resolution Foxglove logo (same filename) for a sharper result.


## Form Builder Pro (new)
1. Log in as an active admin/superadmin. Open Form Builder and click **Create New Form**.
2. Enter a name and description, then click **Create Form**. This saves a draft in Supabase immediately.
3. Use the field palette on the left to add fields. Click a field on the right to edit its label, type, placeholder, options, and required flag.
4. Right canvas shows two fields per row on desktop; Long Text spans the full width. Use Up/Down/Remove on each field.
5. **Save Fields** persists fields. **Full Preview** opens a working input layout without submitting data. **Publish Form** requires at least one valid field.

Supabase must already have `forms` and `form_fields` tables with appropriate RLS policies. Frontend source cannot create these tables or grant access.

## Phase 6 — Form Assignment and Submissions
1. **Required database setup:** In your existing Supabase project open **SQL Editor → New Query** and run the complete `PHASE6_SUPABASE.sql` once. Keep your existing forms and form_fields tables; the script adds assignment/submission tables and RLS policies.
2. Refresh your hosted/local website. Sign in as an active admin. Open **Form Assignment**, choose a published form and an active employee, then click **Assign Form**.
3. Log in as that employee. Open **My Forms**, choose **Fill Form**, enter data and **Submit Form**.
4. Admin can open **Submissions** to see latest 200 submissions and expand their answers.
5. Admin can **Unassign** a form; past submissions remain stored. Employee sees recent submissions in My Forms.

**Security/production notes:** RLS restricts new assignment and submission tables, but existing forms/form_fields/profiles policies should be reviewed. The form answers are stored as JSON keyed by field ID. Database-level field validation, transactional publication/versioning, pagination/export, and audit entries for assignments/submissions are not included. Do not use this for sensitive production data without a security review.

## Phase 7 — Archive, Delete, All-account Assignment
Run `PHASE7_SUPABASE.sql` in Supabase SQL Editor AFTER `PHASE6_SUPABASE.sql`.
- Admin and Superadmin can archive/restore published forms. Archive hides the form from assignment choices and My Forms, preserving assignments and historical submissions.
- Only active Superadmin can permanently delete a form (including its assignments, fields, submissions). This cannot be undone; back up data before deleting.
- Admin and Superadmin can assign published, non-archived forms to ANY active account, including Admin and Superadmin.
- Published form cards have a polished bordered layout and action buttons.
- Existing profile visibility policies must allow admins to read all active profiles; otherwise the dropdown will show only profiles visible under current RLS.
- Live Supabase end-to-end verification has not been performed; review existing RLS policies before production use.

## Phase 8
See `PHASE8_NOTES.md` for Reports & Analytics setup, limits and security notes.
