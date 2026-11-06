const $ = (s, r = document) => r.querySelector(s);
const api = async (m, u, b) => { const r = await fetch('/api' + u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); if (!r.ok) throw new Error((await r.json()).error); return r.json(); };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const hrs = m => (m / 60).toFixed(1) + 'h';
const user = () => localStorage.getItem('who') || (localStorage.setItem('who', prompt('Your name (for time tracking & notes)?') || 'operator'), localStorage.getItem('who'));
let meta, view = location.hash.slice(1) || 'board';
const VIEWS = { dashboard: 'Dashboard', board: 'Job Board', jobs: 'All Jobs', floor: 'Shop Floor', schedule: 'Work Center Load', materials: 'Materials' };

$('#nav').innerHTML = Object.entries(VIEWS).map(([k, v]) => `<a data-v="${k}">${v}</a>`).join('');
$('#nav').onclick = e => { if (e.target.dataset.v) go(e.target.dataset.v); };
$('#newJob').onclick = () => jobForm();
function go(v) { view = v; location.hash = v; render(); }

async function render() {
  meta ||= await api('GET', '/meta');
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.v === view));
  const fn = { dashboard, board, jobs, floor, schedule: dashboardLoad, materials }[view] || board;
  await fn();
}

const dueTag = j => !j.due_date ? '' : (j.due_date < today() && !['Ready to Ship', 'Shipped'].includes(j.stage)) ? `<span class="late">Due ${j.due_date} · LATE</span>` : `<span class="sub">Due ${j.due_date}</span>`;
const prog = j => `<div class="bar"><i style="width:${j.ops_total ? j.ops_done / j.ops_total * 100 : 0}%"></i></div>`;

async function board() {
  const jobs = await api('GET', '/jobs');
  $('#view').innerHTML = `<h2>Job Board</h2><div class="board">${meta.stages.map(s => {
    const js = jobs.filter(j => j.stage === s);
    return `<div class="col" data-stage="${s}"><h3>${s}<span>${js.length}</span></h3>${js.map(j => `
      <div class="card ${j.priority}" draggable="true" data-id="${j.id}">
        <b>${esc(j.job_no)} · ${esc(j.part_name)}</b><span class="sub">${esc(j.customer || '')} · qty ${j.qty}</span><br>${dueTag(j)}${prog(j)}</div>`).join('')}</div>`;
  }).join('')}</div>`;
  document.querySelectorAll('.card').forEach(c => {
    c.onclick = () => jobDetail(c.dataset.id);
    c.ondragstart = e => e.dataTransfer.setData('id', c.dataset.id);
  });
  document.querySelectorAll('.col').forEach(col => {
    col.ondragover = e => { e.preventDefault(); col.classList.add('over'); };
    col.ondragleave = () => col.classList.remove('over');
    col.ondrop = async e => { e.preventDefault(); await api('PATCH', `/jobs/${e.dataTransfer.getData('id')}`, { stage: col.dataset.stage, who: user() }); render(); };
  });
}

async function jobs() {
  const js = await api('GET', '/jobs');
  $('#view').innerHTML = `<h2>All Jobs</h2><div class="toolbar"><input id="f" placeholder="Filter by job #, part, customer, PO…" style="width:320px"></div>
  <table><thead><tr><th>Job</th><th>Part</th><th>Customer</th><th>Qty</th><th>Stage</th><th>Due</th><th>Ops</th><th>Est / Actual</th></tr></thead><tbody id="tb"></tbody></table>`;
  const draw = () => { const f = $('#f').value.toLowerCase(); $('#tb').innerHTML = js.filter(j => !f || [j.job_no, j.part_name, j.customer, j.po, j.part_no].join(' ').toLowerCase().includes(f)).map(j => `
    <tr class="click" data-id="${j.id}"><td>${esc(j.job_no)}</td><td>${esc(j.part_name)}<div class="sub">${esc(j.part_no)} rev ${esc(j.rev)}</div></td><td>${esc(j.customer || '')}</td><td>${j.qty}</td>
    <td><span class="pill ${j.priority}">${j.stage}</span></td><td>${dueTag(j)}</td><td>${j.ops_done}/${j.ops_total}</td><td>${hrs(j.est_min)} / ${hrs(j.actual_min)}</td></tr>`).join('');
    document.querySelectorAll('#tb tr').forEach(r => r.onclick = () => jobDetail(r.dataset.id)); };
  $('#f').oninput = draw; draw();
}

