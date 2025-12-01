# Agent Notes

## Project Goal
Build a single Next.js (App Router) app that includes backend Route Handlers to deliver a multi-tenant employee time/leave/payroll tracking platform with roles: Superadmin, Org Admin, Manager, Employee.

## Architecture Quickview
- Next.js frontend + Route Handlers for APIs (BFF).
- Postgres with Prisma; every table scoped by `org_id`; enforce RBAC in middleware.
- Storage: S3-compatible for screenshots; DB stores metadata.
- Queue/worker script (BullMQ + Redis) for retention cleanup, exports, notifications.
- Audit log: append-only for any manual change (attendance, salary, leave).

## Desktop Agent (.exe) – Distribution & Usage Flow

Goal: single Windows Electron app (one .exe) for all roles; includes UI shell + background service (tray) so no separate screenshot exe is needed.

1) Org onboarding
- Superadmin creates the organisation, assigns plan/limits.
- Org Admin receives access to the web dashboard.

2) Agent distribution
- Org Admin goes to: Org Settings → Devices / Desktop Agent.
- Downloads the standard Windows `.exe` for the agent (one installer for all roles).
- (Optional) Copies an org code/subdomain that the agent will use on first launch.

3) Installation at the organisation
- IT / internal team installs the `.exe` on all relevant PCs (employees, managers, internal admins).
- On first launch, the agent asks for:
  - Org identifier (subdomain/org code), if not pre-configured.
  - Employee ID/email + password (created by the Org Admin in the web dashboard).

4) Account creation & access control
- Org Admin creates all employee/manager/admin accounts in the web dashboard (email/ID + password, role, team).
- Those credentials are used to log into the desktop agent and the web app.
- RBAC is enforced via JWT (org_id + role) for both desktop and web.

5) Daily use (single Electron app with background service)
- Background service auto-starts with the OS (tray), reads cached session + policy, refreshes via `/me` + policy endpoint, and starts capture only when token/org/policy are valid.
- Applies org screenshot policy (on/off, frequency, retention, monitored roles) fetched from backend; includes policy version/updatedAt for change detection.
- Pauses capture if token expires; prompts login to resume. Optional short offline grace with queued uploads; no capture without a valid session.
- Uses existing attendance APIs for clock in/out and breaks; uses pre-signed uploads for screenshots.
- Managers and Org Admins review attendance, screenshots, and DWRs in dashboards (inside the Electron UI shell); they don’t need separate desktop access to manage others.


## Core Modules
- Auth/RBAC: NextAuth (credentials/magic link), JWT contains `org_id`, `role`, `manager_id`. Middleware gates routes; superadmin under `/superadmin`.
- Organisation & Plans: create/suspend/delete orgs, set plan limits (users/screenshots/retention).
- Org Settings: timezone, work hours, grace, breaks, lunch window, screenshot policy, holiday calendar.
- Attendance: clock in/out, breaks (lunch, external), net time calc with grace & deductions, manager/employee views.
- Leave: leave types/balances, requests, approvals (manager -> admin), auto-mark days, balances visible.
- Corrections: employee request -> manager approve -> admin final override.
- DWR: employees submit for today/-2; managers can remark.
- Screenshots: toggle per org, interval/retention, role scope; store metadata; retention cleanup.
- Dashboards: role-specific summaries (superadmin global stats, org admin org-level, manager team, employee self).
- Exports: CSV first (attendance/payroll/leave). Excel later.
- Notifications: in-app first for leave/correction approvals and reminders (e.g., missing clock-out).
- For every field we ship, provide industry-grade UX: clear labels, validation, helpful popovers/tooltips, sensible defaults, and accessible, searchable controls (no bare inputs without guidance).
- Keep agents.md in sync: whenever new instructions arise in chat, add them here so they persist.
- Superadmin sets plan/user limits and defaults; org admins decide screenshot monitoring (including “All roles”) and are responsible for who to track. No screenshot volume estimates in superadmin UI; retention/interval bound storage.
- Design system theme: bold teal/blue gradient with indigo accents, white cards, and dark nav headers. Primary: #0ea5e9, secondary: #6366f1, accent: #0f172a (nav background), success: #10b981, warning: #f59e0b, danger: #ef4444. Apply to globals and UI components for consistent look.
- UI should feel like a premium HRMS experience: gradient/glass cards, strong type hierarchy, confident contrast, and purposeful motion (framer-motion/GSAP) over flat boilerplate layouts.

