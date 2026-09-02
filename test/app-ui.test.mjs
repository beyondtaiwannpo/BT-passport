// /app/ 的畫面契約：登入、註冊、忘記密碼、寄出、以及「你還不是幹部」那一頁，
// 加上「登入後要送人去哪裡」那張白名單。
//
// 2026-09-02：前面那幾條從 test/ui-pages.test.mjs 搬過來，跟著 authHTML 與
// notCadreHTML 一起從 passport/src/ui.js 搬到 app/src/ui.js。
// 跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { authHTML, notCadreHTML, menuHTML, downHTML } from "../app/src/ui.js";
import { resolveNext, NEXT } from "../app/src/nav.js";

test("notCadreHTML 有邀請碼輸入框與升級按鈕，而且走得掉", () => {
  const h = notCadreHTML("");
  assert.ok(h.includes('id="ci"'), "邀請碼輸入框不見了，學員沒有辦法升級");
  assert.ok(h.includes('data-act="do-claim"'), "升級按鈕不見了");
  assert.ok(h.includes('data-act="signout"'), "沒有登出鍵，這一頁沒有 barHTML，使用者會卡住");
});

// 那格的 autocorrect / autocapitalize / spellcheck 一定要關掉。
// 大小寫已經不是理由（資料庫兩邊都 upper(btrim(...))），留著是為了擋
// autocorrect 把使用者打的字換成別的字 —— 那是使用者看不見的竄改，
// 資料庫救不了，他只會看到「這個邀請碼不對」然後把同一組碼再打十次。
test("notCadreHTML 的邀請碼那格關掉了自動更正", () => {
  const h = notCadreHTML("");
  const field = h.slice(h.indexOf('id="ci"'));
  for (const attr of ['autocorrect="off"', 'autocapitalize="off"', 'spellcheck="false"'])
    assert.ok(field.includes(attr), `邀請碼那格少了 ${attr}`);
});

// 前端唯一能碰角色的路徑是 claim_invite 那支 RPC（規格 §3-5 第 4 點）。
// 這一頁不准出現任何直接設定角色的東西。
test("notCadreHTML 沒有任何直接設定角色的路徑", () => {
  const h = notCadreHTML("");
  assert.ok(!/role/i.test(h), "這一頁出現了 role，前端不准有設定角色的路徑");
});

// email + 密碼那條路是備援，不准因為加了 Google 就消失（規格 §3-4）。
test("登入頁同時有 Google 與 email 密碼兩條路", () => {
  for (const mode of ["in", "up"]) {
    const h = authHTML(mode, "");
    assert.ok(h.includes('data-act="do-google"'), `${mode} 模式少了 Google 登入`);
    assert.ok(h.includes('id="ae"') && h.includes('id="ap"'),
              `${mode} 模式少了 email 或密碼欄位 —— 備援那條路不准拿掉`);
  }
});

// ── 忘記密碼（2026-09-01）─────────────────────────────────────────────
// 自助那條路需要「還記得自己用哪個 email」。換過信箱、當初用學校信箱註冊、
// 或根本想不起來的人，沒有第二條路就出不去，所以組織信箱那條要一起活著。
test("登入頁的忘記密碼有自助與組織信箱兩條路", () => {
  const h = authHTML("in", "");
  assert.ok(h.includes('data-m="forgot"'), "登入頁沒有自助重設的入口");
  assert.ok(h.includes("beyondtaiwan2020@gmail.com"),
            "組織信箱那條路不見了 —— 連 email 都想不起來的人就沒有出口了");
});

// 忘記密碼頁自己也要留組織信箱那條路：走到這一頁還是有可能寄不出去
// （打錯 email、根本沒有用那個信箱註冊），那時候他已經離開登入頁了。
// 反向驗證發現過：只守登入頁的話，把這一頁的組織信箱刪掉是全綠的。
// authHTML 畫的頁面沒有 barHTML，也沒有任何導覽 —— 這幾頁的「出口」只有頁面上
// 自己那顆按鈕。反向驗證發現過：把寄出頁的「回登入」拔掉是全綠的，
// 而那正是使用者最常停下來的一頁（信寄了、他回來要登入）。
test("忘記密碼與寄出頁都走得掉", () => {
  for (const mode of ["forgot", "sent"]) {
    const h = authHTML(mode, "", "a@b.co");
    assert.ok(h.includes('data-act="switch-auth" data-m="in"'),
              `${mode} 這一頁回不去登入頁 —— 這幾頁沒有導覽列，使用者會卡在這裡`);
  }
});

test("忘記密碼頁自己也留著組織信箱那條路", () => {
  assert.ok(authHTML("forgot", "").includes("beyondtaiwan2020@gmail.com"),
            "忘記密碼頁沒有人工那條路，自助失敗的人就卡住了");
  assert.ok(authHTML("sent", "", "a@b.co").includes("beyondtaiwan2020@gmail.com"),
            "寄出頁沒有人工那條路 —— 收不到信的人正好停在這一頁");
});

test("忘記密碼頁有 email 欄位、送出鍵，而且回得去登入頁", () => {
  const h = authHTML("forgot", "");
  assert.ok(h.includes('id="fpe"'), "沒有 email 欄位");
  assert.ok(h.includes('data-act="do-forgot"'), "沒有送出鍵");
  assert.ok(h.includes('data-m="in"'), "回不去登入頁，使用者會卡在這一頁");
});

// 用 Google 登入的人根本沒有密碼，走到這一頁是走錯路。不講的話他會寄信給自己、
// 收不到（Google 帳號的 email 在 auth.users 裡是有的，其實收得到，
// 但他重設完仍然會習慣性去按 Google），然後以為系統壞了。
test("忘記密碼頁講清楚 Google 登入的人不需要密碼", () => {
  const h = authHTML("forgot", "");
  assert.ok(h.includes("Google"), "沒有提到 Google —— 用 Google 登入的人會在這一頁繞圈");
});

