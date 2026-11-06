import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, seed, STAGES } from './db.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const db = open();
seed(db);
const PORT = process.env.PORT || 3000;
const q = (sql, ...a) => db.prepare(sql).all(...a);
const one = (sql, ...a) => db.prepare(sql).get(...a);
const run = (sql, ...a) => db.prepare(sql).run(...a);

const JOB_SQL = `SELECT j.*, c.name customer,
  (SELECT COUNT(*) FROM ops WHERE job_id=j.id) ops_total,
  (SELECT COUNT(*) FROM ops WHERE job_id=j.id AND status='done') ops_done,
  (SELECT COALESCE(SUM(est_min),0) FROM ops WHERE job_id=j.id) est_min,
  (SELECT COALESCE(SUM(actual_min),0) FROM ops WHERE job_id=j.id) actual_min
  FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id`;
const OP_SQL = `SELECT o.*, w.name work_center, w.type wc_type FROM ops o LEFT JOIN work_centers w ON w.id=o.work_center_id`;

const nextJobNo = () => 'J-' + (Number((one("SELECT MAX(CAST(SUBSTR(job_no,3) AS INTEGER)) m FROM jobs").m) || 1000) + 1);
const customerId = name => { if (!name) return null; run('INSERT OR IGNORE INTO customers(name) VALUES(?)', name); return one('SELECT id FROM customers WHERE name=?', name).id; };
const note = (job_id, body, who = 'system') => run('INSERT INTO comments(job_id,who,body) VALUES(?,?,?)', job_id, who, body);
const now = () => new Date().toISOString();

function syncStage(jobId) {
  const job = one('SELECT stage FROM jobs WHERE id=?', jobId);
  const ops = q('SELECT status FROM ops WHERE job_id=?', jobId);
  if (!ops.length || STAGES.indexOf(job.stage) >= STAGES.indexOf('QC')) return;
  let next = job.stage;
  if (ops.every(o => o.status === 'done')) next = 'QC';
  else if (ops.some(o => o.status !== 'todo') && STAGES.indexOf(job.stage) < STAGES.indexOf('In Production')) next = 'In Production';
  if (next !== job.stage) { run('UPDATE jobs SET stage=? WHERE id=?', next, jobId); note(jobId, `Auto-moved to ${next}`); }
}

function stopTimers(opId, who) {
  for (const t of q('SELECT * FROM time_entries WHERE op_id=? AND ended_at IS NULL', opId)) {
    const mins = (Date.now() - Date.parse(t.started_at)) / 6e4;
    run('UPDATE time_entries SET ended_at=? WHERE id=?', now(), t.id);
    run('UPDATE ops SET actual_min=actual_min+? WHERE id=?', Math.round(mins * 10) / 10, opId);
  }
}

