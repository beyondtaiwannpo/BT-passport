// 登入、目前使用者。整個平台共用這一份。
//
// 2026-08-31（階段 2）：原樣從 passport/src/data.js 搬過來，一行邏輯都沒改。
// 唯一的差別是 configMessage() 從看 `client` 改成看 `supabase` —— 那兩個是同一個東西
// （supabase.js 裡 `export const supabase = client`），改的是名字不是行為。
//
// 角色判斷（role）還不在這裡，那是階段 3+4 的事。等 profiles.role 存在之後，
// 「我是不是幹部」這個問題也只該有這一個答案來源，加在這個檔案裡。
//
// data.js 仍然把下面這些名字再匯出一次，所以 main.js 的 `import * as DATA` 照舊。
// **新功能不要繞道 data.js**，直接 import 這個檔案。

import { supabase } from "./supabase.js";

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
  // 2026-09-01：後半句從「寄信到組織信箱」改成指向自助那顆鍵。
  // 自助入口做好之後，叫人寫信給我們等於把一件他三十秒能自己做完的事
  // 變成一封信加上一次人工重設。組織信箱那條路沒有消失，它在忘記密碼頁上。
  badLogin: "email 或密碼不對。忘記密碼的話，按下面的「寄一封重設連結給我」。",
  // 寄信被限流（2026-09-01 加，忘記密碼那條路上）。
  // **不可以用 other 那句「再試一次」頂著。** 限流的意思正是「現在再試一次一定失敗」，
  // 叫他馬上再按等於叫他去撞牆，而且他會以為是自己哪裡打錯了。
  // 這一句要講的是「等」跟「信可能已經在路上」。
  tooMany:  "剛剛已經寄過一封了，等一分鐘再按一次。信可能還在路上，先看一下垃圾郵件匣。",
  // 伺服器出狀況。**2026-09-01 之前這一句是「這個邀請碼不對」。**
  // 那時候唯一會回 500 的路是註冊 trigger 檢查邀請碼失敗，所以那樣講是對的。
  // 階段 5-7 把門搬去 claim_invite 之後，trigger 裡已經沒有邀請碼檢查了
  // （實測 pg_proc.prosrc：只剩 insert into profiles），
  // **於是那句話變成在任何情況下都是錯的** —— 而且它會出現在根本沒有邀請碼欄位的
  // 忘記密碼頁上，叫使用者去跟組長要一組新的碼。前提沒了，話要跟著改（README 第 11 項）。
  serverError: "伺服器出了狀況，等一下再試一次。還是不行的話寄信到 beyondtaiwan2020@gmail.com。",
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
// ── 順序有意義：find() 取第一個命中的，所以 exact match 一律排最前面 ──
//
// 2026-09-01 出過事：invalid_invite 那條被放在 offline 後面，於是打錯邀請碼的人
// 看到的是「現在連不上資料庫」。一個學生打錯一個字母，畫面告訴他系統壞了 ——
// 他不會再試、也不會回報，他會以為網站壞掉然後安靜地放棄，而沒有人會知道。
// 順帶還把一個「打錯字」的問題升級成一封要組長回的信。
const RULES = [
  // claim_invite 那支 RPC 驗不過時丟的。**實測（2026-09-01，正式專案，真實使用者 token）：**
  //   HTTP 400，body {"code":"P0001","details":null,"hint":null,"message":"invalid_invite"}
  //   supabase-js 交過來的物件只有 {code, details, hint, message} 四個 key ——
  //   **沒有 status、沒有 name，也不是 Error 的實例。**
  // 那個形狀正是下面 offline 那條會誤判它的原因，所以這條要排在它前面。
  { key: "invite", when: (e, m) => m === "invalid_invite" },

  // 連不上：判斷的是 status 0 **而且沒有錯誤碼**，不是 name。
  // **不要改成用 name 判斷。** 本機拿 vendored supabase-js 實測過兩件事：
  //   真的連不上 → name "AuthRetryableFetchError"、status 0、message "fetch failed"
  //                （瀏覽器是 "Failed to fetch"）
  //   伺服器回 500 → name 也是 "AuthRetryableFetchError"，但 status 是 500
  // 兩者共用同一個 name，所以只認 name 會把「邀請碼錯」誤報成「連不上」——
  // 這正是 trigger raise 之後最可能走到的那條路。分辨兩者的是 status。
  //
  // ⚠ **`s === 0` 不能單獨成立，一定要加上 `&& !c`。**（2026-09-01 修）
  // PostgREST 的錯誤物件**根本沒有 status 這個欄位**，所以 Number(err.status || 0)
  // 一律是 0 —— 那不代表「這次請求沒拿到回應」，只代表「這個物件不長那樣」。
  // 少了 `&& !c` 的話，**任何**經由 .rpc() 回來的錯誤都會被說成「連不上資料庫」，
  // 而資料庫其實好端端地回答了。這不只影響邀請碼，是所有 RPC 共通的。
  //
  // 為什麼 `!c` 分得開 —— 三條路都實測過（2026-09-01）：
  //   auth 網路失敗       status 0        code undefined  → !c 為真，仍判離線 ✓
  //   postgrest 網路失敗  status undefined code ""        → !c 為真，仍判離線 ✓
  //   postgrest P0001     status undefined code "P0001"   → !c 為偽，不再誤判 ✓
  { key: "offline", when: (e, m, s, c) => (s === 0 && !c) || e.name === "TypeError"
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

  // 寄信限流。GoTrue 對「同一個 email 短時間內重複要重設信」回
  //   status 429 / code "over_email_send_rate_limit"
  //   message "For security purposes, you can only request this after 51 seconds."
  // （形狀照 GoTrue 文件寫的，**還沒實測** —— 走過一次忘記密碼流程、連按兩下
  //   就會撞到，那時候把 console 裡的原始錯誤記下來回頭校對這一條。）
  // 位置：一定要排在最後那條 serverError 前面。429 不是 5xx，所以其實吃不到，
  // 但下一個人把 serverError 放寬成 s >= 400 的話順序就會開始有意義。
  { key: "tooMany", when: (e, m, s, c) => s === 429 || c.includes("rate_limit")
      || m.includes("only request this after") },

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
  // ⚠ **2026-09-01：這條規則換了意思，不要照舊註解讀它。**
  // 它原本是 `{ key: "invite" }`，因為當時唯一會回 500 的路就是註冊 trigger
  // 檢查邀請碼失敗。階段 5-7 把門搬到 claim_invite 之後，那個前提消失了：
  // 現在 trigger 裡只剩 `insert into profiles`，不可能因為邀請碼而 raise。
  // 也就是說「邀請碼不對」那句從那一刻起就**沒有任何情況是對的**，而它照樣
  // 會蓋住每一個真正的伺服器故障，還會出現在沒有邀請碼欄位的忘記密碼頁上。
  // 上面那幾段講「兩種邀請碼問題實測逐字相同」的註解記錄的是 5-7 之前的世界，
  // 留著是因為那是真的量到的東西（README 第 11 項：歷史不改寫），
  // **但它們已經不再是這條規則的理由**。
  //
  // 邀請碼現在唯一的錯誤路徑是最上面那條 invalid_invite（400 / P0001）。
  // 這條剩下的工作是誠實地說「伺服器出狀況」——最寬，所以留在最後。
  { key: "serverError", when: (e, m, s) => s >= 500 || m.includes("database error") }
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
  // 兩條路都歸到 MSG.invite，但**除錯時該看的東西完全不同**，所以分開印。
  //
  // 2026-09-01：這段原本只為註冊那條路寫的，升級那條路加進來之後它就開始說謊 ——
  // 對著一個 claim_invite 的錯誤印「註冊失敗」、還教人去查 trigger。
  // 更要緊的是它描述的那個模糊性（「這一句同時涵蓋伺服器出狀況」）
  // **在 RPC 這條路上不存在**：invalid_invite 是明確的答案。
  // 前提沒了，話就要跟著改（README 第 11 項）。
  if (hit && hit.key === "invite" && m === "invalid_invite") {
    console.error(
      "升級失敗：claim_invite 回 invalid_invite —— 這組碼不存在，或 uses_left 已經是 0。\n" +
      "**這一句是明確的**，不像註冊那條路那樣同時涵蓋「伺服器出狀況」：\n" +
      "資料庫確實回答了，答案就是「這組碼不能用」。\n" +
      "要確認是哪一種，用跟函式同一套正規化去查：\n" +
      "  select code, uses_left from invite_codes\n" +
      "   where upper(btrim(code)) = upper(btrim('使用者實際輸入的碼'));\n" +
      "直接用 code = '...' 會查不到而誤判。\n" +
      "原始錯誤：",
      { name: err.name, status: err.status, code: err.code, message: err.message });
  } else if (hit && hit.key === "serverError") {
    console.error(
      "伺服器回了 5xx。**這裡不再是邀請碼的問題**（2026-09-01 起）：\n" +
      "註冊 trigger 已經不檢查邀請碼了，它只做 insert into profiles，\n" +
      "所以走到這裡代表資料庫或 GoTrue 真的出了狀況。\n" +
      "去看 Supabase 後台的 Logs（Auth 與 Postgres 兩邊都看），\n" +
      "不要再去查 invite_codes —— 那條線索在這條路上已經不存在。\n" +
      "原始錯誤：",
      { name: err.name, status: err.status, code: err.code, message: err.message });
  }
  return hit ? MSG[hit.key] : MSG.other;
}

// shared/supabase.js 的網址或金鑰填錯、client 根本建不出來時，畫面該顯示哪一句。
// 跟 MSG 放在一起是為了讓文案的真相來源只有一處；沒問題時回空字串，呼叫端不必判斷。
export function configMessage() { return supabase ? "" : MSG.offline; }

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

// Google 登入（規格 §3-4）。Supabase 內建的供應商，前端只有這一顆按鈕。
//
// **email + 密碼那條路保留當備援，不要拿掉**：有人沒有 Google 帳號、有人在中國、
// 有人的 Google 就是登不進去。兩條路並存是規格明寫的。
//
// redirectTo 預設回到「現在這一頁」。這一輪護照與登入頁還在同一個位置，
// 階段 7 有了 /app/ 之後，呼叫端可以傳別的值進來，這個函式不用改。
// **那個網址必須先加進 Supabase 後台的 Redirect URLs**，否則 OAuth 轉回來會被拒。
export async function signInWithGoogle(redirectTo) {
  if (!supabase) throw new Error(MSG.offline);
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: redirectTo || (location.origin + location.pathname) }
  });
  // 成功的話瀏覽器已經在跳轉了，下面這行不會執行到。
  if (error) throw new Error(authMessage(error));
}

