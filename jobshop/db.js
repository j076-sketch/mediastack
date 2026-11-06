import { DatabaseSync } from 'node:sqlite';

export const STAGES = ['Quoted','Material Ordered','Ready to Run','In Production','QC','Ready to Ship','Shipped'];

export function open(file = process.env.DB_FILE || 'jobshop.db') {
  const db = new DatabaseSync(file);
  db.exec(`
  PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS work_centers(id INTEGER PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, hours_per_day REAL DEFAULT 8);
  CREATE TABLE IF NOT EXISTS customers(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
  CREATE TABLE IF NOT EXISTS jobs(
    id INTEGER PRIMARY KEY, job_no TEXT UNIQUE, customer_id INTEGER REFERENCES customers(id),
    part_name TEXT NOT NULL, part_no TEXT, rev TEXT DEFAULT 'A', qty INTEGER DEFAULT 1, material TEXT,
    due_date TEXT, priority TEXT DEFAULT 'normal', stage TEXT DEFAULT 'Quoted', po TEXT, notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS ops(
    id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL, name TEXT NOT NULL, work_center_id INTEGER REFERENCES work_centers(id),
    est_min REAL DEFAULT 0, actual_min REAL DEFAULT 0, status TEXT DEFAULT 'todo', assignee TEXT, instructions TEXT);
  CREATE TABLE IF NOT EXISTS time_entries(id INTEGER PRIMARY KEY, op_id INTEGER NOT NULL REFERENCES ops(id) ON DELETE CASCADE,
    who TEXT, started_at TEXT NOT NULL, ended_at TEXT);
  CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    who TEXT, body TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS materials(id INTEGER PRIMARY KEY, name TEXT NOT NULL, spec TEXT, stock REAL DEFAULT 0, reorder_at REAL DEFAULT 0, unit TEXT DEFAULT 'sheets', supplier TEXT);
  `);
  return db;
}

const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

export function seed(db) {
  if (db.prepare('SELECT COUNT(*) c FROM jobs').get().c) return;
  const wc = db.prepare('INSERT INTO work_centers(name,type,hours_per_day) VALUES(?,?,?)');
  const wcs = [['Fiber Laser','laser',8],['Press Brake 1','brake',8],['Press Brake 2','brake',8],['Weld Cell','weld',8],
    ['Haas VF-2 Mill','cnc-mill',8],['Haas ST-20 Lathe','cnc-lathe',8],['Deburr / Finish','finish',8],['Powder Coat','coat',8],['Inspection (CMM)','qc',8],['Shipping','ship',8]];
  const wid = {}; wcs.forEach(w => { wid[w[1] === 'brake' && w[0].endsWith('2') ? 'brake2' : w[1]] = Number(wc.run(...w).lastInsertRowid); });
  const cu = db.prepare('INSERT INTO customers(name) VALUES(?)'); const cid = {};
  ['Acme Aerospace','Northwind Controls','Summit Ag Equipment','Blue Ridge Medical'].forEach(n => cid[n] = Number(cu.run(n).lastInsertRowid));
  const jb = db.prepare('INSERT INTO jobs(job_no,customer_id,part_name,part_no,qty,material,due_date,priority,stage,po,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  const op = db.prepare('INSERT INTO ops(job_id,seq,name,work_center_id,est_min,status,actual_min) VALUES(?,?,?,?,?,?,?)');
  const jobs = [
    ['J-1001','Acme Aerospace','Avionics Bracket','AB-220',50,'5052-H32 .063" Al',3,'high','In Production','PO-7781','Anodize outsourced after QC',
      [['Laser cut','laser',40,'done',44],['Form (2 bends)','brake',60,'running',20],['Deburr','finish',30,'todo',0],['CMM inspect','qc',45,'todo',0]]],
    ['J-1002','Summit Ag Equipment','Hopper Side Panel','SA-9140',200,'A36 11ga CS',10,'normal','Ready to Run','PO-5520','',
      [['Laser cut','laser',120,'todo',0],['Form','brake',180,'todo',0],['Weld','weld',300,'todo',0],['Powder coat','coat',90,'todo',0],['Ship','ship',20,'todo',0]]],
    ['J-1003','Northwind Controls','Enclosure Door','NC-3301',25,'304 SS 16ga',6,'normal','Material Ordered','PO-1188','Waiting on 4x10 304 sheet',
      [['Laser cut','laser',35,'todo',0],['Form','brake',50,'todo',0],['Weld + grind','weld',120,'todo',0],['Finish #4','finish',60,'todo',0]]],
    ['J-1004','Blue Ridge Medical','Pump Housing','BR-0042',30,'6061-T6 Al bar',8,'high','Ready to Run','PO-9003','First article required',
      [['Mill op 1','cnc-mill',180,'todo',0],['Mill op 2','cnc-mill',150,'todo',0],['Deburr','finish',45,'todo',0],['CMM FAI','qc',90,'todo',0]]],
    ['J-1005','Acme Aerospace','Shaft Collar','AA-771',100,'17-4PH bar',-1,'urgent','In Production','PO-7790','Customer called twice',
      [['Turn OD/ID','cnc-lathe',200,'done',215],['Cross-drill (mill)','cnc-mill',90,'running',30],['Deburr','finish',40,'todo',0],['Inspect','qc',60,'todo',0]]],
    ['J-1006','Summit Ag Equipment','Gusset Plate','SA-9188',500,'A36 .25" plate',14,'low','Quoted','','Quote sent, awaiting PO',
      [['Laser cut','laser',90,'todo',0],['Deburr','finish',120,'todo',0]]],
    ['J-1007','Northwind Controls','Mounting Rail','NC-3377',150,'5052 Al .08"',-3,'normal','Ready to Ship','PO-1201','',
      [['Laser cut','laser',50,'done',48],['Form','brake',70,'done',82],['Inspect','qc',30,'done',25],['Ship','ship',15,'todo',0]]],
  ];
  for (const j of jobs) {
    const id = Number(jb.run(j[0], cid[j[1]], j[2], j[3], j[4], j[5], day(j[6]), j[7], j[8], j[9], j[10]).lastInsertRowid);
    j[11].forEach((o, i) => op.run(id, i + 1, o[0], wid[o[1]], o[2], o[3], o[4]));
  }
  const m = db.prepare('INSERT INTO materials(name,spec,stock,reorder_at,unit,supplier) VALUES(?,?,?,?,?,?)');
  [['5052-H32 Aluminum','.063" 4x10',14,10,'sheets','Metals Depot'],['A36 Steel','11ga 4x10',40,15,'sheets','Metals Depot'],
   ['304 Stainless','16ga 4x10',2,6,'sheets','Ryerson'],['6061-T6 Bar','3" dia x 12ft',5,4,'bars','Ryerson'],
   ['17-4PH Bar','1.5" dia x 12ft',3,4,'bars','Online Metals'],['Laser nitrogen','cylinder',2,2,'tanks','Airgas']].forEach(r => m.run(...r));
}
