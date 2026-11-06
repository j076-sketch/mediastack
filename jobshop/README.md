# JobShop

ClickUp-style work management for sheet metal and CNC machine shops. Zero dependencies — Node 22.13+ only (uses built-in `node:sqlite`).

```bash
cd jobshop
npm start        # http://localhost:3000, creates jobshop.db with demo data
```

## What's in it
- **Job Board** – kanban by stage (Quoted → Material Ordered → Ready to Run → In Production → QC → Ready to Ship → Shipped). Drag to move.
- **Jobs** – job #, customer, PO, part #/rev, qty, material, due date, priority, notes, comment/activity log.
- **Routing** – per-job operations (laser, brake, weld, mill, lathe, deburr, coat, CMM, ship) with estimates vs. actual time. Templates for sheet metal / milled / turned parts.
- **Shop Floor** – queue per machine by due date; operators Start/Pause (timer logs actual time) and Done. Ops wait on earlier ops.
- **Auto stage moves** – first start → In Production; all ops done → QC.
- **Work Center Load** – backlog in days per machine to find the bottleneck.
- **Materials** – stock, reorder points, low-stock flags on the dashboard.

Env: `PORT` (default 3000), `DB_FILE` (default `jobshop.db`). No auth yet — run it on the shop LAN.
