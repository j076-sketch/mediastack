# ShopTasks

Production task and assignment tracker for sheet metal / CNC shops. It does the work the ERP doesn't: who's doing what, what's blocked, what's overdue. Jobs, customers and inventory stay in the ERP; a task just carries an optional Job # / Part # as a reference.

Node 22.13+ only, no dependencies (built-in `node:sqlite`).

```bash
cd jobshop
npm start        # http://localhost:3000, seeds demo data on first run
```

## Features
- **My Tasks** – pick who you are; tasks grouped Overdue / Today / Upcoming with Start-timer and Done buttons.
- **Board** – To Do / In Progress / Blocked / Review / Done. Dragging to Blocked asks why.
- **By Person** – drag tasks onto people to assign; shows remaining estimated hours per person.
- **All Tasks** – table with filters (area, type, search).
- **Dashboard** – blocked, overdue, unassigned, running timers, team workload.
- **Task detail** – checklist (setup steps, first-piece checks), comments/activity log, time tracking, area (Laser, Brake, Weld, CNC…), type (Production, Setup, Maintenance, Quality…), priority, due date.
- **Recurring tasks** – daily/weekly/monthly (PMs, daily checks); completing one spawns the next.
- One running timer per person; starting one pauses the other.

Env: `PORT` (default 3000), `DB_FILE` (default `jobshop.db`). No auth yet — LAN only.
