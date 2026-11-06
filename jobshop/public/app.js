const $ = (s, r = document) => r.querySelector(s);
const api = async (m, u, b) => { const r = await fetch('/api' + u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); if (!r.ok) throw new Error((await r.json()).error); return r.json(); };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const hrs = m => m ? (m / 60).toFixed(1) + 'h' : '—';
const ini = n => (n || '?').slice(0, 1).toUpperCase();
const VIEWS = { mine: 'My Tasks', board: 'Board', people: 'By Person', list: 'All Tasks', dash: 'Dashboard' };
let meta, view = location.hash.slice(1) || 'mine', me = Number(localStorage.getItem('me')) || null;
let flt = { area: '', type: '', q: '' };
const dlg = $('#dlg'); window.dlg = dlg;
const meName = () => meta.people.find(p => p.id === me)?.name || 'someone';

$('#nav').innerHTML = Object.entries(VIEWS).map(([k, v]) => `<a data-v="${k}">${v}</a>`).join('');
$('#nav').onclick = e => { if (e.target.dataset.v) { view = location.hash = e.target.dataset.v; } };
window.onhashchange = () => { view = location.hash.slice(1) || 'mine'; render(); };

async function loadMeta() {
  meta = await api('GET', '/meta');
  if (!meta.people.some(p => p.id === me)) me = meta.people[0]?.id;
  $('#me').innerHTML = meta.people.map(p => `<option value="${p.id}" ${p.id === me ? 'selected' : ''}>${esc(p.name)}</option>`).join('') + '<option value="new">+ add person…</option>';
}
$('#me').onchange = async e => {
  if (e.target.value === 'new') { const name = prompt('Name?'); if (name) { const r = await api('POST', '/people', { name, role: prompt('Role?') || '' }); me = r.id; } }
  else me = Number(e.target.value);
  localStorage.setItem('me', me); await loadMeta(); render();
};

const dueTag = t => !t.due_date ? '' : (t.due_date < today() && t.status !== 'Done') ? `<span class="late">${t.due_date} · overdue</span>` : t.due_date === today() ? `<b>Today</b>` : `<span class="sub">${t.due_date}</span>`;
const areaTag = t => t.area ? `<span class="tag" style="background:${t.area_color}">${esc(t.area)}</span>` : '';
const card = t => `<div class="card ${t.priority} ${t.timer_started ? 'timer' : ''}" draggable="true" data-id="${t.id}">
  <b>${esc(t.title)}</b><div class="chips">${areaTag(t)}${t.type !== 'Production' ? `<span class="pill">${esc(t.type)}</span>` : ''}${t.recurrence !== 'none' ? '<span class="pill">↻ ' + t.recurrence + '</span>' : ''}${t.priority === 'urgent' ? '<span class="pill urgent">URGENT</span>' : ''}</div>
  ${t.status === 'Blocked' && t.blocked_reason ? `<div class="blk">⛔ ${esc(t.blocked_reason)}</div>` : ''}
  <div class="sub" style="display:flex;justify-content:space-between;margin-top:6px"><span>${dueTag(t)} ${t.cl_total ? `· ☑ ${t.cl_done}/${t.cl_total}` : ''}${t.est_min ? ` · ${hrs(t.actual_min)}/${hrs(t.est_min)}` : ''}</span>${t.assignee ? `<span class="who" title="${esc(t.assignee)}">${ini(t.assignee)}</span>` : '<span class="pill">unassigned</span>'}</div></div>`;

function bindCards(root, onDrop, colSel) {
  root.querySelectorAll('.card').forEach(c => { c.onclick = () => taskDetail(c.dataset.id); c.ondragstart = e => e.dataTransfer.setData('id', c.dataset.id); });
  root.querySelectorAll(colSel).forEach(col => {
    col.ondragover = e => { e.preventDefault(); col.classList.add('over'); };
    col.ondragleave = () => col.classList.remove('over');
    col.ondrop = async e => { e.preventDefault(); await onDrop(e.dataTransfer.getData('id'), col); render(); };
  });
}

