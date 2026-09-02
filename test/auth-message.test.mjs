// authMessage 的錯誤形狀對照表。
// 跑法：node --test test/*.test.mjs
//
// ★ 這個檔案存在的理由：2026-09-01 出過事。
//   打錯邀請碼的人看到的是「現在連不上資料庫」—— 而資料庫是通的，
//   那個回應就是它給的。一個學生打錯一個字母，畫面告訴他系統壞了，
//   他不會再試、也不會回報，他會以為網站壞掉然後安靜地放棄。
//
//   病因：PostgREST 的錯誤物件**沒有 status 欄位**，所以 Number(err.status || 0)
//   一律是 0，而 offline 那條規則的第一個條件就是 s === 0，且它排在最前面。
//
// ★ 下面每一個 shape 都是**實測**來的，不是照猜或照文件寫的
//   （2026-09-01，正式專案 norjaglyaotzewxavmhv，真實使用者 token）。
//   改動 RULES 之前先看這裡：如果你要改的條件依賴某個欄位存不存在，
//   **先量一次**，不要相信「應該會有 status 吧」。那正是這個 bug 的來源。
import { test } from "node:test";
import assert from "node:assert/strict";
import { authMessage } from "../shared/auth.js";

// authMessage 對 invite 那一類會印 console.error 給維運的人看，測試時吞掉。
const quiet = fn => { const e = console.error; console.error = () => {}; try { return fn(); } finally { console.error = e; } };

// ── 實測形狀 1：claim_invite 驗不過 ──
// HTTP 400，body {"code":"P0001","details":null,"hint":null,"message":"invalid_invite"}
// supabase-js 交過來只有這四個 key，沒有 status、沒有 name，也不是 Error 實例。
const RPC_INVALID_INVITE = { code: "P0001", details: null, hint: null, message: "invalid_invite" };

// ── 實測形狀 2：auth 那條路的網路失敗 ──
const AUTH_OFFLINE = { __isAuthError: true, name: "AuthRetryableFetchError", status: 0,
                       code: undefined, message: "fetch failed" };

// ── 實測形狀 3：postgrest 那條路的網路失敗 ──
const PGRST_OFFLINE = { message: "TypeError: fetch failed", details: "…ENOTFOUND…", hint: "", code: "" };

// ── 實測形狀 4：註冊 trigger 丟的（GoTrue 包成 500）──
// 伺服器 5xx。**這個常數 2026-09-01 改名了**：本來叫 SIGNUP_INVITE，
// 因為當時唯一會回 500 的路就是註冊 trigger 檢查邀請碼失敗。
// 階段 5-7 把門搬去 claim_invite 之後 trigger 不再檢查邀請碼，這個形狀就
// 只剩下「伺服器真的出事」一種意思了。名字留著舊意思的話，下一個人會照名字
// 去理解它在測什麼，然後守錯東西。
const SERVER_5XX = { name: "AuthApiError", status: 500, code: null,
                     message: "Database error saving new user" };

// GoTrue 的寄信限流（照文件寫的形狀，還沒實測 —— 走一次忘記密碼連按兩下會撞到）。
const RATE_LIMITED = { name: "AuthApiError", status: 429, code: "over_email_send_rate_limit",
                       message: "For security purposes, you can only request this after 51 seconds." };

test("★ 打錯邀請碼要說「邀請碼不對」，不能說「連不上資料庫」", () => {
  const msg = quiet(() => authMessage(RPC_INVALID_INVITE));
  assert.match(msg, /邀請碼/, "沒有被歸到邀請碼那一句");
  assert.doesNotMatch(msg, /連不上/,
    "被誤判成離線了 —— 打錯一個字母的人會以為系統壞掉然後放棄");
});

test("真正的網路失敗仍然要說「連不上」（auth 那條路）", () => {
  assert.match(authMessage(AUTH_OFFLINE), /連不上/);
});

test("真正的網路失敗仍然要說「連不上」（postgrest 那條路）", () => {
  assert.match(authMessage(PGRST_OFFLINE), /連不上/);
});