async function floor() {
  const ops = await api('GET', '/queue');
  const groups = meta.work_centers.map(w => ({ w, ops: ops.filter(o => o.work_center_id === w.id) })).filter(g => g.ops.length);
  $('#view').innerHTML = `<h2>Shop Floor</h2><p class="sub">Queue per machine, by due date. Greyed = waiting on an earlier operation.</p>` + groups.map(g => `
    <div class="wc"><h3>${esc(g.w.name)} <span class="sub">${g.ops.length} op(s)</span></h3>${g.ops.map(o => `
      <div class="op ${o.ready ? '' : 'notready'}"><div class="grow"><b>${esc(o.job.job_no)}</b> · ${esc(o.name)} — ${esc(o.job.part_name)} ×${o.job.qty}
        <div class="sub">${esc(o.job.customer || '')} · ${dueTag(o.job)} · est ${hrs(o.est_min)} · logged ${hrs(o.actual_min)}${o.assignee ? ' · ' + esc(o.assignee) : ''}</div></div>
        ${o.status === 'running' ? `<span class="pill running">RUNNING</span><button data-a="stop" data-id="${o.id}">Pause</button>` : `<button data-a="start" data-id="${o.id}" ${o.ready ? '' : 'disabled'}>▶ Start</button>`}
        <button class="ok" data-a="done" data-id="${o.id}" ${o.ready ? '' : 'disabled'}>✔ Done</button></div>`).join('')}</div>`).join('');
  $('#view').onclick = async e => { const b = e.target.closest('button[data-a]'); if (!b) return; await api('POST', `/ops/${b.dataset.id}/${b.dataset.a}`, { who: user() }); render(); };
}

async function dashboard() {
  const d = await api('GET', '/dashboard');
  $('#view').innerHTML = `<h2>Dashboard</h2><div class="grid">
    <div class="tile"><div class="sub">Open jobs</div><div class="big">${d.open_jobs}</div></div>
    <div class="tile"><div class="sub">Due next 7 days</div><div class="big">${d.due_week}</div></div>
    <div class="tile"><div class="sub">Late</div><div class="big ${d.late.length ? 'late' : ''}">${d.late.length}</div>${d.late.map(j => `<div class="sub">${esc(j.job_no)} ${esc(j.part_name)} (${j.due_date})</div>`).join('')}</div>
    <div class="tile"><div class="sub">Running right now</div>${d.running.map(o => `<div><b>${esc(o.work_center)}</b> <span class="sub">${esc(o.job_no)} ${esc(o.name)} · ${esc(o.assignee || '')}</span></div>`).join('') || '<div class="sub">Nothing running</div>'}</div>
    <div class="tile"><div class="sub">Low stock</div>${d.low_stock.map(m => `<div>${esc(m.name)} <span class="sub">${esc(m.spec)} — ${m.stock} ${m.unit}</span></div>`).join('') || '<div class="sub">All good</div>'}</div></div>`;
}

async function dashboardLoad() {
  const d = await api('GET', '/dashboard'); const max = Math.max(5, ...d.loads.map(l => l.days_backlog));
  $('#view').innerHTML = `<h2>Work Center Load</h2><p class="sub">Remaining estimated hours ÷ daily capacity. Find the bottleneck before the customer does.</p><table><thead><tr><th>Work center</th><th>Remaining</th><th>Backlog (days)</th><th style="width:40%"></th></tr></thead><tbody>${d.loads.map(l => `
    <tr><td>${esc(l.name)}</td><td>${hrs(l.remaining_min)}</td><td class="${l.days_backlog > 3 ? 'late' : ''}">${l.days_backlog}</td><td><div class="bar" style="height:10px"><i style="width:${l.days_backlog / max * 100}%;background:${l.days_backlog > 3 ? 'var(--bad)' : 'var(--acc)'}"></i></div></td></tr>`).join('')}</tbody></table>`;
}

