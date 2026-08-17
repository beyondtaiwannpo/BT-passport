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
  // badEmail 是六句裡唯一**刻意不附組織信箱**的一句，spec §6.1 明文寫進去的決定：
  // 這是使用者自己就能修好的問題（打錯字），附上信箱等於把一個改一個字母的事
  // 升級成一封求助信。**不要為了跟其他五句一致而幫它加上信箱。**
  badEmail: "這個 email 看起來不太對，檢查一下有沒有打錯。",
  shortPw:  "密碼至少要 6 個字。",
  offline:  "現在連不上資料庫。請寄信到 beyondtaiwan2020@gmail.com，資料都還在。",
  badLogin: "email 或密碼不對。忘記密碼的話寄信到 beyondtaiwan2020@gmail.com。",
  other:    "出了點狀況，再試一次。還是不行的話寄信到 beyondtaiwan2020@gmail.com。"
};

// ┌───────────────────────────────────────────────────────────────────────────┐
// │ 判斷條件：signUp 路徑上的五種形狀全部已對正式專案實測（2026-08-17 兩輪    │
// │ probe），只剩 badLogin（signIn 路徑）沒量過。改的時候只改這張表。         │
// └───────────────────────────────────────────────────────────────────────────┘
// 實測值（spec §6.1 有同一張表，兩邊要一致）：
//   邀請碼無效     AuthRetryableFetchError / 500 / code null / "Database error saving new user"
//   邀請碼已用完   AuthRetryableFetchError / 500 / code null / "Database error saving new user"
//   email 已註冊   AuthApiError            / 422 / user_already_exists / "User already registered"
//   密碼太短       AuthWeakPasswordError   / 422 / weak_password      / "Password should be at least 6 characters."
//   email 格式不對 AuthApiError            / 400 / validation_failed  / "Unable to validate email address: invalid format"
//
// ★ 兩個一定要記住的碰撞 ★
//   1. status 422 同時是「email 已註冊」與「密碼太短」的 status。
//      **任何想用 status 區分這兩者的寫法都是錯的**，一律以 code 為準。
//      下面沒有任何一條認得出 422 —— 認 status 的只有 offline（0）與 invite（>= 500），
//      兩者都碰不到 422，所以這兩種情況不可能互相搶走對方的案例。測試兩個方向都釘住了。
//   2. name AuthRetryableFetchError 同時是「真的連不上」與「伺服器 500」的 name。
//      分辨兩者的只有 status（0 vs 500），見 offline 那條的註解。
//
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

  // 密碼太短。**已實測（2026-08-17，probe 情境 4，密碼 "12345"）**：
  //   name "AuthWeakPasswordError"、status 422、code "weak_password"、
  //   message "Password should be at least 6 characters."、rest.reasons ["length"]
  // 比預期好：有一個機器可讀而且穩定的 code，所以主判斷就用 code，不必去讀英文句子。
  // name 是同一次實測到的第二個訊號，留著當備援。
  // 最後那段字串比對只是給舊版 GoTrue 的退路（舊版不一定給 code），不是主判斷 ——
  // 它比較鬆，所以永遠排在 code 後面。
  { key: "shortPw", when: (e, m, s, c) => c === "weak_password" || e.name === "AuthWeakPasswordError"
      || (m.includes("password") && (m.includes("6") || m.includes("short") || m.includes("weak"))) },

  // email 已註冊。**已實測（2026-08-17，第二輪 probe 情境 B）**：
  //   name "AuthApiError"、status 422、code "user_already_exists"、
  //   message "User already registered"、rest.__isAuthError true，而且 data.user 是 null。
  // 跟 weak_password 同一個處理方式：主判斷用機器可讀的 code，字串比對降成舊版 GoTrue
  // 的退路（舊版不一定給 code），所以排在 code 後面。
  // status 是 422，跟「密碼太短」同一個 —— 見檔案上方的碰撞說明，不要用 status 分辨。
  //
  // ★ 下面那條「200 + identities 空陣列」的路徑（在 signUp() 裡，不在這張表上）
  //   **不是死程式碼，不要刪。** 這次量到 4xx，只是因為這個專案的
  //   「防止帳號列舉」(Prevent account enumeration / Confirm email) 目前是**關**的。
  //   那是 Supabase 後台一個開關，任何人任何時候都可以打開；打開之後同一個情況會變成
  //   回 200 加上 data.user.identities === []，一個字的程式都不用改，形狀就翻面了，
  //   而且那條路上根本沒有 error 物件可以看（所以這張表看不到它）。
  //   看到這裡的 422 已實測就把那條當多餘而刪掉的話，設定一被打開，重複註冊會變成
  //   「看起來成功了」——學生以為註冊好了，其實沒有。兩種形狀都要繼續留著。
  { key: "dupEmail", when: (e, m, s, c) => c === "user_already_exists" || c.includes("email_exists")
      || m.includes("already registered") || m.includes("already been registered") || m.includes("user already") },

  // email 格式不對（spec §6.1 第六列，2026-08-17 加）。**已實測**：
  //   name "AuthApiError"、status 400、code "validation_failed"、
  //   message "Unable to validate email address: invalid format"、rest.__isAuthError true
  // 這筆資料是真的量到的，但**是意外量到的**：第一輪 probe 的情境 3 本來要測「重複 email」，
  // 那一格卻是空的，送出去的空字串先被 GoTrue 的 email 格式檢查擋下來，才照出這個形狀。
  // 也就是說：形狀本身可信（真專案、真回應），但它只涵蓋「空字串」這一種格式錯誤，
  // 沒有涵蓋「漏了 @」「多了空白」那些；那些回的**應該**是同一個 code，但沒有量過。
  //
  // 兩個條件都要：code 是機器可讀的主判斷，但 validation_failed 是個比「email 格式」
  // 更大的桶子（GoTrue 用同一個 code 回報別種欄位驗證失敗），所以再用 message 收窄。
  //
  // 位置：排在 dupEmail 後面。當初這樣排是因為重複 email 還沒量過，怕兩者字眼撞在一起；
  // 第二輪已經量到了，兩邊的 code 各自明確且不同（user_already_exists / validation_failed），
  // **確定沒有重疊，順序現在只是歷史，不再承擔任何風險**。維持原樣是因為改順序沒有好處，
  // 而每次動順序都要重新想一遍會不會被誰吃掉。
  //
  // 這條也不會被上面任何一條吃掉：offline 認 status 0（這裡是 400）、
  // shortPw 認 weak_password 或含 password 的訊息（這裡兩者皆非）、
  // dupEmail 認 user_already_exists / email_exists / already registered（都不是）。
  //
  // 完全空白的 email 走不到這裡 —— main.js 在送出前就擋掉了，根本不會發請求。
  // 所以這條實際服務的是「有填、但格式不對」的人，例如 wang@gmail（漏了 .com）。
  { key: "badEmail", when: (e, m, s, c) => c === "validation_failed" && m.includes("validate email") },

  // 登入時 email 或密碼錯。**這是唯一一條還沒實測的規則。**
  // 兩輪 probe 都碰不到它：probe 只打 signUp，這條在 signIn 的路徑上。
  // 所以下面的 code 與字串都還是照 GoTrue 文件寫的，沒有量過（spec §6.1 末段也這樣記著）。
  // 補這一刀的方式不需要再寫一頁工具：brief Step 8 的手動情境裡有「用錯的密碼登入一次」，
  // 做那一步的時候順手把 console 裡的原始錯誤記下來，回來校對這一條。
  { key: "badLogin", when: (e, m, s, c) => c.includes("invalid_credentials")
      || m.includes("invalid login credentials") },

  // 邀請碼：trigger raise 之後 GoTrue 回通用 500「Database error saving new user」。
  // **兩種邀請碼問題都已實測，而且回的東西逐字相同（2026-08-17）**：
  //   第一輪情境 1，無效的碼 "WRONG-CODE" →
  //     name "AuthRetryableFetchError"、status 500、code null、
  //     message "Database error saving new user"、rest.__isAuthError true
  //   第二輪情境 A，已用完的碼（uses_left = 0，送出前確認過）→
  //     **一個字元都不差，跟上面完全一樣。**
  // 也就是說：前端**真的無法分辨**「這組碼不存在」與「這組碼被用完了」。
  // 這就是 spec §6.1 把兩者寫成同一句「這個邀請碼不對，或是已經被用完了」的原因 ——
  // 那是被迫的結果，不是偷懶。想在畫面上分開講這兩件事，需要的是後端多給一個訊號，
  // 不是在這裡多寫一個 if；沒有那個訊號之前，任何「猜哪一種」的程式都是在騙人。
  //
  // 注意 code 是 null，所以能用的訊號只有 status —— 這就是為什麼這條認的是 s >= 500
  // 而不是某個 code。也因為 name 跟「真的連不上」一模一樣，分辨兩者的只有 status，
  // 上面那條 s === 0 一定要排在前面（見該條的註解）。
  // 這條最寬，會吃掉所有排在它後面的東西，所以一定要留在最後。
  // （資料庫層的旁證仍然成立：supabase/rls-test.sql 第 65 條，spec §11-5，
  //   trigger 對兩者丟同一個 P0001。現在它是佐證，不再是唯一的依據。）
  { key: "invite", when: (e, m, s) => s >= 500 || m.includes("database error") }
];

