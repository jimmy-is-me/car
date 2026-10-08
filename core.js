export const COLLECTIONS = ['vehicles', 'records', 'reminders'];
export const SCHEMA = 1;
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
export const uuid = () => crypto.randomUUID();
export function emptyState() { return { schema: SCHEMA, vehicles: [], records: [], reminders: [] }; }
export function mergeStates(...states) {
  const out = emptyState();
  for (const collection of COLLECTIONS) {
    const map = new Map();
    for (const state of states) for (const entry of state?.[collection] || []) {
      const old = map.get(entry.id);
      if (!old || entry.updatedAt > old.updatedAt || (entry.updatedAt === old.updatedAt && String(entry.revision) > String(old.revision))) map.set(entry.id, entry);
    }
    out[collection] = [...map.values()];
  }
  return out;
}
export const live = (state, collection) => state[collection].filter(x => !x.deleted);
export function nextStamp(state) {
  return COLLECTIONS.reduce((max,k)=>state[k].reduce((s,x)=>Math.max(s,Number(x.updatedAt)+1),max),Date.now());
}
export function fuelStats(records) {
  const rows = records.filter(r => !r.deleted && r.type === 'fuel').sort((a,b) => a.date.localeCompare(b.date) || a.odometer-b.odometer || String(a.id).localeCompare(String(b.id)));
  let anchor = null, liters = 0; const intervals = [];
  for (const r of rows) {
    if (r.missed) { anchor = null; liters = 0; }
    if (!anchor) { if(r.full) anchor = r; continue; }
    if (r.odometer <= anchor.odometer) { anchor = r.full ? r : null; liters = 0; continue; }
    liters += r.liters;
    if(r.full) {
      const distance = r.odometer - anchor.odometer;
      if(liters > 0) intervals.push({date:r.date, distance, liters, kmL:distance/liters, l100:liters/distance*100});
      anchor = r; liters = 0;
    }
  }
  const distance = intervals.reduce((s,x)=>s+x.distance,0), fuel = intervals.reduce((s,x)=>s+x.liters,0);
  return {intervals, distance, liters:fuel, kmL:fuel>0?distance/fuel:null, l100:distance>0?fuel/distance*100:null};
}
export function mileage(vehicle, records) { return Math.max(Number(vehicle?.odometer)||0,...records.filter(r=>!r.deleted).map(r=>Number(r.odometer)||0)); }
export function addMonths(date, months) {
  if (!date || !Number.isInteger(months) || months < 1) return '';
  const [year, month, day] = date.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}
export function nextServiceDue({date = '', odometer = 0, intervalMonths = 0, intervalKm = 0}) {
  return {dueDate: intervalMonths && date ? addMonths(date, intervalMonths) : '', dueKm: intervalKm && odometer!==null && odometer!=='' && Number.isFinite(Number(odometer)) ? Number(odometer) + Number(intervalKm) : 0};
}
export function reminderStatus(reminder, odometer, date = today()) {
  if(reminder.done) return 'done';
  const days = reminder.dueDate ? Math.round((Date.parse(reminder.dueDate+'T00:00:00Z')-Date.parse(date+'T00:00:00Z'))/86400000) : Infinity;
  const km = reminder.dueKm ? reminder.dueKm-odometer : Infinity;
  if(days<=0 || km<=0) return 'overdue';
  if(days<=30 || km<=1000) return 'soon';
  return 'normal';
}
export function validateState(value) {
  if(!value || value.schema!==SCHEMA) throw new Error('備份格式或版本不支援');
  if(!COLLECTIONS.every(k=>Array.isArray(value[k])) || COLLECTIONS.some(k=>value[k].length>50000)) throw new Error('資料格式錯誤或筆數超過限制');
  const dateOk = v => typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v+'T00:00:00Z')) && new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
  const num = v => typeof v==='number' && Number.isFinite(v) && v>=0;
  const identifier = v => typeof v==='string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
  for (const k of COLLECTIONS) for(const x of value[k]) {
    if(!x || !identifier(x.id) || !num(x.updatedAt) || !identifier(x.revision)) throw new Error('紀錄識別資訊不完整');
    if(Object.values(x).some(v=>typeof v==='string' && v.length>10000)) throw new Error('文字欄位過長');
    if(x.deleted) continue;
    if(k==='vehicles' && (typeof x.name!=='string' || !x.name.trim() || !num(x.odometer))) throw new Error('車輛資料錯誤');
    if(k!=='vehicles' && !identifier(x.vehicleId)) throw new Error('缺少車輛識別碼');
    if(k==='records' && (!['fuel','charge','maintenance','expense','trip','tax','insurance','tire','inflation','battery'].includes(x.type) || !dateOk(x.date) || !num(x.cost) || !num(x.odometer))) throw new Error('紀錄欄位錯誤');
    if(k==='records' && x.type==='fuel' && (!num(x.liters) || x.liters<=0 || typeof x.full!=='boolean' || typeof x.missed!=='boolean')) throw new Error('加油資料錯誤');
    if(k==='records' && x.type==='charge' && (!num(x.kwh) || x.kwh<=0)) throw new Error('充電資料錯誤');
    if(k==='records' && x.type==='trip' && (!num(x.distance) || x.distance<=0)) throw new Error('行程資料錯誤');
    if(k==='records' && x.type==='maintenance' && (!Array.isArray(x.items) || !x.items.length || x.items.some(v=>typeof v!=='string'))) throw new Error('保養項目格式錯誤');
    if(k==='reminders' && (typeof x.title!=='string' || !x.title.trim() || (!x.dueDate && !x.dueKm) || (x.dueDate && !dateOk(x.dueDate)) || (x.dueKm && !num(x.dueKm)) || (x.intervalKm && !num(x.intervalKm)) || (x.intervalMonths && !num(x.intervalMonths)))) throw new Error('提醒資料錯誤');
  }
  return value;
}
export function csvCell(value) { let s=String(value??''); if(/^[=+\-@\t\r]/.test(s)) s="'"+s; return '"'+s.replaceAll('"','""')+'"'; }