async function materials() {
  const ms = await api('GET', '/materials');
  $('#view').innerHTML = `<h2>Materials</h2><div class="toolbar"><button id="addm" class="primary">+ Add material</button></div><table><thead><tr><th>Material</th><th>Spec</th><th>Stock</th><th>Reorder at</th><th>Supplier</th><th></th></tr></thead><tbody>${ms.map(m => `
    <tr><td>${esc(m.name)}</td><td>${esc(m.spec)}</td><td class="${m.stock <= m.reorder_at ? 'late' : ''}"><input type="number" value="${m.stock}" data-id="${m.id}" style="width:80px"> ${esc(m.unit)}</td><td>${m.reorder_at}</td><td>${esc(m.supplier)}</td><td><button class="bad" data-del="${m.id}">✕</button></td></tr>`).join('')}</tbody></table>`;
  document.querySelectorAll('input[data-id]').forEach(i => i.onchange = async () => { await api('PATCH', `/materials/${i.dataset.id}`, { stock: Number(i.value) }); render(); });
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (confirm('Delete?')) { await api('DELETE', `/materials/${b.dataset.del}`); render(); } });
  $('#addm').onclick = async () => { const name = prompt('Material name?'); if (!name) return; await api('POST', '/materials', { name, spec: prompt('Spec (gauge/size)?') || '', stock: Number(prompt('Stock on hand?') || 0), reorder_at: Number(prompt('Reorder at?') || 0) }); render(); };
}

const dlg = $('#dlg');
const wcOpts = sel => meta.work_centers.map(w => `<option value="${w.id}" ${w.id == sel ? 'selected' : ''}>${esc(w.name)}</option>`).join('');
const TEMPLATES = { 'Sheet metal': [['Laser cut', 'laser'], ['Form', 'brake'], ['Weld', 'weld'], ['Deburr / finish', 'finish'], ['Inspect', 'qc'], ['Ship', 'ship']],
  'CNC machined': [['Mill op 1', 'cnc-mill'], ['Mill op 2', 'cnc-mill'], ['Deburr', 'finish'], ['Inspect', 'qc'], ['Ship', 'ship']],
  'Turned part': [['Turn', 'cnc-lathe'], ['Mill features', 'cnc-mill'], ['Deburr', 'finish'], ['Inspect', 'qc'], ['Ship', 'ship']] };

function jobForm() {
  dlg.innerHTML = `<h2>New Job</h2><form id="jf"><div class="row">
    <label>Part name<input name="part_name" required></label><label>Part # / Rev<input name="part_no"></label></div><div class="row">
    <label>Customer<input name="customer" list="cl"><datalist id="cl">${meta.customers.map(c => `<option value="${esc(c.name)}">`).join('')}</datalist></label>
    <label>PO #<input name="po"></label><label>Qty<input name="qty" type="number" value="1" min="1"></label></div><div class="row">
    <label>Material<input name="material" placeholder='5052 Al .063" / 6061 bar'></label><label>Due<input name="due_date" type="date"></label>
    <label>Priority<select name="priority"><option>low</option><option selected>normal</option><option>high</option><option>urgent</option></select></label></div>
    <label>Routing template<select name="tpl"><option value="">— none —</option>${Object.keys(TEMPLATES).map(t => `<option>${t}</option>`).join('')}</select></label>
    <div class="row"><button class="primary">Create job</button><button type="button" onclick="dlg.close()">Cancel</button></div></form>`;
  window.dlg = dlg; dlg.showModal();
  $('#jf').onsubmit = async e => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); f.qty = Number(f.qty);
    f.ops = (TEMPLATES[f.tpl] || []).map(([name, type]) => ({ name, work_center_id: meta.work_centers.find(w => w.type === type)?.id, est_min: 60 }));
    const j = await api('POST', '/jobs', f); dlg.close(); await render(); jobDetail(j.id);
  };
}