## Build Order (MVP-first)
1) Foundation: Prisma schema + migrations, DB client, auth, RBAC middleware, audit logger, seed initial superadmin/org admin.
2) Org/Superadmin: org CRUD, plan limits, org settings forms, holiday calendar.
3) Time Tracking: attendance endpoints, net-time calculator, employee dashboard basics, manager team view.
4) Leave & Corrections: leave types/balances, requests/approvals, correction workflow, notifications stub.
5) DWR & Dashboards: employee DWR, manager/team metrics, org admin summaries.
6) Screenshots: metadata endpoints + storage hook, retention cleanup worker.
7) Exports: CSV for payroll/attendance/leave; add Excel if time.

## Guardrails
- Always scope by `org_id` in queries and UI.
- Enforce role checks for every API/UI path.
- Use a single time-calculation function for net hours to keep exports consistent.
- Apply storage lifecycle and worker cleanup for screenshot retention.

## Plans (single product, no feature gating)
- Starter: up to 50 employees.
- Growth: up to 150 employees.
- Scale: up to 500 employees.
- Enterprise: 500+ employees (custom limit).
- All features are available on every plan. Only employee count differs; screenshot retention days are set globally by the superadmin (not per plan). No support tiers or extra add-ons.

## Pricing (Per User)
All plans include ALL features. Pricing is based only on number of employees.

- Starter: Up to 50 employees — ₹100 per user per month.
- Growth: Up to 150 employees — ₹100 per user per month.
- Scale: Up to 500 employees — ₹70 per user per month.
- Enterprise: 500+ employees — ₹70 per user per month.

## Role Features Checklist
- Superadmin: manage orgs (create/suspend/delete), set plans (user/screenshot/retention limits), global defaults (screenshot freq/retention, working hours template), view global usage stats, access global error/audit logs, force-reset org admin passwords, separate console (not inside org UI).
- Org Admin: user/team management (create/update employees/managers, managers are employees, assign to teams/managers, activate/deactivate), org settings (timezone, workday start/end, required minutes, half-day thresholds, lunch window with paid duration/time window, break policy incl external deductions, grace for late/early, holiday calendar with public/off days, mark org-wide holidays), screenshot policy (on/off, interval, retention, roles monitored), attendance & corrections (view all attendance/DWR, exports by org/team/employee, correct clock/break, approve/override correction requests), leave & payroll config (leave types, per-employee quotas, CTC/salary, probation, half-day rules, unpaid leave pay reduction), metrics (frequent late/early, avg hours per team, overtime summary), exports/payroll (monthly export with present/half/leave counts, net_work_hours, external deductions, overtime; CSV + Excel), audit log for all manual changes.
- Manager: scoped to team only; view attendance, external break deductions, DWRs, screenshots; approve/reject leave and timing corrections; see per-employee metrics (daily/weekly/monthly net hours, behind/above required), team dashboard (present/absent/on leave/WFH, avg hours, frequent late/early), fuzzy productivity (screenshot counts; idle/active later), add remarks on DWR/attendance, team-only exports.
- Employee: clock in/out, break in/out (lunch paid, external deducted), DWR for today and last 2 days, self-serve attendance/DWR history, break deductions, net hours vs required (day/month), leave requests (half/full, types per policy), see leave balance/status (pending/approved/rejected), auto-mark day on approval, dashboard summary (this month present/leave/late/overtime, upcoming holidays), notifications (missed clock-out, leave approved).
- Cross-cutting: holiday management is essential; correction workflow employee -> manager -> org admin; basic leave management with balances; audit logs for any manual time/salary change; in-app notifications for new leave/correction requests and approvals/rejections.

you see my project this is what i was making you can se agents.md as well

take it ahead of whats been made



1) Superadmin (your side – platform owner)

Scope: platform-level, not per-organisation.

Responsibilities:

Manage organisations (tenants):

Create / suspend / delete orgs.

Set subscription / plan (limits on users, screenshots, data retention).

Access global error logs and audit logs for support.

Force-reset org admin passwords.

Global configuration:

Default screenshot frequency / retention.

Default working hours template.

View global usage stats:

Number of orgs, users, screenshots stored, etc.

Opinion: Do not expose Superadmin inside any org’s UI. It’s an internal console for you only.

2) Org Admin

Your list is good; I’ll tighten and extend it.

Core powers:

User & team management

Create/update employees and managers.

A manager is also an employee (they must have attendance and payroll like everyone else).

Assign employees to managers / teams.

Activate / deactivate accounts.

Organisation settings

Define org time zone.

Working hours:

Standard workday start/end.

Required minutes per full day.

Half-day thresholds.

Lunch window:

Paid lunch duration.

Allowed lunch time window.

Break policy:

Whether external breaks are allowed.

How they affect net working time (always deducted).

Grace periods:

Late arrival grace (e.g. 10 minutes).

Early leaving grace (optional).

Holiday calendar:

Define public holidays and special off days.

Mark days as organisation-wide holiday (auto present/holiday).

Screenshot monitoring policies

Turn screenshots on/off for org.