// ★ 這一條 2026-09-01 整個翻面了，翻面本身就是重點。
// 舊版叫「註冊時邀請碼錯（500 那條路）維持原本的判法」，斷言 500 要說「邀請碼」。
// 那在 5-7 之前是對的。門搬到 claim_invite、trigger 不再檢查邀請碼之後，
// 500 就再也不代表邀請碼有問題了 —— 而那句話會蓋住每一個真正的伺服器故障，
// 還會出現在**根本沒有邀請碼欄位**的忘記密碼頁上，叫人去跟組長要一組新的碼。
// 舊測試不是寫錯，是它的前提被刪掉了；前提沒了就要改寫，不是刪掉（README 第 11 項）。
test("伺服器 5xx 不准再說是邀請碼的問題", () => {
  const msg = quiet(() => authMessage(SERVER_5XX));
  assert.doesNotMatch(msg, /邀請碼/,
    "5xx 又被說成邀請碼問題了 —— trigger 早就不檢查邀請碼，這句話沒有任何情況是對的");
  assert.match(msg, /伺服器/, "沒有誠實說是伺服器出狀況");
});

// 限流的意思正是「現在再試一定失敗」。給「再試一次」等於叫他去撞牆，
// 而且他會以為是自己打錯了什麼。
test("寄信被限流要叫人等，不要叫人再試一次", () => {
  const msg = quiet(() => authMessage(RATE_LIMITED));
  assert.match(msg, /等/, "沒有叫他等 —— 限流的當下再按一次一定又失敗");
  assert.doesNotMatch(msg, /^出了點狀況，再試一次/, "掉到通用的「再試一次」了");
});

// 忘記密碼的入口做出來之後，這句話不該再把人推去寫信。
test("密碼錯的那句指向自助重設，不是叫人寫信", () => {
  const msg = authMessage({ name: "AuthApiError", status: 400,
                            code: "invalid_credentials", message: "Invalid login credentials" });
  assert.match(msg, /重設連結/, "沒有指向自助那條路");
});

// 兩種完全不同的錯誤不可以給同一句話。
// **這一條不是在測順序** —— 2026-09-01 反向驗證時發現的：把 invalid_invite
// 移到 offline 後面，這一條照樣通過，因為 !c 已經讓真實的 PostgrestError
// 不會落進 offline 了。它測的是「兩類錯誤分得開」，那也值得守，
// 但名字不能寫成順序，不然下一個人會以為順序有東西在守。
test("兩種完全不同的錯誤不會給同一句話", () => {
  const invite  = quiet(() => authMessage(RPC_INVALID_INVITE));
  const offline = authMessage(AUTH_OFFLINE);
  assert.notEqual(invite, offline,
    "邀請碼錯與連不上給了同一句話 —— 寬鬆的那條規則吃掉了精確的那條");
});

// ★ 這一條才是真的在測順序，而且用的是一個**刻意合成的**形狀：
//   訊息是 invalid_invite，但同時帶著網路失敗的特徵（status 0、code 空字串）。
//   真實世界不會長這樣 —— 它的用途就是讓 offline 那條規則「有機會」吃掉它。
//
//   為什麼需要一個假形狀：!c 那個修法讓真實的 PostgrestError 不再落入 offline，
//   於是順序在真實形狀上測不出來。但順序仍然是一層防護 ——
//   哪天有人把 !c 拿掉（例如覺得它多餘），順序就是唯一擋著的東西。
//   兩層各自有測試，才不會「拿掉一層而沒有任何東西變紅」。
const SYNTHETIC_ORDERING = { message: "invalid_invite", code: "", status: 0 };

test("★ invalid_invite 排在 offline 前面（順序本身，用合成形狀測）", () => {
  const msg = quiet(() => authMessage(SYNTHETIC_ORDERING));
  assert.match(msg, /邀請碼/,
    "invalid_invite 那條沒有排在 offline 前面 —— 現在靠 !c 擋著，" +
    "但那一層被拿掉之後就沒有東西擋了");
});

// ★ 對照組：沒有這一條的話，上面那些「不是離線」的斷言在
//   「offline 規則整個壞掉、什麼都判不出來」的時候也會通過。
test("【對照】完全不認得的錯誤落到 other，不會被誤判成任何一類", () => {
  const msg = authMessage({ message: "something completely unexpected", code: "XX999" });
  assert.doesNotMatch(msg, /邀請碼|連不上|密碼/);
});
