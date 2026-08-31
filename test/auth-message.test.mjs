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
const SIGNUP_INVITE = { name: "AuthApiError", status: 500, code: null,
                        message: "Database error saving new user" };

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

test("註冊時邀請碼錯（500 那條路）維持原本的判法", () => {
  assert.match(quiet(() => authMessage(SIGNUP_INVITE)), /邀請碼/);
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
