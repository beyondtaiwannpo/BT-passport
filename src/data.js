// 暫時的 localStorage 儲存層。Task 6 會把每個函式的內容換成 Supabase，
// 簽名不變。這一版的存在是為了讓拆檔可以獨立驗證。
//
// 下面的 auth 區段（Task 5）已經是真的 Supabase，不是 localStorage —— 登入註冊
// 沒有本機版可言。護照內容的讀寫要等 Task 6 才一起換過去。
import { createClient } from "../vendor/supabase-js.js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

// createClient 會對格式不對的網址（少了 https://、多了空白之類）當場 throw
// 「Invalid supabaseUrl」。這裡是 module scope，throw 出去就是 data.js 匯入失敗、
// main.js 跟著匯入失敗、整頁全白，一句話都沒有 —— 直接違反 spec §8.1「連不上資料庫時
// 前端不得空白」。而下一步正好是人手動把網址貼進 config.js，打錯的機率不低，所以擋起來。
let client = null;
try {
  client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
} catch (e) {
  // 給部署的人看的線索留在 console；學生看到的是 configMessage() 那句翻譯過的中文。
  console.error("src/config.js 的 SUPABASE_URL 或 SUPABASE_PUBLISHABLE_KEY 格式不對：", e);
}
export const supabase = client;

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
// │ 判斷條件：部分已用真的專案實測（2026-08-17 第一次 probe），部分仍是暫定。 │
// │ 每一條下面都註明「實測」還是「暫定」。改的時候只改這張表。                │
// └───────────────────────────────────────────────────────────────────────────┘
// 第一次 probe（.superpowers/sdd/2026-08-16-bt-passport/probe.html，對真專案跑）
// 的結果：四個情境裡只有兩個測到了東西，另外兩個被 probe 頁自己的 bug 弄壞了。
//   情境 1 無效邀請碼   → 有效資料，見下面 invite 那條。
//   情境 4 密碼 "12345" → 有效資料，見下面 shortPw 那條。
//   情境 2 已用完的碼   → 無效：送出時那組碼還有 uses_left = 1，測到的其實是
//                        「有效碼、第一次使用」，而且真的建了一個帳號。
//   情境 3 重複 email   → 無效：email 欄是空的，測到的是「email 格式不對」。
// 所以「已用完的碼」與「重複 email」到現在都還沒有前端實測值，見那兩條的註解。
//
// 還沒實測的那兩項要怎麼補（順序不可以顛倒）：
//   1. 照 probe.html 頁首的前置條件清單把資料庫狀態擺好（這是第一次失敗的原因）。
//   2. 開 probe.html，兩個情境各按一次，複製它印出來的原始物件。
//   3. 拿實測到的 status / code / message 校對下面的 when()，不合就改 when()。
//   4. 把原始回應貼進 task-5-report.md；若與 spec §6.1 的假設不符，回報並更新 spec。
// **只准改 when()。** MSG 的文案是 spec §6.1 逐字抄來的，改文案要先改 spec。
//
// 已知但這張表刻意不處理的一種形狀（等 spec 決定，見 task-5-report.md「需要 spec 決定」）：
// email 格式不對時回的是 name "AuthApiError"、status 400、code "validation_failed"、
// message "Unable to validate email address: invalid format"（2026-08-17 實測，
// 來自情境 3 的意外）。它會落到最後的 MSG.other「出了點狀況」。這句對「只是打錯 email」
// 的學生沒有幫助，但 spec §6.1 的五句文案是固定的，加第六句要先改 spec，不是這裡自己加。
// 空白欄位那一半已經在 main.js 送出前擋掉了，不會再打一次網路。
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

  // 密碼太短。**已實測（2026-08-17，probe 情境 4，密碼 "12345"）**：
  //   name "AuthWeakPasswordError"、status 422、code "weak_password"、
  //   message "Password should be at least 6 characters."、rest.reasons ["length"]
  // 比預期好：有一個機器可讀而且穩定的 code，所以主判斷就用 code，不必去讀英文句子。
  // name 是同一次實測到的第二個訊號，留著當備援。
  // 最後那段字串比對只是給舊版 GoTrue 的退路（舊版不一定給 code），不是主判斷 ——
  // 它比較鬆，所以永遠排在 code 後面。
  { key: "shortPw", when: (e, m, s, c) => c === "weak_password" || e.name === "AuthWeakPasswordError"
      || (m.includes("password") && (m.includes("6") || m.includes("short") || m.includes("weak"))) },

  // email 已註冊（4xx 形狀）。另一種形狀是回 200 但 identities 為空陣列，
  // 那個判斷在 signUp() 裡，不在這張表上 —— 因為那條路徑根本沒有 error 物件可以看。
  //
  // **仍然是暫定，一個字都還沒實測到。** 第一次 probe 的情境 3 沒有量到它：那一格的
  // email 是空的，所以送出去的是空字串，GoTrue 先擋在 email 格式檢查（AuthApiError /
  // 400 / validation_failed），根本沒走到「這個 email 已經有人用了」那條路。
  // 因此下面這些 code / message 全部是照 GoTrue 原始碼與文件猜的，沒有一項來自實測。
  //
  // 還不知道的是：這個專案的「防止帳號列舉」設定是開還是關 —— 開著就回 200 加
  // identities 空陣列（走 signUp() 裡那條，這張表看不到），關著才回 4xx（走這條）。
  // 兩種形狀都必須繼續留著，直到第二次 probe 量出來到底是哪一種為止。
  // 順帶要量的還有：失敗的重複註冊會不會把邀請碼的 uses_left 扣掉（會的話，打錯
  // email 的學生等於白白燒掉一組碼），probe 頁的情境 B 就是為了這件事。
  { key: "dupEmail", when: (e, m, s, c) => c.includes("user_already_exists") || c.includes("email_exists")
      || m.includes("already registered") || m.includes("already been registered") || m.includes("user already") },

  // 登入時 email 或密碼錯。
  { key: "badLogin", when: (e, m, s, c) => c.includes("invalid_credentials")
      || m.includes("invalid login credentials") },

  // 邀請碼：trigger raise 之後 GoTrue 回通用 500「Database error saving new user」。
  // **已實測，spec §6.1 的假設成立（2026-08-17，probe 情境 1，邀請碼 "WRONG-CODE"）**：
  //   name "AuthRetryableFetchError"、status 500、code null、
  //   message "Database error saving new user"、rest.__isAuthError true
  // 注意 code 是 null，所以能用的訊號只有 status —— 這就是為什麼這條認的是 s >= 500
  // 而不是某個 code。也因為 name 跟「真的連不上」一模一樣，分辨兩者的只有 status，
  // 上面那條 s === 0 一定要排在前面（見該條的註解）。
  // 這條最寬，會吃掉所有排在它後面的東西，所以一定要留在最後。
  //
  // 「邀請碼已被用完」共用這一條，但**是推論出來的，前端沒有直接量到**：
  // supabase/rls-test.sql 的第 65 條（spec §11-5）在資料庫層證明了 trigger 對
  // 「已用完的碼」丟的是跟「無效的碼」同一個 P0001，而 GoTrue 對 trigger 的 P0001
  // 一律轉成上面那個通用 500，所以前端應該會拿到一模一樣的東西。第一次 probe 的
  // 情境 2 本來要驗這件事，但送出時那組碼還有 uses_left = 1，測到的是「有效碼、
  // 第一次使用」，等於沒測到。第二次 probe 的情境 A 就是要補這一刀。
  // 在補到之前，這裡寫的是推論，不要在別的地方把它說成「實測過」。
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

// config.js 填錯、client 根本建不出來時，畫面該顯示哪一句。放在 data.js 是為了讓
// 文案的真相來源只有 MSG 一處；config 沒問題時回空字串，呼叫端不必判斷。
export function configMessage() { return client ? "" : MSG.offline; }

// invite 進來之前已經由呼叫端（main.js 讀輸入框的那一行）trim + 轉大寫。
// 正規化只做在輸入層一處，資料庫那邊的比對是刻意精確且分大小寫的。
export async function signUp(email, pw, invite) {
  if (!supabase) throw new Error(MSG.offline);
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
  if (!supabase) throw new Error(MSG.offline);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: pw });
  if (error) throw new Error(authMessage(error));
  return data;
}

export async function signOut() { if (supabase) await supabase.auth.signOut(); }

export async function currentUser() {
  if (!supabase) return null;
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
