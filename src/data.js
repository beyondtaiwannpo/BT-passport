// 暫時的 localStorage 儲存層。Task 6 會把每個函式的內容換成 Supabase，
// 簽名不變。這一版的存在是為了讓拆檔可以獨立驗證。
const KEY = "bt-passport:local";

// 活動與月份在正式版來自資料庫。這一版先從 activities.json 讀，
// 讓拆檔階段就用「非同步取得活動」的形狀，Task 6 換來源時不必改 ui.js。
async function seedFromJson() {
  const r = await fetch("./activities.json");
  const j = await r.json();
  return {
    months: j.months,
    activities: j.activities.map(a => ({
      id: a.id, month: a.month, category: a.category,
      title_zh: a.title_zh, title_en: a.title_en,
      description: a.desc, needs_host: a.needs_host,
      callback_to: a.callback_to || null, active: true
    }))
  };
}

function readLocal() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch (e) { return {}; }
}
function writeLocal(o) { localStorage.setItem(KEY, JSON.stringify(o)); }

export async function loadAll() {
  const { months, activities } = await seedFromJson();
  const d = readLocal();
  return {
    profile: d.profile || null,
    stamps: d.stamps || {},
    entries: d.entries || {},
    months, activities
  };
}

export async function saveProfile(p) {
  const d = readLocal();
  d.profile = Object.assign({ issued: new Date().toISOString().slice(0, 10) }, d.profile, p);
  if (!d.profile.id) d.profile.id = "local-" + Math.random().toString(36).slice(2, 10);
  writeLocal(d);
}

export async function saveAvatar(dataUrl) {
  const d = readLocal();
  if (!d.profile) return;
  d.profile.avatar = dataUrl;
  writeLocal(d);
}

export async function saveStamp(actId, { date, note, photo }) {
  const d = readLocal();
  d.stamps = d.stamps || {}; d.entries = d.entries || {};
  d.stamps[actId] = { date };
  d.entries[actId] = { note: note || "", photo: photo || null };
  writeLocal(d);
}

export async function removeStamp(actId) {
  const d = readLocal();
  if (d.stamps) delete d.stamps[actId];
  if (d.entries) delete d.entries[actId];
  writeLocal(d);
}

export async function loadWall() {
  const d = readLocal();
  if (!d.profile) return [];
  return [{
    id: d.profile.id, name_zh: d.profile.name_zh, name_en: d.profile.name_en,
    team: d.profile.team, avatar: d.profile.avatar || null,
    stamps: Object.keys(d.stamps || {}).map(k => ({ act_id: k, stamped_on: d.stamps[k].date }))
  }];
}

// 護照號碼由 id 決定，固定不變。Task 6 之後 id 是 auth uuid，
// 所以護照號碼從此穩定，不會因為重新登入而變（spec §7.2）。
export function passportNo(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return "BT" + String(h % 10000000).padStart(7, "0");
}