// 絕對不能把原始錯誤丟給高中生看（spec §6.1）。一律翻譯。
export function authMessage(err) {
  if (!err) return MSG.other;
  const m = String(err.message || "").toLowerCase();
  const c = String(err.code || "").toLowerCase();
  const s = Number(err.status || 0);
  const hit = RULES.find(r => r.when(err, m, s, c));
  // 「邀請碼」那條是 s >= 500，也就是**所有**伺服器錯誤都會落到它 —— 邀請碼真的不對、
  // 邀請碼用完了、資料庫當機、trigger 壞掉，畫面上都是同一句。這是沒辦法的事：
  // GoTrue 對這幾種情況回的東西逐字相同（500 / code null / "Database error saving new user"，
  // 2026-08-17 實測），前端沒有任何訊號可以分辨，spec §6.1 因此讓它們共用一句。
  // 但「使用者看到同一句」不代表「除錯的人也只能看到同一句」。原始錯誤留在 console，
  // 免得下一個人為了知道是哪一種而去讀原始碼（2026-08-17 真的發生過）。
  // console 是給部署／維護的人看的，畫面上永遠不會出現原始錯誤（spec §6.1）。
  if (hit && hit.key === "invite") {
    console.error(
      "註冊失敗，被歸到「邀請碼不對或已用完」那一句。\n" +
      "這一句同時涵蓋「伺服器出狀況」—— 兩者在前端完全分不出來，所以要自己查是哪一種：\n" +
      "  1. SQL Editor：select code, uses_left from invite_codes where code = '學生實際輸入的碼';\n" +
      "     比對是嚴格相同、**分大小寫**，管理員存什麼大小寫，學生就要打什麼大小寫。\n" +
      "  2. 查不到那一列，或 uses_left = 0 → 真的是邀請碼的問題。\n" +
      "  3. 查得到而且 uses_left > 0 → 不是邀請碼，去看 Supabase 後台的 Logs，\n" +
      "     多半是資料庫或註冊 trigger 出事。\n" +
      "原始錯誤：",
      { name: err.name, status: err.status, code: err.code, message: err.message });
  }
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
  // 重複 email 的第二種形狀（spec §6.1 有寫）：Supabase 的「防止帳號列舉」設定開啟時，
  // 重複 email 不會回錯誤，而是回一個 identities 為空陣列的 user。
  // 2026-08-17 第二輪 probe 實測本專案走的是 4xx 那條（422 user_already_exists，
  // data.user 為 null），代表那個設定目前是關的 —— 所以下面這段**這次沒有跑到**。
  // **它不是死程式碼，不要刪。** 那是後台一個開關，打開之後形狀就翻面，而且翻面之後
  // 沒有 error 物件可看，沒有這段的話重複註冊會變成「看起來成功了」。
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