// ⚠ 這一條在守的是「帳號存不存在」不准外流。
// Supabase 對存在與不存在的信箱回一模一樣的成功；文案要是寫成「已寄出」，
// 這一頁就變成一次一個 email 的查詢工具，而幹部名單本身就不該外流。
test("寄出後的文案是條件句，沒有斷定那個信箱有帳號", () => {
  const h = authHTML("sent", "", "a@b.co");
  assert.match(h, /如果[\s\S]{0,80}有帳號/,
               "寄出頁少了「如果…有帳號」這個條件句，它會變成帳號存在與否的查詢工具");
  for (const bad of ["已寄出", "已經寄", "寄給了", "寄到了"])
    assert.ok(!h.includes(bad), `寄出頁出現了斷定句「${bad}」，那等於承認這個信箱有帳號`);
});

// 回顯的是使用者剛才打進去的字，所以它是一條輸入路徑。
// 注意這裡不能斷言「輸出裡沒有 onerror 這幾個字」—— 跳脫成功之後那幾個字仍然在，
// 只是以文字的身分在。要看的是那個 < 有沒有變成 &lt;，也就是它還是不是一個標籤。
test("寄出頁回顯的 email 有跳脫", () => {
  const h = authHTML("sent", "", '<img src=x onerror=alert(1)>');
  assert.ok(!h.includes("<img src=x"), "使用者打的字被原樣當成標籤塞進 HTML 了");
  assert.ok(h.includes("&lt;img src=x"), "那段字根本沒被回顯，這條測試等於沒測到東西");
});

// ── 登入後要送人去哪裡（白名單）──────────────────────────────────────
// 這一段是唯一一個「使用者可以塞值進來、而那個值會影響瀏覽器去哪裡」的地方。

test("白名單以外的 next 一律回 null，不會變成網址", () => {
  for (const bad of ["//evil.com", "https://evil.com", "http://evil.com",
                     "/\\evil.com", "%2f%2fevil.com", "../../etc/passwd",
                     "javascript:alert(1)", "", "PASSPORT", " passport"])
    assert.equal(resolveNext("?next=" + encodeURIComponent(bad)), null,
      `next=${bad} 沒有被擋下來`);
  assert.equal(resolveNext(""), null);
  assert.equal(resolveNext("?foo=1"), null);
});

// 用 Object.prototype.hasOwnProperty.call 而不是 `k in NEXT` 或 `NEXT[k]`：
// 物件字面值仍然繼承 Object.prototype，`"constructor" in {}` 是 true，
// 而 NEXT["constructor"] 會拿到一個函式。那不會變成可用的網址，
// 但會讓 `const n = ... && nextURL()` 那一行拿到一個非空的東西然後丟給
// location.replace()。這條測試守的是那個寫法，不是那個結果。
test("原型鏈上的名字不算命中", () => {
  for (const k of ["__proto__", "constructor", "toString", "hasOwnProperty"])
    assert.equal(resolveNext("?next=" + k), null, `next=${k} 命中了原型鏈`);
});

test("passport 這把鑰匙要真的通", () => {
  assert.equal(resolveNext("?next=passport"), "../passport/");
});

// 這條守的是「以後有人往這張表加東西」的那一天。
test("白名單裡的每個目的地都是站內的相對路徑", () => {
  const vals = Object.values(NEXT);
  assert.ok(vals.length > 0, "白名單是空的");
  for (const v of vals) {
    assert.ok(v.startsWith("../"), `${v} 不是相對路徑`);
    assert.ok(!v.includes("//"), `${v} 裡有 //，那可能是別的網站`);
    assert.ok(!/^[a-z]+:/i.test(v), `${v} 帶著協定`);
  }
});

// ── 登入後的選單 ────────────────────────────────────────────────────
test("選單有護照的入口，也走得掉", () => {
  const h = menuHTML("王平");
  assert.ok(h.includes('href="../passport/"'), "選單裡沒有護照的入口");
  assert.ok(h.includes('data-act="signout"'), "選單裡沒有登出");
  assert.ok(h.includes("王平"), "沒有顯示現在登入的是誰");
});

// 時間看板（階段 8）還不存在。灰掉的入口看起來像壞掉的功能，
// 而且會有人來問什麼時候好 —— 對外首頁的那條規矩在這裡一樣成立。
test("選單裡沒有還不存在的功能", () => {
  const h = menuHTML("王平");
  for (const bad of ["敬請期待", "即將推出", "Coming soon", "開發中", "待補", "TODO"])
    assert.ok(!h.includes(bad), `選單裡出現了佔位的「${bad}」`);
});

test("選單會跳脫使用者的名字", () => {
  const h = menuHTML('<img src=x onerror=alert(1)>');
  assert.ok(!h.includes("<img src=x"), "名字被原樣當成標籤塞進 HTML");
  assert.ok(h.includes("&lt;img src=x"), "名字根本沒有被顯示，這條測試等於沒測到");
});

// /app/ 的 downHTML 跟護照那一份是兩份，文案不同。
// 護照那句「你的資料都還在」對一個還沒登入的人沒有意義。
test("連不上的那一頁不說「你的資料都還在」", () => {
  const h = downHTML();
  assert.ok(h.includes("beyondtaiwan2020@gmail.com"), "沒有給求助的出口");
  assert.ok(!h.includes("你的資料都還在"), "這一頁的人還沒登入，那句話對他沒有意義");
});