async function render() {
  if (!meta) await loadMeta();
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.v === view));
  const tasks = await api('GET', '/tasks');
  const shown = tasks.filter(t => (!flt.area || t.area_id == flt.area) && (!flt.type || t.type === flt.type)
    && (!flt.q || [t.title, t.description, t.assignee].join(' ').toLowerCase().includes(flt.q.toLowerCase())));
  $('#top').innerHTML = view === 'dash' ? '' : `<div class="quick"><input id="qa" placeholder="Add a task and press Enter…  (assigned to you in My Tasks)"></div>
    <div class="filters"><select id="fa"><option value="">All areas</option>${meta.areas.map(a => `<option value="${a.id}" ${flt.area == a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
    <select id="ft"><option value="">All types</option>${meta.types.map(t => `<option ${flt.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
    <input id="fq" placeholder="Search title / person" value="${esc(flt.q)}"></div>`;
  if (view !== 'dash') {
    $('#qa').onkeydown = async e => { if (e.key === 'Enter' && e.target.value.trim()) { await api('POST', '/tasks', { title: e.target.value, assignee_id: view === 'mine' ? me : null, area_id: flt.area || null, who: meName() }); render(); } };
    $('#fa').onchange = e => { flt.area = e.target.value; render(); }; $('#ft').onchange = e => { flt.type = e.target.value; render(); };
    $('#fq').onchange = e => { flt.q = e.target.value; render(); };
  }
  ({ mine, board, people, list, dash }[view] || mine)(shown);
}

function mine(ts) {
  const mineT = ts.filter(t => t.assignee_id === me), open = mineT.filter(t => t.status !== 'Done');
  const grp = [['Overdue', t => t.due_date && t.due_date < today()], ['Today', t => t.due_date === today()], ['Upcoming', t => t.due_date > today()], ['No date', t => !t.due_date]];
  const seen = new Set();
  $('#view').innerHTML = `<h2>My Tasks — ${esc(meName())}</h2>` + grp.map(([n, f]) => { const l = open.filter(t => !seen.has(t.id) && f(t)); l.forEach(t => seen.add(t.id)); return l.length ? `<h3>${n} (${l.length})</h3>${l.map(row).join('')}` : ''; }).join('') || '';
  if (!open.length) $('#view').innerHTML += '<p class="sub">Nothing assigned. Ask the supervisor, or grab something from the Board.</p>';
  const done = mineT.filter(t => t.status === 'Done'); if (done.length) $('#view').innerHTML += `<h3>Done this week (${done.length})</h3>` + done.map(row).join('');
  bindRows();
}
const row = t => `<div class="op ${t.timer_started ? 'timer' : ''}" data-id="${t.id}" style="cursor:pointer"><div class="grow"><b class="${t.status === 'Done' ? 'done-t' : ''}">${esc(t.title)}</b> ${areaTag(t)}
  <div class="sub">${esc(t.status)} · ${dueTag(t)}${t.cl_total ? ` · ☑ ${t.cl_done}/${t.cl_total}` : ''}${t.est_min ? ` · ${hrs(t.actual_min)}/${hrs(t.est_min)}` : ''}</div>${t.status === 'Blocked' ? `<div class="blk">⛔ ${esc(t.blocked_reason || 'blocked')}</div>` : ''}</div>
  ${t.status === 'Done' ? '' : t.timer_started ? `<span class="pill running">⏱ RUNNING</span><button data-act="stop">Pause</button>` : `<button data-act="start">▶ Start</button>`}${t.status === 'Done' ? '' : '<button class="ok" data-act="done">✔</button>'}</div>`;
function bindRows() {
  $('#view').onclick = async e => {
    const r = e.target.closest('.op'); if (!r) return; const b = e.target.closest('button[data-act]'), id = r.dataset.id;
    if (!b) return taskDetail(id);
    if (b.dataset.act === 'start') await api('POST', `/tasks/${id}/timer/start`, { person_id: me, who: meName() });
    if (b.dataset.act === 'stop') await api('POST', `/tasks/${id}/timer/stop`, {});
    if (b.dataset.act === 'done') await api('PATCH', `/tasks/${id}`, { status: 'Done', who: meName() });
    render();
  };
}

function board(ts) {
  $('#view').innerHTML = `<div class="board">${meta.statuses.map(s => { const l = ts.filter(t => t.status === s);
    return `<div class="col" data-s="${s}"><h3>${s}<span>${l.length}</span></h3>${l.map(card).join('')}</div>`; }).join('')}</div>`;
  bindCards($('#view'), async (id, col) => {
    const status = col.dataset.s; let blocked_reason;
    if (status === 'Blocked') { blocked_reason = prompt('Why is it blocked? (material, program, machine down…)') || 'Blocked'; }
    await api('PATCH', `/tasks/${id}`, { status, blocked_reason, who: meName() });
  }, '.col');
}

function people(ts) {
  const cols = [{ id: '', name: 'Unassigned' }, ...meta.people];
  $('#view').innerHTML = `<h2>Assign Work</h2><p class="sub">Drag a task onto a person to assign it.</p><div class="board">${cols.map(p => { const l = ts.filter(t => (t.assignee_id || '') === p.id && t.status !== 'Done');
    const m = l.reduce((a, t) => a + Math.max(t.est_min - t.actual_min, 0), 0);
    return `<div class="col" data-p="${p.id}"><h3>${esc(p.name)}<span>${l.length} · ${hrs(m)}</span></h3>${l.map(card).join('')}</div>`; }).join('')}</div>`;
  bindCards($('#view'), (id, col) => api('PATCH', `/tasks/${id}`, { assignee_id: col.dataset.p ? Number(col.dataset.p) : null, who: meName() }), '.col');
}

function list(ts) {
  $('#view').innerHTML = `<table><thead><tr><th>Task</th><th>Area</th><th>Assignee</th><th>Status</th><th>Priority</th><th>Due</th><th>Time</th></tr></thead><tbody>${ts.map(t => `
    <tr class="click" data-id="${t.id}"><td>${esc(t.title)}</td><td>${areaTag(t)}</td><td>${esc(t.assignee || '—')}</td><td>${t.status}</td><td><span class="pill ${t.priority}">${t.priority}</span></td><td>${dueTag(t)}</td><td>${hrs(t.actual_min)}/${hrs(t.est_min)}</td></tr>`).join('')}</tbody></table>`;
  document.querySelectorAll('tr.click').forEach(r => r.onclick = () => taskDetail(r.dataset.id));
}

async function dash() {
  const d = await api('GET', '/dashboard');
  const mini = (l, empty) => l.map(t => `<div class="op" data-id="${t.id}" style="cursor:pointer"><div class="grow">${esc(t.title)} <span class="sub">${esc(t.assignee || 'unassigned')} · ${t.due_date || ''}${t.blocked_reason ? ' · ⛔ ' + esc(t.blocked_reason) : ''}</span></div></div>`).join('') || `<div class="sub">${empty}</div>`;
  $('#view').innerHTML = `<h2>Dashboard</h2><div class="grid">
    <div class="tile"><div class="sub">Open tasks</div><div class="big">${d.open}</div></div>
    <div class="tile"><div class="sub">Overdue</div><div class="big ${d.overdue.length ? 'late' : ''}">${d.overdue.length}</div></div>
    <div class="tile"><div class="sub">Blocked</div><div class="big ${d.blocked.length ? 'late' : ''}">${d.blocked.length}</div></div>
    <div class="tile"><div class="sub">Unassigned</div><div class="big">${d.unassigned.length}</div></div></div>
  <div class="grid" style="margin-top:12px"><div class="tile"><h3>⛔ Blocked</h3>${mini(d.blocked, 'Nothing blocked')}</div>
    <div class="tile"><h3>Overdue</h3>${mini(d.overdue, 'None 🎉')}</div>
    <div class="tile"><h3>Unassigned</h3>${mini(d.unassigned, 'Everything has an owner')}</div>
    <div class="tile"><h3>⏱ Running now</h3>${mini(d.running, 'No timers running')}</div></div>
  <h3>Team workload</h3><table><thead><tr><th>Person</th><th>Open</th><th>Remaining est.</th><th>Overdue</th><th>Done (7d)</th></tr></thead><tbody>${d.workload.map(w => `<tr><td>${esc(w.name)} <span class="sub">${esc(w.role)}</span></td><td>${w.open}</td><td>${hrs(w.remaining_min)}</td><td class="${w.overdue ? 'late' : ''}">${w.overdue}</td><td>${w.done_week}</td></tr>`).join('')}</tbody></table>`;
  $('#view').onclick = e => { const r = e.target.closest('.op'); if (r) taskDetail(r.dataset.id); };
}

async function taskDetail(id) {
  const t = await api('GET', `/tasks/${id}`);
  const opt = (arr, sel, f = x => x, g = x => x) => arr.map(x => `<option value="${f(x)}" ${f(x) == sel ? 'selected' : ''}>${esc(g(x))}</option>`).join('');
  dlg.innerHTML = `<div style="display:flex;gap:8px"><input id="f-title" value="${esc(t.title)}" style="flex:1;font-size:18px;font-weight:600"><button onclick="dlg.close()">✕</button></div>
  <div class="row"><label>Status<select id="f-status">${opt(meta.statuses, t.status)}</select></label>
   <label>Assignee<select id="f-assignee_id"><option value="">Unassigned</option>${opt(meta.people, t.assignee_id, p => p.id, p => p.name)}</select></label>
   <label>Priority<select id="f-priority">${opt(meta.priorities, t.priority)}</select></label><label>Due<input id="f-due_date" type="date" value="${t.due_date || ''}"></label></div>
  <div class="row"><label>Area<select id="f-area_id"><option value="">—</option>${opt(meta.areas, t.area_id, a => a.id, a => a.name)}</select></label>
   <label>Type<select id="f-type">${opt(meta.types, t.type)}</select></label><label>Est. minutes<input id="f-est_min" type="number" value="${t.est_min || ''}"></label>
   <label>Repeats<select id="f-recurrence">${opt(['none', 'daily', 'weekly', 'monthly'], t.recurrence)}</select></label></div>
  ${t.status === 'Blocked' ? `<label>Blocked because<input id="f-blocked_reason" value="${esc(t.blocked_reason)}"></label>` : ''}
  <label style="margin-top:8px">Details / instructions<textarea id="f-description" rows="3">${esc(t.description)}</textarea></label>
  <div class="row" style="align-items:center"><span class="sub" style="flex:2">Time logged: <b>${hrs(t.actual_min)}</b> of ${hrs(t.est_min)} est.</span>
   ${t.timer_started ? '<button id="tstop">⏸ Pause timer</button>' : '<button id="tstart">▶ Start timer</button>'}</div>
  <h3>Checklist</h3>${t.checklist.map(c => `<div class="ck"><input type="checkbox" data-ck="${c.id}" ${c.done ? 'checked' : ''}><span class="${c.done ? 'done-t' : ''}">${esc(c.text)}</span><button class="bad" data-ckdel="${c.id}">✕</button></div>`).join('')}
  <form id="ckf" class="row"><input name="text" placeholder="Add checklist item…" required><button style="flex:0">Add</button></form>
  <h3>Activity</h3><form id="cf" class="row"><input name="body" placeholder="Comment (@ the next operator, note a problem…)" required><button style="flex:0">Post</button></form>
  ${t.comments.map(c => `<div class="cmt"><b>${esc(c.who)}</b> <span class="sub">${esc(c.created_at)}</span><div>${esc(c.body)}</div></div>`).join('')}
  <div class="row" style="margin-top:14px"><button class="bad" id="del" style="flex:0;white-space:nowrap">Delete task</button></div>`;
  if (!dlg.open) dlg.showModal();
  const reopen = async () => { await render(); taskDetail(id); };
  for (const f of ['title', 'status', 'assignee_id', 'priority', 'due_date', 'area_id', 'type', 'est_min', 'recurrence', 'blocked_reason', 'description']) {
    const el = $('#f-' + f); if (!el) continue;
    el.onchange = async () => {
      const b = { [f]: el.value, who: meName() };
      if (f === 'status' && el.value === 'Blocked') b.blocked_reason = prompt('Why is it blocked?') || 'Blocked';
      if (['assignee_id', 'area_id'].includes(f)) b[f] = el.value ? Number(el.value) : null;
      await api('PATCH', `/tasks/${id}`, b); reopen();
    };
  }
  $('#tstart')?.addEventListener('click', async () => { await api('POST', `/tasks/${id}/timer/start`, { person_id: me, who: meName() }); reopen(); });
  $('#tstop')?.addEventListener('click', async () => { await api('POST', `/tasks/${id}/timer/stop`, {}); reopen(); });
  dlg.querySelectorAll('[data-ck]').forEach(c => c.onchange = async () => { await api('PATCH', `/checklist/${c.dataset.ck}`, { done: c.checked }); reopen(); });
  dlg.querySelectorAll('[data-ckdel]').forEach(c => c.onclick = async () => { await api('DELETE', `/checklist/${c.dataset.ckdel}`); reopen(); });
  $('#ckf').onsubmit = async e => { e.preventDefault(); await api('POST', `/tasks/${id}/checklist`, { text: new FormData(e.target).get('text') }); reopen(); };
  $('#cf').onsubmit = async e => { e.preventDefault(); await api('POST', `/tasks/${id}/comments`, { body: new FormData(e.target).get('body'), who: meName() }); taskDetail(id); };
  $('#del').onclick = async () => { if (confirm('Delete this task?')) { await api('DELETE', `/tasks/${id}`); dlg.close(); render(); } };
}
dlg.addEventListener('close', render);
render();
