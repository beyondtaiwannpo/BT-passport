// 儲存層。auth 與護照內容都走 Supabase，這個檔案是前端唯一碰資料庫的地方 ——
// ui.js 只畫畫面、main.js 只接事件，兩者都不認識 supabase client。
//
// Task 6（2026-08-17）把護照內容從 localStorage 換成 Supabase，七個函式的簽名一個都沒動，
// ui.js 一行都不用改。那是拆檔設計的驗證點，不是巧合：Task 4 就先把回傳形狀對齊資料表欄位
// （snake_case、description 而不是 desc），localStorage 版只是同一個形狀的另一種來源。
//
// 安全性不在這個檔案裡，在資料庫裡。這裡每一句 .eq("user_id", user.id) 都只是「少傳一點
// 資料回來」的效率措施，**不是**防止讀到別人心得的機制 —— 那是 RLS 的工作（schema.sql
// 的 entries_read）。把這裡的條件拿掉，資料庫仍然只會回自己的列；反過來說，
// 這裡寫得再嚴，RLS 一鬆就全破。改動時不要把這兩層搞混。
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
      "  1. SQL Editor：select code, uses_left from invite_codes\n" +
      "       where upper(btrim(code)) = upper(btrim('學生實際輸入的碼'));\n" +
      "     比對不分大小寫、也不分前後空白（trigger 兩邊都套 upper(btrim(...))），\n" +
      "     所以這裡也要照同樣的寫法查，直接用 code = '...' 會查不到而誤判。\n" +
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

// invite 進來之前呼叫端（main.js 讀輸入框的那一行）只做了 trim，而且那個 trim 只是順手。
// 邀請碼的正規化（前後空白、大小寫）全部由資料庫的註冊 trigger 負責，
// 前端不改使用者打進來的值 —— 見 main.js 那一行上面的說明。
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

/* ---------- 護照內容 ---------- */

// 每個寫入函式開頭都重新問一次 currentUser()，而不是信任呼叫端傳進來的 id。
// 理由：id 若由呼叫端提供，「寫誰的資料」就變成畫面狀態說了算，而畫面狀態可能是
// 上一個使用者留下的（同一台電腦換人登入、session 過期後又登入別的帳號）。
// getUser() 讀的是 client 手上的 session，跟資料庫實際認的身分同一個來源。
// 成本是每次寫入多一次本地查詢，不是多一趟網路 —— supabase-js 有 session 快取。
async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Error("尚未登入");
  return user;
}

export async function loadAll() {
  const user = await currentUser();
  // 未登入不是錯誤，是還沒登入。回空的形狀讓 main.js 的 render() 去顯示登入頁，
  // 這裡 throw 的話畫面會變成錯誤訊息，那是在對還沒登入的人說「出事了」。
  if (!user) return { profile: null, stamps: {}, entries: {}, activities: [], months: [] };

  // 五個查詢彼此不相依，一起發。序列發的話是五個 RTT，在手機網路上很有感。
  const [mo, ac, pa, st, en] = await Promise.all([
    supabase.from("months").select("*").order("seq"),
    // month 之後一定要再 order("seq")：同月份有多個活動，只排 month 的話同月內順序
    // 由資料庫決定，也就是「不保證」—— 活動格子會在每次載入之間換位置，而學生記的是位置。
    supabase.from("activities").select("*").eq("active", true).order("month").order("seq"),
    supabase.from("passports").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("stamps").select("act_id, stamped_on").eq("user_id", user.id),
    supabase.from("entries").select("act_id, note, photo").eq("user_id", user.id)
  ]);

  // 任何一個查詢失敗就整批視為失敗。部分成功比全部失敗更危險：少了 stamps 的畫面
  // 看起來就是「一個章都沒蓋」，學生會以為自己的紀錄不見了，然後重蓋一次。
  const firstErr = [mo, ac, pa, st, en].find(r => r.error);
  if (firstErr) throw firstErr.error;

  // 兩張表都攤平成以 act_id 為鍵的物件 —— ui.js 是照這個形狀寫的（S.stamps[a.id]）。
  const stamps = {};
  (st.data || []).forEach(r => { stamps[r.act_id] = { date: r.stamped_on }; });
  const entries = {};
  (en.data || []).forEach(r => { entries[r.act_id] = { note: r.note, photo: r.photo }; });

  return {
    // maybeSingle() 沒找到時 data 是 null 而不是報錯。正常情況一定找得到 ——
    // 註冊 trigger 會先建好這一列（schema.sql 的 handle_new_user）。拿到 null 只有兩種可能：
    // 這個帳號是 trigger 存在之前建的，或是有人手動刪了那一列。兩者都會讓畫面停在
    // 「填護照資料」頁，而使用者存不進去（passports 沒有 insert policy，補不回來）。
    profile: pa.data || null,
    stamps, entries,
    activities: ac.data || [],
    months: mo.data || []
  };
}

