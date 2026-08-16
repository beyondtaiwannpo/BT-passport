// 暫時的 localStorage 儲存層。Task 6 會把每個函式的內容換成 Supabase，
// 簽名不變。這一版的存在是為了讓拆檔可以獨立驗證。
//
// 下面的 auth 區段（Task 5）已經是真的 Supabase，不是 localStorage —— 登入註冊
// 沒有本機版可言。護照內容的讀寫要等 Task 6 才一起換過去。
import { createClient } from "../vendor/supabase-js.js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

/* ---------- auth ---------- */

// 畫面文案逐字抄自 spec §6.1。這幾行是規格，不是文案建議，不要改寫、不要「潤飾」。
// 任何錯誤訊息都只能寄到組織信箱，不得出現任何人的名字或私人信箱（spec §11-20）。
const MSG = {
  invite:   "這個邀請碼不對，或是已經被用完了。跟你的組長要一組新的。",
  dupEmail: "這個 email 已經有護照了，直接登入就好。",
  shortPw:  "密碼至少要 6 個字。",
  offline:  "現在連不上資料庫。請寄信到 beyondtaiwan2020@gmail.com，資料都還在。",
  badLogin: "email 或密碼不對。忘記密碼的話寄信到 beyondtaiwan2020@gmail.com。",
  other:    "出了點狀況，再試一次。還是不行的話寄信到 beyondtaiwan2020@gmail.com。"
};

// ┌───────────────────────────────────────────────────────────────────────────┐
// │ 判斷條件：暫定，尚未用真的專案實測。改的時候只改這張表。                  │
// └───────────────────────────────────────────────────────────────────────────┘
// 為什麼是暫定：trigger `raise` 之後，Supabase 回給前端的是籠統的資料庫錯誤，
// 不會是 `invite_invalid` 這種好認的字串；實際的 status / code / message 三者長什麼樣，
// 只有真的失敗一次才知道，而且會隨 GoTrue 版本變（brief Step 3）。寫這段程式時手上
// 還沒有專案網址與金鑰，所以下面每一條 when() 都是照 spec §6.1 的假設寫的猜測。
//
// 拿到金鑰之後要做的事（順序不可以顛倒）：
//   1. 把 src/config.js 換成真值。
//   2. 開 probe.html，跑完四個情境，複製它印出來的原始錯誤物件。
//   3. 拿實測到的 status / code / message 逐條校對下面的 when()，不合就改 when()。
//   4. 把四次原始回應貼進 task-5-report.md；若與 spec §6.1 的假設不符，回報並更新 spec。
// **只准改 when()。** MSG 的文案是 spec §6.1 逐字抄來的，改文案要先改 spec。
//
// 參數：e = 原始錯誤物件、m = 小寫後的 message、c = 小寫後的 code、s = 數字化的 status。
// 由上往下比，第一條命中就用它，所以順序本身也是判斷的一部分：
// 連不上要排在最前面（連不上的時候其他欄位都不可信），籠統的 500 要排在最後面
// （它是「剩下的都算邀請碼問題」，會吃掉所有排在它後面的情況）。
const RULES = [
  // 連不上：判斷的是 status 0，不是 name。
  // **不要改成用 name 判斷。** 本機拿 vendored supabase-js 實測過兩件事：
  //   真的連不上 → name "AuthRetryableFetchError"、status 0、message "fetch failed"
  //                （瀏覽器是 "Failed to fetch"）
  //   伺服器回 500 → name 也是 "AuthRetryableFetchError"，但 status 是 500
  // 兩者共用同一個 name，所以只認 name 會把「邀請碼錯」誤報成「連不上」——
  // 這正是 trigger raise 之後最可能走到的那條路。分辨兩者的是 status。
  { key: "offline", when: (e, m, s) => s === 0 || e.name === "TypeError"
      || m.includes("failed to fetch") || m.includes("fetch failed")
      || m.includes("networkerror") || m.includes("load failed") },

  // 密碼太短：GoTrue 對 signUp 的密碼長度檢查。本機用假的 422 回應驗證過形狀是
  // name "AuthWeakPasswordError"、code "weak_password"；真實訊息文字未實測。
  { key: "shortPw", when: (e, m, s, c) => c.includes("weak_password") || e.name === "AuthWeakPasswordError"
      || (m.includes("password") && (m.includes("6") || m.includes("short") || m.includes("weak"))) },

  // email 已註冊（4xx 形狀）。另一種形狀是回 200 但 identities 為空陣列，
  // 那個判斷在 signUp() 裡，不在這張表上 —— 因為那條路徑根本沒有 error 物件可以看。
  { key: "dupEmail", when: (e, m, s, c) => c.includes("user_already_exists") || c.includes("email_exists")
      || m.includes("already registered") || m.includes("already been registered") || m.includes("user already") },

  // 登入時 email 或密碼錯。
  { key: "badLogin", when: (e, m, s, c) => c.includes("invalid_credentials")
      || m.includes("invalid login credentials") },

  // 邀請碼：trigger raise 之後 GoTrue 回通用 500「Database error saving new user」。
  // spec §6.1 假設這是唯一會讓 signUp 拋 500 的路徑，所以 500 一律視為邀請碼問題。
  // 這條最寬，一定要留在最後。**這是最需要實測確認的一條。**
  // 另外注意：supabase-js 把 5xx 當成可重試，會自己重試幾次才把錯誤交出來，
  // 所以打錯邀請碼的人要等幾秒才看得到訊息。這是函式庫行為，不是這裡的 bug。
  { key: "invite", when: (e, m, s) => s >= 500 || m.includes("database error") }
];