// 寄出重設密碼信（規格 §3-6）。
//
// **只有 email + 密碼那條路需要這個。** Google 進來的人沒有密碼可以重設 ——
// 他們忘記的是 Google 帳號的密碼，那不歸我們管，畫面上也不該叫他們來這裡。
//
// redirectTo 是使用者點信裡的連結之後會被送到的位址，**必須在 Supabase 後台的
// Redirect URLs 允許清單裡**（我們設的是 https://beyondtaiwannpo.com/**，涵蓋 /reset/）。
//
// 這個函式**不會**告訴呼叫端「這個 email 存不存在」，Supabase 對存在與不存在的
// 信箱回一樣的成功。那是刻意的：不然任何人都能拿它當帳號列舉的工具，
// 一次一個 email 問「這個人是不是 BT 幹部」。呼叫端的文案要跟著這個事實寫 ——
// 講「如果這個信箱有帳號，我們寄了一封信」，不要講「已寄出」。
export async function sendPasswordReset(email, redirectTo) {
  if (!supabase) throw new Error(MSG.offline);
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw new Error(authMessage(error));
}

// 設定新密碼。呼叫這個之前必須已經有 session ——
// 使用者點了信裡的連結、supabase-js 從網址把 recovery token 換成 session 之後才行。
//
// 這個 client 是 implicit flow（實測 flowType === "implicit"），所以 token 走網址的
// hash，detectSessionInUrl 會自己接住並觸發 PASSWORD_RECOVERY 事件。
// **不要在這裡自己解析網址** —— 那是 supabase-js 的工作，自己解會有兩份邏輯。
export async function updatePassword(newPassword) {
  if (!supabase) throw new Error(MSG.offline);
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(authMessage(error));
}