async function jobDetail(id) {
  const j = await api('GET', `/jobs/${id}`); window.dlg = dlg;
  dlg.innerHTML = `<div style="display:flex;justify-content:space-between"><h2>${esc(j.job_no)} · ${esc(j.part_name)}</h2><button onclick="dlg.close()">✕</button></div>
  <div class="row"><label>Stage<select id="st">${meta.stages.map(s => `<option ${s === j.stage ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
   <label>Priority<select id="pr">${['low', 'normal', 'high', 'urgent'].map(p => `<option ${p === j.priority ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
   <label>Due<input id="du" type="date" value="${j.due_date || ''}"></label></div>
  <div class="sub">${esc(j.customer || '—')} · PO ${esc(j.po || '—')} · ${esc(j.part_no)} rev ${esc(j.rev)} · qty ${j.qty} · ${esc(j.material)}</div>
  <label style="margin-top:8px">Notes<textarea id="nt" rows="2">${esc(j.notes)}</textarea></label>
  <h3>Routing <span class="sub">${hrs(j.est_min)} est / ${hrs(j.actual_min)} actual</span></h3>
  ${j.ops.map(o => `<div class="op"><span class="sub">${o.seq}</span><div class="grow"><b>${esc(o.name)}</b> <span class="sub">${esc(o.work_center || '—')} · est ${hrs(o.est_min)} · actual ${hrs(o.actual_min)}</span></div>
    <span class="pill ${o.status}">${o.status}</span>${o.status === 'done' ? `<button data-op="${o.id}" data-a="reopen">Reopen</button>` : `<button class="ok" data-op="${o.id}" data-a="done">Done</button>`}<button class="bad" data-op="${o.id}" data-a="del">✕</button></div>`).join('') || '<p class="sub">No operations yet.</p>'}
  <form id="of" class="row"><input name="name" placeholder="Add operation…" required><select name="wc">${wcOpts()}</select><input name="est" type="number" placeholder="est min" style="max-width:100px"><button>Add</button></form>
  <h3>Activity</h3><form id="cf" class="row"><input name="body" placeholder="Comment…" required><button>Post</button></form>
  ${j.comments.map(c => `<div class="cmt"><b>${esc(c.who)}</b> <span class="sub">${esc(c.created_at)}</span><div>${esc(c.body)}</div></div>`).join('')}
  <div class="row" style="margin-top:14px"><button class="bad" id="dj" style="flex:0">Delete job</button></div>`;
  dlg.showModal();
  const save = async () => { await api('PATCH', `/jobs/${id}`, { stage: $('#st').value, priority: $('#pr').value, due_date: $('#du').value || null, notes: $('#nt').value, who: user() }); };
  ['#st', '#pr', '#du', '#nt'].forEach(s => $(s).onchange = async () => { await save(); await render(); jobDetail(id); });
  dlg.onclick = async e => { const b = e.target.closest('[data-op]'); if (!b) return; const a = b.dataset.a;
    if (a === 'del') { if (!confirm('Delete operation?')) return; await api('DELETE', `/ops/${b.dataset.op}`); } else await api('POST', `/ops/${b.dataset.op}/${a}`, { who: user() });
    await render(); jobDetail(id); };
  $('#of').onsubmit = async e => { e.preventDefault(); const f = new FormData(e.target); await api('POST', `/jobs/${id}/ops`, { name: f.get('name'), work_center_id: Number(f.get('wc')), est_min: Number(f.get('est') || 0) }); jobDetail(id); };
  $('#cf').onsubmit = async e => { e.preventDefault(); await api('POST', `/jobs/${id}/comments`, { body: new FormData(e.target).get('body'), who: user() }); jobDetail(id); };
  $('#dj').onclick = async () => { if (confirm('Delete this job?')) { await api('DELETE', `/jobs/${id}`); dlg.close(); render(); } };
}

window.onhashchange = () => { view = location.hash.slice(1) || 'board'; render(); };
render();