// 絕對不能把原始錯誤丟給高中生看（spec §6.1）。一律翻譯。
export function authMessage(err) {
  if (!err) return MSG.other;
  const m = String(err.message || "").toLowerCase();
  const c = String(err.code || "").toLowerCase();
  const s = Number(err.status || 0);
  const hit = RULES.find(r => r.when(err, m, s, c));
  return hit ? MSG[hit.key] : MSG.other;
}

// invite 進來之前已經由呼叫端（main.js 讀輸入框的那一行）trim + 轉大寫。
// 正規化只做在輸入層一處，資料庫那邊的比對是刻意精確且分大小寫的。
export async function signUp(email, pw, invite) {
  const { data, error } = await supabase.auth.signUp({
    email, password: pw,
    options: { data: { invite: invite } }
  });
  if (error) throw new Error(authMessage(error));
  // Supabase 的「防止帳號列舉」設定開啟時，重複 email 不會回錯誤，
  // 而是回一個 identities 為空陣列的 user。這是 spec §6.1 沒有涵蓋的第三種形狀。
  if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new Error(MSG.dupEmail);
  }
  return data;
}

export async function signIn(email, pw) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: pw });
  if (error) throw new Error(authMessage(error));
  return data;
}

export async function signOut() { await supabase.auth.signOut(); }

export async function currentUser() {
  const { data } = await supabase.auth.getUser();
  return (data && data.user) || null;
}

/* ---------- 護照內容（Task 6 會換成 Supabase） ---------- */
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

// 清除這個人自己的整本護照。localStorage 版直接砍掉那把 key；Task 6 換
// Supabase 之後，這裡要做的是刪掉這個使用者自己名下的 passport/stamps 列
// （RLS 保證刪不到別人的）。加進六個函式的介面清單，是因為 spec §11 的驗收
// 標準要求「匯出 → 清除護照 → 匯入還原」要真的能動作；沒有這個函式時，
// main.js 只能繞過 data.js 直接戳 localStorage，Task 6 換後端後這個「清除」
// 會變成只清畫面、資料庫裡的資料還在，卻沒有任何錯誤訊息可以看出來。
export async function clearAll() {
  localStorage.removeItem(KEY);
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