// 角色升級（規格 §3-5）。**前端唯一能改動角色的路徑就是這一個函式**，
// 而它只是呼叫資料庫那支 security definer 的 RPC —— 驗碼、扣碼、升級、
// 建 passports 那一列，全部在資料庫裡一次做完。
//
// **不要在這裡對 code 做任何正規化。** 大小寫與前後空白由資料庫處理
// （claim_invite 兩邊都套 upper(btrim(...))）。2026-08-17 出過事：前端偷偷轉大寫，
// 而資料庫是嚴格比對，管理員建的小寫碼讓所有人都失敗，畫面卻只說「這個邀請碼不對」。
// 病根是「同一件事在兩個地方各做一半」。呼叫端的 .trim() 只是順手，正確性不靠它。
//
// 回傳 'upgraded' 或 'already_cadre'。後者不是錯誤，也不會扣掉一組碼 ——
// 使用者手滑連點兩下不該燒掉一組（claim_invite 裡那個 for update 就是為了這個）。
export async function claimInvite(code) {
  if (!supabase) throw new Error(MSG.offline);
  const { data, error } = await supabase.rpc("claim_invite", { p_code: code });
  if (error) throw new Error(authMessage(error));
  return data;
}

// 「查不出是誰」有兩種完全不同的原因，而畫面上該顯示的東西正好相反：
//   沒登入 / session 過期 → 登入頁
//   連不上伺服器           → 休眠頁（spec §8.1）
// getUser() 對這兩種都是回 error 而不是 throw，currentUser() 也都回 null，
// 所以 boot() 光看 null 是分不出來的 —— 分不出來的後果是：資料庫一休眠，
// 所有登入中的人都會看到登入頁，以為自己被登出、資料沒了。
//
// 判斷「是不是連不上」直接借用 RULES 裡 offline 那一條，不另外寫一份 ——
// 那條是實測校準過的（status 0 vs 500 的差別見它的註解），複製一份出來
// 就會有兩個真相來源，而且只有其中一個會被後續的實測更新到。
export function isOfflineError(err) {
  if (!err) return false;
  const r = RULES.find(x => x.key === "offline");
  return !!r.when(err, String(err.message || "").toLowerCase(),
                  Number(err.status || 0), String(err.code || "").toLowerCase());
}

// 回 { user, offline }。boot() 用它，其他地方用上面那個 currentUser() 就好。
export async function currentUserDetailed() {
  if (!supabase) return { user: null, offline: true };
  const { data, error } = await supabase.auth.getUser();
  return { user: (data && data.user) || null, offline: isOfflineError(error) };
}

export async function currentUser() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return (data && data.user) || null;
}