Configure:

Interval (e.g. 5 / 10 / 15 minutes).

Retention period (e.g. 30 / 60 / 90 days).

Decide which roles are monitored (e.g. all employees, managers included or excluded).

Attendance & corrections

View full attendance and DWR of all employees.

Export:

All employees.

Single employee.

By team / manager.

Correct wrong:

Clock-in / clock-out

Break-in / break-out

Approve / override correction requests raised by managers or employees (last level).

Leave & payroll configuration

Define leave types:

Paid leave (PL), Casual leave (CL), Sick leave (SL), Optional holiday, etc.

Per-employee settings:

Monthly/annual leave quota per leave type.

CTC / monthly salary.

Probation status (optional).

High-level payroll rules (MVP):

How half-day is treated (half salary / half working day).

How unpaid leave reduces pay (per-day basis).

See:

People frequently late / frequently leaving early.

Average working hours per team/department.

Overtime summary.

Exports & payroll outputs

Monthly payroll export for each employee:

Present days.

Half days.

Different leave counts (PL, CL, SL, unpaid).

Total net_work_hours in month.

Total external break deductions.

Overtime minutes (if any).

Export formats:

CSV and Excel.


Audit log: Every manual change (attendance, salary, leave balance) should be logged with who did it, when, and old/new values.

3) Manager

Managers are employees with extra permissions for their team.

Capabilities:

See only their team’s:

Attendance.

External break deductions.

DWRs.

Screenshots.

Approve / reject:

Leave requests from their team.

Timing corrections (missing punch, wrong break).

View per-employee metrics:

Daily / weekly / monthly net working hours.

How many hours an employee is behind or above required hours.

Team dashboard:

Present / Absent / On Leave / WFH today.

Average working hours in team.

People with frequent lateness / early leaving in their team.

Fuzzy productivity:

Screenshots count in the day.

(Later) idle vs active time if you track it.

Managers can add remarks on DWR or attendance.

Manager-level export for only their team.

4) Employee

Capabilities:

Time tracking:

Clock in / clock out.

Break in / break out:

Lunch (paid).

External (deducted).

DWR:

Fill Daily Work Report for:

Today.

Last 2 days.

Self-serve information:

See:

Own attendance history.

DWR history.

Break deductions per day.

Total net working hours vs required hours (per day / month).

Leave:

Add leave requests:

Half-day.

Full-day.

Leave types (PL, CL, SL, WFH etc. depending on policy).

See leave balance and status:

Pending / Approved / Rejected.

Once approved:

That day is marked automatically according to leave type.


Employee dashboard:

Quick summary:

This month: Present days, leave days, late days, overtime.

Next coming holidays.

Notifications:

“You forgot to clock out yesterday.”

“Your leave for 10 March was approved.”





----------these points as well ----------

Holiday management (Org Admin)

Essential for correct attendance/payroll.

Correction workflow

Employee raises correction → Manager approves → Org Admin final override.

Without this, real-world usage becomes a mess.

Basic leave management

Leave requests + approvals + balances shown.

Audit logs

Any manual changes to time or salary must be traceable.

Basic notifications (even just in app initially) for:

New leave requests.

New correction requests.

Approvals/rejections.

## Frontend Implementation Notes
- Reuse components wherever possible; if a similar component exists, extend it without breaking current functionality. Extract shared bits into composables when adding new features.
- Keep UI/UX intact when adding motion; do not alter layouts or functionality, only enhance with subtle, premium animations.
- Use framer-motion (AnimatePresence, whileInView, exit animations) with index-based stagger, light blur/opacity transitions; keep motion restrained and professional. Use pulse/ant loaders for pending states, use GSAP,three AS WELL.
- Use Ant Design as the primary component library; integrate new features with existing Ant components rather than recreating them.
- No mock data when API data exists: wire real API calls and include loaders, skeletons, error/retry states; handle empty states gracefully and cover edge cases.
- Optimize for performance and best practices (memoization where needed, suspense-friendly patterns, minimal re-renders).
- Ensure project supports shadcn structure, Tailwind, and TypeScript. If missing, set up via shadcn CLI (`npx shadcn@latest init`), add Tailwind (`npx tailwindcss init -p` + config), and enable TS (Next already TS-ready).
- Assets/icons: if icons needed, prefer `lucide-react`; use known Unsplash stock images when filling image slots.

## Current Setup Reminders
- Env: set `DATABASE_URL` and auth secrets; add `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD` for seeding.
- Scripts: `db:generate`, `db:migrate`, `db:push`, `db:seed`, `db:studio`.
- Auth: credentials provider; login at `/login`; middleware guards role paths; unauthorized view at `/unauthorized`.
- Seed: `npm run db:seed` creates/updates a superadmin using env creds.
