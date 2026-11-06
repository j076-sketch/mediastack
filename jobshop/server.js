import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, seed, STATUSES, TYPES } from './db.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const db = open(); seed(db);
const PORT = process.env.PORT || 3000;
const q = (s, ...a) => db.prepare(s).all(...a);
const one = (s, ...a) => db.prepare(s).get(...a);
const run = (s, ...a) => db.prepare(s).run(...a);
const now = () => new Date().toISOString();
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

const TASK_SQL = `SELECT t.*, p.name assignee, a.name area, a.color area_color,
  (SELECT COUNT(*) FROM checklist WHERE task_id=t.id) cl_total, (SELECT COUNT(*) FROM checklist WHERE task_id=t.id AND done=1) cl_done,
  (SELECT started_at FROM time_entries WHERE task_id=t.id AND ended_at IS NULL LIMIT 1) timer_started
  FROM tasks t LEFT JOIN people p ON p.id=t.assignee_id LEFT JOIN areas a ON a.id=t.area_id`;
const getTask = id => one(TASK_SQL + ' WHERE t.id=?', id);
const note = (id, body, who = 'system') => run('INSERT INTO comments(task_id,who,body) VALUES(?,?,?)', id, who, body);

function stopTimers(id) {
  for (const e of q('SELECT * FROM time_entries WHERE task_id=? AND ended_at IS NULL', id)) {
    run('UPDATE time_entries SET ended_at=? WHERE id=?', now(), e.id);
    run('UPDATE tasks SET actual_min=actual_min+? WHERE id=?', Math.round((Date.now() - Date.parse(e.started_at)) / 6e3) / 10, id);
  }
}
function addDays(date, n) { const d = new Date((date || new Date().toISOString().slice(0, 10)) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function spawnNext(t) {
  const step = { daily: 1, weekly: 7, monthly: 30 }[t.recurrence]; if (!step) return;
  const base = t.due_date && t.due_date > new Date().toISOString().slice(0, 10) ? t.due_date : new Date().toISOString().slice(0, 10);
  const id = Number(run(`INSERT INTO tasks(title,description,area_id,assignee_id,priority,type,due_date,est_min,recurrence) VALUES(?,?,?,?,?,?,?,?,?)`,
    t.title, t.description, t.area_id, t.assignee_id, t.priority, t.type, addDays(base, step), t.est_min, t.recurrence).lastInsertRowid);
  for (const c of q('SELECT text FROM checklist WHERE task_id=?', t.id)) run('INSERT INTO checklist(task_id,text) VALUES(?,?)', id, c.text);
}

const FIELDS = ['title','description','area_id','assignee_id','status','priority','type','due_date','est_min','blocked_reason','recurrence'];
function updateTask(id, b, who) {
  const old = one('SELECT * FROM tasks WHERE id=?', id); if (!old) throw [404, 'no such task'];
  if (b.status && !STATUSES.includes(b.status)) throw [400, 'bad status'];
  if (b.priority && !PRIORITIES.includes(b.priority)) throw [400, 'bad priority'];
  for (const k of FIELDS) if (k in b) run(`UPDATE tasks SET ${k}=? WHERE id=?`, b[k] === '' ? null : b[k], id);
  if (b.status && b.status !== old.status) {
    if (b.status !== 'In Progress') stopTimers(id);
    if (b.status !== 'Blocked' && !('blocked_reason' in b)) run('UPDATE tasks SET blocked_reason=NULL WHERE id=?', id);
    if (b.status === 'Done') { run('UPDATE tasks SET completed_at=? WHERE id=?', now(), id); if (old.recurrence !== 'none') spawnNext(old); }
    else run('UPDATE tasks SET completed_at=NULL WHERE id=?', id);
    note(id, `${old.status} → ${b.status}${b.blocked_reason ? ` (${b.blocked_reason})` : ''}`, who);
  }
  if ('assignee_id' in b && b.assignee_id != old.assignee_id) note(id, `Assigned to ${one('SELECT name FROM people WHERE id=?', b.assignee_id)?.name || 'nobody'}`, who);
}

const routes = [];
const on = (m, p, fn) => routes.push([m, new RegExp('^' + p.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn]);

on('GET', '/api/meta', () => ({ statuses: STATUSES, types: TYPES, priorities: PRIORITIES, people: q('SELECT * FROM people WHERE active=1 ORDER BY name'), areas: q('SELECT * FROM areas ORDER BY id') }));
on('POST', '/api/people', ({ body: b }) => ({ id: Number(run('INSERT INTO people(name,role) VALUES(?,?)', b.name, b.role || '').lastInsertRowid) }));
on('DELETE', '/api/people/:id', ({ params: p }) => { run('UPDATE people SET active=0 WHERE id=?', p.id); run('UPDATE tasks SET assignee_id=NULL WHERE assignee_id=? AND status!=\'Done\'', p.id); return { ok: true }; });
on('POST', '/api/areas', ({ body: b }) => ({ id: Number(run('INSERT INTO areas(name,color) VALUES(?,?)', b.name, b.color || '#4c6ef5').lastInsertRowid) }));

on('GET', '/api/tasks', () => q(TASK_SQL + ` WHERE t.status!='Done' OR t.completed_at > datetime('now','-7 day') ORDER BY t.due_date IS NULL, t.due_date, t.id`));
on('POST', '/api/tasks', ({ body: b }) => {
  if (!b.title?.trim()) throw [400, 'title required'];
  const id = Number(run('INSERT INTO tasks(title) VALUES(?)', b.title.trim()).lastInsertRowid);
  updateTask(id, { ...b, title: b.title.trim(), status: b.status || 'To Do' }, b.who);
  for (const c of b.checklist || []) run('INSERT INTO checklist(task_id,text) VALUES(?,?)', id, c);
  return getTask(id);
});
on('GET', '/api/tasks/:id', ({ params: p }) => {
  const t = getTask(p.id); if (!t) throw [404, 'no such task'];
  return { ...t, checklist: q('SELECT * FROM checklist WHERE task_id=? ORDER BY id', p.id), comments: q('SELECT * FROM comments WHERE task_id=? ORDER BY id DESC', p.id) };
});
on('PATCH', '/api/tasks/:id', ({ params: p, body: b }) => { updateTask(p.id, b, b.who); return getTask(p.id); });
on('DELETE', '/api/tasks/:id', ({ params: p }) => { run('DELETE FROM tasks WHERE id=?', p.id); return { ok: true }; });
on('POST', '/api/tasks/:id/comments', ({ params: p, body: b }) => { if (!b.body) throw [400, 'empty']; note(p.id, b.body, b.who || 'me'); return { ok: true }; });
on('POST', '/api/tasks/:id/checklist', ({ params: p, body: b }) => { run('INSERT INTO checklist(task_id,text) VALUES(?,?)', p.id, b.text); return { ok: true }; });
on('PATCH', '/api/checklist/:id', ({ params: p, body: b }) => { run('UPDATE checklist SET done=? WHERE id=?', b.done ? 1 : 0, p.id); return { ok: true }; });
on('DELETE', '/api/checklist/:id', ({ params: p }) => { run('DELETE FROM checklist WHERE id=?', p.id); return { ok: true }; });

// Timer: starting moves task to In Progress; one running timer per person.
on('POST', '/api/tasks/:id/timer/start', ({ params: p, body: b }) => {
  if (b.person_id) for (const e of q('SELECT task_id FROM time_entries WHERE person_id=? AND ended_at IS NULL', b.person_id)) stopTimers(e.task_id);
  stopTimers(p.id);
  run('INSERT INTO time_entries(task_id,person_id,started_at) VALUES(?,?,?)', p.id, b.person_id || null, now());
  const t = one('SELECT status, assignee_id FROM tasks WHERE id=?', p.id);
  if (t.status !== 'In Progress') updateTask(p.id, { status: 'In Progress', ...(t.assignee_id || !b.person_id ? {} : { assignee_id: b.person_id }) }, b.who);
  return getTask(p.id);
});
on('POST', '/api/tasks/:id/timer/stop', ({ params: p }) => { stopTimers(p.id); return getTask(p.id); });

on('GET', '/api/dashboard', () => {
  const today = new Date().toISOString().slice(0, 10);
  const open = "status!='Done'";
  return {
    open: one(`SELECT COUNT(*) c FROM tasks WHERE ${open}`).c,
    unassigned: q(TASK_SQL + ` WHERE t.assignee_id IS NULL AND t.${open} ORDER BY t.due_date IS NULL, t.due_date`),
    overdue: q(TASK_SQL + ` WHERE t.due_date<? AND t.${open} ORDER BY t.due_date`, today),
    blocked: q(TASK_SQL + " WHERE t.status='Blocked'"),
    running: q(TASK_SQL + ' WHERE t.id IN (SELECT task_id FROM time_entries WHERE ended_at IS NULL)'),
    workload: q(`SELECT p.id, p.name, p.role,
      SUM(CASE WHEN t.status!='Done' THEN 1 ELSE 0 END) open,
      COALESCE(SUM(CASE WHEN t.status!='Done' THEN MAX(t.est_min-t.actual_min,0) END),0) remaining_min,
      SUM(CASE WHEN t.status='Done' AND t.completed_at>datetime('now','-7 day') THEN 1 ELSE 0 END) done_week,
      SUM(CASE WHEN t.status!='Done' AND t.due_date<? THEN 1 ELSE 0 END) overdue
      FROM people p LEFT JOIN tasks t ON t.assignee_id=p.id WHERE p.active=1 GROUP BY p.id ORDER BY p.name`, today),
  };
});

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (code, data, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type }); res.end(type === 'application/json' ? JSON.stringify(data) : data); };
  try {
    if (url.pathname.startsWith('/api/')) {
      for (const [m, re, fn] of routes) {
        const hit = m === req.method && re.exec(url.pathname); if (!hit) continue;
        let raw = ''; for await (const c of req) raw += c;
        return send(200, fn({ params: hit.groups || {}, body: raw ? JSON.parse(raw) : {} }) ?? {});
      }
      return send(404, { error: 'not found' });
    }
    const pub = path.join(root, 'public');
    const file = path.join(pub, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!file.startsWith(pub + path.sep) || !fs.existsSync(file)) return send(404, 'not found', 'text/plain');
    send(200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
  } catch (e) {
    if (Array.isArray(e)) return send(e[0], { error: e[1] });
    console.error(e); send(500, { error: e.message });
  }
}).listen(PORT, () => console.log(`JobShop on http://localhost:${PORT}`));
