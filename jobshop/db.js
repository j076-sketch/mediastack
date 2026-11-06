import { DatabaseSync } from 'node:sqlite';

export const STATUSES = ['To Do', 'In Progress', 'Blocked', 'Review', 'Done'];
export const TYPES = ['Production', 'Setup', 'Maintenance', 'Quality', 'Programming', 'Material Handling', 'Other'];

export function open(file = process.env.DB_FILE || 'jobshop.db') {
  const db = new DatabaseSync(file);
  db.exec(`
  PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS people(id INTEGER PRIMARY KEY, name TEXT NOT NULL, role TEXT, active INTEGER DEFAULT 1);
  CREATE TABLE IF NOT EXISTS areas(id INTEGER PRIMARY KEY, name TEXT NOT NULL, color TEXT DEFAULT '#4c6ef5');
  CREATE TABLE IF NOT EXISTS tasks(
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT, area_id INTEGER REFERENCES areas(id) ON DELETE SET NULL,
    assignee_id INTEGER REFERENCES people(id) ON DELETE SET NULL, status TEXT DEFAULT 'To Do', priority TEXT DEFAULT 'normal',
    type TEXT DEFAULT 'Production', due_date TEXT, est_min REAL DEFAULT 0, actual_min REAL DEFAULT 0,
    blocked_reason TEXT, recurrence TEXT DEFAULT 'none', created_at TEXT DEFAULT CURRENT_TIMESTAMP, completed_at TEXT);
  CREATE TABLE IF NOT EXISTS checklist(id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, text TEXT NOT NULL, done INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, who TEXT, body TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS time_entries(id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, person_id INTEGER, started_at TEXT NOT NULL, ended_at TEXT);
  `);
  return db;
}

const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

export function seed(db) {
  if (db.prepare('SELECT COUNT(*) c FROM tasks').get().c) return;
  const ins = (t, ...a) => Number(db.prepare(t).run(...a).lastInsertRowid);
  const P = {}; [['Mike', 'Laser Operator'], ['Dana', 'Brake Lead'], ['Luis', 'Welder'], ['Priya', 'CNC Machinist'], ['Tom', 'Finishing / Shipping'], ['Sam', 'Shop Supervisor']]
    .forEach(([n, r]) => P[n] = ins('INSERT INTO people(name,role) VALUES(?,?)', n, r));
  const A = {}; [['Laser', '#e8590c'], ['Press Brake', '#4c6ef5'], ['Weld', '#f08c00'], ['CNC', '#2f9e44'], ['Finishing', '#7048e8'], ['QC', '#0c8599'], ['Shipping', '#868e96'], ['Facility', '#c2255c']]
    .forEach(([n, c]) => A[n] = ins('INSERT INTO areas(name,color) VALUES(?,?)', n, c));
  const t = db.prepare('INSERT INTO tasks(title,description,area_id,assignee_id,status,priority,type,due_date,est_min,blocked_reason,recurrence) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  const T = (...a) => Number(t.run(...a).lastInsertRowid);
  const cl = (id, ...items) => items.forEach(x => ins('INSERT INTO checklist(task_id,text) VALUES(?,?)', id, x));
  cl(T('Nest + cut brackets', 'Use 5052 .063. Check nitrogen pressure first.', A.Laser, P.Mike, 'In Progress', 'high', 'Production', day(0), 90, null, 'none'), 'Verify nest in program', 'First-piece check', 'Cut full qty', 'Tag + move to brake');
  cl(T('Form brackets (2 bends)', '', A['Press Brake'], P.Dana, 'To Do', 'high', 'Production', day(1), 120, null, 'none'), 'Confirm tooling', 'First article bend angle', 'Run qty');
  T('Weld + grind hopper panels', '', A.Weld, P.Luis, 'Blocked', 'normal', 'Production', day(3), 300, 'Waiting on formed panels from brake', 'none');
  cl(T('Setup Haas VF-2 for pump housing op 1', 'Fixture plate #4. Probe offsets.', A.CNC, P.Priya, 'To Do', 'high', 'Setup', day(1), 90, null, 'none'), 'Load program', 'Touch off tools', 'Dry run', 'Run first article');
  T('Re-cut shaft collar cross-holes (out of tol)', 'Hole #2 position .004 off. Rework.', A.CNC, P.Priya, 'In Progress', 'urgent', 'Quality', day(0), 60, null, 'none');
  T('CMM first article — pump housing', '', A.QC, P.Sam, 'To Do', 'normal', 'Quality', day(3), 90, null, 'none');
  T('Pack + label rails for pickup', '', A.Shipping, P.Tom, 'Review', 'normal', 'Production', day(-1), 30, null, 'none');
  T('Grease press brake 1 & 2', 'Weekly PM — see maintenance binder', A['Press Brake'], P.Dana, 'To Do', 'normal', 'Maintenance', day(2), 30, null, 'weekly');
  T('Check laser lens + nozzle, clean optics', '', A.Laser, P.Mike, 'To Do', 'normal', 'Maintenance', day(0), 20, null, 'daily');
  T('Empty chip bins + coolant level check', '', A.CNC, P.Priya, 'To Do', 'low', 'Maintenance', day(0), 15, null, 'daily');
  T('Reorganize remnant rack', '', A.Facility, null, 'To Do', 'low', 'Other', null, 120, null, 'none');
  T('Program nest for gusset plates', '', A.Laser, null, 'To Do', 'normal', 'Programming', day(5), 45, null, 'none');
}