const routes = [];
const on = (m, p, fn) => routes.push([m, new RegExp('^' + p.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn]);

on('GET', '/api/meta', () => ({ stages: STAGES, work_centers: q('SELECT * FROM work_centers'), customers: q('SELECT * FROM customers ORDER BY name') }));
on('GET', '/api/jobs', () => q(JOB_SQL + ' ORDER BY j.due_date'));
on('POST', '/api/jobs', ({ body: b }) => {
  const id = run('INSERT INTO jobs(job_no,customer_id,part_name,part_no,rev,qty,material,due_date,priority,stage,po,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    nextJobNo(), customerId(b.customer), b.part_name, b.part_no || '', b.rev || 'A', b.qty || 1, b.material || '', b.due_date || null,
    b.priority || 'normal', STAGES.includes(b.stage) ? b.stage : 'Quoted', b.po || '', b.notes || '').lastInsertRowid;
  (b.ops || []).forEach((o, i) => run('INSERT INTO ops(job_id,seq,name,work_center_id,est_min) VALUES(?,?,?,?,?)', id, i + 1, o.name, o.work_center_id, o.est_min || 0));
  return one(JOB_SQL + ' WHERE j.id=?', id);
});
on('GET', '/api/jobs/:id', ({ params: p }) => {
  const job = one(JOB_SQL + ' WHERE j.id=?', p.id);
  if (!job) throw [404, 'no such job'];
  return { ...job, ops: q(OP_SQL + ' WHERE o.job_id=? ORDER BY o.seq', p.id), comments: q('SELECT * FROM comments WHERE job_id=? ORDER BY id DESC', p.id) };
});
on('PATCH', '/api/jobs/:id', ({ params: p, body: b }) => {
  const old = one('SELECT * FROM jobs WHERE id=?', p.id); if (!old) throw [404, 'no such job'];
  if (b.stage && !STAGES.includes(b.stage)) throw [400, 'bad stage'];
  for (const k of ['part_name','part_no','rev','qty','material','due_date','priority','stage','po','notes'])
    if (k in b) run(`UPDATE jobs SET ${k}=? WHERE id=?`, b[k], p.id);
  if ('customer' in b) run('UPDATE jobs SET customer_id=? WHERE id=?', customerId(b.customer), p.id);
  if (b.stage && b.stage !== old.stage) note(p.id, `Stage: ${old.stage} → ${b.stage}`, b.who);
  return one(JOB_SQL + ' WHERE j.id=?', p.id);
});
on('DELETE', '/api/jobs/:id', ({ params: p }) => { run('DELETE FROM jobs WHERE id=?', p.id); return { ok: true }; });
on('POST', '/api/jobs/:id/comments', ({ params: p, body: b }) => { if (!b.body) throw [400, 'empty']; note(p.id, b.body, b.who || 'me'); return { ok: true }; });
on('POST', '/api/jobs/:id/ops', ({ params: p, body: b }) => {
  const seq = (one('SELECT MAX(seq) m FROM ops WHERE job_id=?', p.id).m || 0) + 1;
  run('INSERT INTO ops(job_id,seq,name,work_center_id,est_min) VALUES(?,?,?,?,?)', p.id, seq, b.name, b.work_center_id, b.est_min || 0);
  return { ok: true };
});
on('PATCH', '/api/ops/:id', ({ params: p, body: b }) => {
  for (const k of ['name','work_center_id','est_min','assignee','instructions']) if (k in b) run(`UPDATE ops SET ${k}=? WHERE id=?`, b[k], p.id);
  return one(OP_SQL + ' WHERE o.id=?', p.id);
});
on('DELETE', '/api/ops/:id', ({ params: p }) => { run('DELETE FROM ops WHERE id=?', p.id); return { ok: true }; });
on('POST', '/api/ops/:id/start', ({ params: p, body: b }) => {
  const op = one('SELECT * FROM ops WHERE id=?', p.id); if (!op) throw [404, 'no such op'];
  run('INSERT INTO time_entries(op_id,who,started_at) VALUES(?,?,?)', p.id, b.who || 'operator', now());
  run("UPDATE ops SET status='running', assignee=COALESCE(?,assignee) WHERE id=?", b.who || null, p.id);
  syncStage(op.job_id); return { ok: true };
});
on('POST', '/api/ops/:id/stop', ({ params: p }) => { stopTimers(p.id); run("UPDATE ops SET status='todo' WHERE id=? AND status='running'", p.id); return { ok: true }; });
on('POST', '/api/ops/:id/done', ({ params: p, body: b }) => {
  const op = one('SELECT * FROM ops WHERE id=?', p.id); if (!op) throw [404, 'no such op'];
  stopTimers(p.id); run("UPDATE ops SET status='done' WHERE id=?", p.id);
  note(op.job_id, `Completed: ${op.name}`, b.who || 'operator'); syncStage(op.job_id); return { ok: true };
});
on('POST', '/api/ops/:id/reopen', ({ params: p }) => { run("UPDATE ops SET status='todo' WHERE id=?", p.id); return { ok: true }; });

// Shop floor: open ops per work center, in job-due order, only ops whose predecessors are done are "ready"
on('GET', '/api/queue', () => {
  const rows = q(OP_SQL + ` LEFT JOIN jobs j ON j.id=o.job_id WHERE o.status!='done' ORDER BY j.due_date, o.seq`);
  const meta = q(`SELECT j.id, j.job_no, j.part_name, j.qty, j.due_date, j.priority, j.stage, c.name customer FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id`);
  const byJob = Object.fromEntries(meta.map(m => [m.id, m]));
  return rows.map(o => ({ ...o, job: byJob[o.job_id],
    ready: !one("SELECT 1 x FROM ops WHERE job_id=? AND seq<? AND status!='done'", o.job_id, o.seq) }));
});

on('GET', '/api/dashboard', () => {
  const today = new Date().toISOString().slice(0, 10);
  const loads = q(`SELECT w.id, w.name, w.type, w.hours_per_day,
      COALESCE(SUM(CASE WHEN o.status!='done' THEN MAX(o.est_min-o.actual_min,0) END),0) remaining_min
      FROM work_centers w LEFT JOIN ops o ON o.work_center_id=w.id GROUP BY w.id`)
    .map(w => ({ ...w, days_backlog: Math.round(w.remaining_min / (w.hours_per_day * 60) * 10) / 10 }));
  return {
    open_jobs: one("SELECT COUNT(*) c FROM jobs WHERE stage!='Shipped'").c,
    late: q(JOB_SQL + " WHERE j.stage NOT IN ('Shipped','Ready to Ship') AND j.due_date<? ORDER BY j.due_date", today),
    due_week: one("SELECT COUNT(*) c FROM jobs WHERE stage!='Shipped' AND due_date BETWEEN ? AND date(?, '+7 day')", today, today).c,
    loads,
    running: q(`SELECT o.*, w.name work_center, j.job_no, j.part_name FROM ops o LEFT JOIN work_centers w ON w.id=o.work_center_id JOIN jobs j ON j.id=o.job_id WHERE o.status='running'`),
    low_stock: q('SELECT * FROM materials WHERE stock<=reorder_at'),
  };
});

on('GET', '/api/materials', () => q('SELECT * FROM materials ORDER BY name'));
on('POST', '/api/materials', ({ body: b }) => { run('INSERT INTO materials(name,spec,stock,reorder_at,unit,supplier) VALUES(?,?,?,?,?,?)', b.name, b.spec || '', b.stock || 0, b.reorder_at || 0, b.unit || 'sheets', b.supplier || ''); return { ok: true }; });
on('PATCH', '/api/materials/:id', ({ params: p, body: b }) => {
  for (const k of ['name','spec','stock','reorder_at','unit','supplier']) if (k in b) run(`UPDATE materials SET ${k}=? WHERE id=?`, b[k], p.id);
  return { ok: true };
});
on('DELETE', '/api/materials/:id', ({ params: p }) => { run('DELETE FROM materials WHERE id=?', p.id); return { ok: true }; });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (code, data, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type }); res.end(type === 'application/json' ? JSON.stringify(data) : data); };
  try {
    if (url.pathname.startsWith('/api/')) {
      for (const [m, re, fn] of routes) {
        const hit = m === req.method && re.exec(url.pathname);
        if (!hit) continue;
        let raw = ''; for await (const c of req) raw += c;
        return send(200, fn({ params: hit.groups || {}, body: raw ? JSON.parse(raw) : {} }) ?? {});
      }
      return send(404, { error: 'not found' });
    }
    const file = path.join(root, 'public', url.pathname === '/' ? 'index.html' : path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(path.join(root, 'public')) || !fs.existsSync(file)) return send(404, 'not found', 'text/plain');
    send(200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
  } catch (e) {
    if (Array.isArray(e)) return send(e[0], { error: e[1] });
    console.error(e); send(500, { error: e.message });
  }
}).listen(PORT, () => console.log(`Job shop app on http://localhost:${PORT}`));