// update 不是 insert（spec §5.1）：那一列在註冊時就由 trigger 建好了。
// 沒有邀請碼就沒有 passports 列，前端補不出來 —— 這是刻意的，見 schema.sql 的
// passports_write 註解。所以這裡永遠是改既有的列。
export async function saveProfile(p) {
  const user = await requireUser();
  // 不寫 issued：核發日是 trigger 建列時的 current_date，也就是註冊那天。
  // 從這裡寫的話，每次改暱稱都會把核發日改成今天。
  const { error } = await supabase.from("passports").update({
    name_zh: p.name_zh, name_en: p.name_en, team: p.team, motto: p.motto,
    updated_at: new Date().toISOString()
  }).eq("id", user.id);
  if (error) throw error;
}

export async function saveAvatar(dataUrl) {
  const user = await requireUser();
  const { error } = await supabase.from("passports")
    .update({ avatar: dataUrl, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) throw error;
}

// 章與心得分兩張表，不是為了正規化，是因為兩者的可見範圍不同（spec §5.1）：
// 章要公開給進度牆看，心得和照片只有本人能讀。混在同一張表的話，進度牆為了讀章
// 就必須讀得到那一列，RLS 沒有「同一列的這幾欄看得到、那幾欄看不到」這種東西。
export async function saveStamp(actId, { date, note, photo }) {
  const user = await requireUser();

  // upsert 而不是 insert：重蓋同一格是允許的（改日期、補心得），
  // 主鍵是 (user_id, act_id)，所以衝突時更新同一列。
  const s = await supabase.from("stamps")
    .upsert({ user_id: user.id, act_id: actId, stamped_on: date }, { onConflict: "user_id,act_id" });
  if (s.error) throw s.error;

  // 章先寫、心得後寫。順序是有意義的：中間斷線的話，結果是「章在、心得空」——
  // 學生看得到自己蓋過，補打一次心得就好。反過來寫的話會變成心得存在資料庫裡
  // 但畫面上那格沒蓋章，學生只會再蓋一次、然後心得被這次的覆蓋掉。
  const e = await supabase.from("entries")
    .upsert({ user_id: user.id, act_id: actId, note: note || "", photo: photo || null },
            { onConflict: "user_id,act_id" });
  if (e.error) throw e.error;
}

export async function removeStamp(actId) {
  const user = await requireUser();
  // 刪的順序跟寫的順序相反：先刪心得再刪章。中間斷線的話結果是「章在、心得沒了」,
  // 跟上面同一個道理 —— 留下看得見的痕跡，比留下看不見的殘留好。
  const e = await supabase.from("entries").delete().eq("user_id", user.id).eq("act_id", actId);
  if (e.error) throw e.error;
  const s = await supabase.from("stamps").delete().eq("user_id", user.id).eq("act_id", actId);
  if (s.error) throw s.error;
}

// 清除這個人自己的整本護照（spec §11-10 的「匯出 → 清除 → 匯入還原」）。
// 這個函式當初被加進介面清單，就是為了預防它現在最容易出的錯：計畫的 Task 6
// 只列了六個函式、沒有這一個，照著做的話「清除護照」會留在 localStorage 版本 ——
// 畫面清空、資料庫原封不動、重整後全部回來，而且不會有任何錯誤訊息。
// 那條驗收會通過，但通過的是假的。
//
// **不刪 passports 那一列，只把欄位設回 null。** 這不是風格選擇：schema.sql 刻意
// 沒有給 passports 任何 insert policy，那一列只在註冊時由 trigger 建立一次。
// 刪掉之後前端補不回來，帳號會變成一本永遠填不了的空護照，而且無法自行修復。
// 章與心得則是真的刪除 —— 它們有 insert policy，重蓋就會回來。
export async function clearAll() {
  const user = await requireUser();
  const e = await supabase.from("entries").delete().eq("user_id", user.id);
  if (e.error) throw e.error;
  const s = await supabase.from("stamps").delete().eq("user_id", user.id);
  if (s.error) throw s.error;
  const p = await supabase.from("passports").update({
    name_zh: null, name_en: null, team: null, motto: null, avatar: null,
    updated_at: new Date().toISOString()
  }).eq("id", user.id);
  if (p.error) throw p.error;
}

// Task 7 才改查資料庫。localStorage 版已經在 Task 6 拿掉了，所以現在回空陣列 ——
// 進度牆在 Task 7 之前是空的。這是計畫預期的中間狀態，不是壞掉。
// 留一個會讀到不存在資料的舊實作，比誠實回空更糟：那會看起來像「牆上真的沒人」。
export async function loadWall() {
  return [];
}

// 護照號碼由 id 決定，固定不變。Task 6 之後 id 是 auth uuid，
// 所以護照號碼從此穩定，不會因為重新登入而變（spec §7.2）。
export function passportNo(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return "BT" + String(h % 10000000).padStart(7, "0");
}
