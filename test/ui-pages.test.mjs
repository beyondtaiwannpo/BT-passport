// 書本頁序的契約。頁碼的定義點只有 ui.js 的 pagesOf()，
// 不准任何地方再自己算 page - 1 或 months.length。
// 跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { pagesOf, bookHTML, guideCardsHTML, guidePageHTML, introHTML, monthPageHTML,
         idPageHTML, notCadreHTML, authHTML, CATEGORY, CATNAME, SLOT_ORDER } from "../passport/src/ui.js";

const months = [
  { seq: 1, month: 9,  theme_zh: "07:00", theme_en: "" },
  { seq: 2, month: 10, theme_zh: "08:00", theme_en: "" }
];

const S = page => ({
  page, months, activities: [], stamps: {}, entries: {}, justStamped: null,
  profile: { id: "00000000-0000-0000-0000-000000000000", name_zh: "王小明",
             name_en: "Ming Wang", team: "Sponsorship Team", issued: "2026-08-22" }
});

const dotCount = html => (html.match(/data-act="go"/g) || []).length;

test("每頁右下角有頁碼，1 起算補零，總數來自 pagesOf", () => {
  assert.match(bookHTML(S(0)), /PAGE 01 \/ 4/);
  assert.match(bookHTML(S(1)), /PAGE 02 \/ 4/);
  assert.match(bookHTML(S(3)), /PAGE 04 \/ 4/);
});

test("頁碼的總數不是寫死的 —— 月份變少就跟著變", () => {
  // 這條擋的是「直接寫 13」。月份資料是從資料庫來的，停用一整個月的時候
  // 總數要跟著變，否則頁碼會說謊。
  const two = { ...S(0), months: months.slice(0, 1) };
  assert.match(bookHTML(two), /PAGE 01 \/ 3/);
});

test("pagesOf：資料頁 → 說明頁 → 月份，九月在索引 2", () => {
  const pages = pagesOf(S(0));
  assert.equal(pages[0].kind, "id");
  assert.equal(pages[1].kind, "guide");
  assert.equal(pages[2].kind, "month");
  assert.equal(pages[2].month.month, 9);
  assert.equal(pages.length, months.length + 2);
});

test("圓點數等於 pagesOf 的長度，而且就是 months + 2 顆", () => {
  // 兩個斷言缺一不可：
  // 第一個確認 bookHTML 的圓點迴圈跟 pagesOf 的陣列一一對應（抓 bookHTML 漏畫）。
  // 第二個釘住字面數字（抓 pagesOf 自己少一項）—— 只有第一個的話兩邊同源，
  // pagesOf 少掉資料頁或說明頁時它會一起變小而不會紅。
  assert.equal(dotCount(bookHTML(S(1))), pagesOf(S(1)).length);
  assert.equal(dotCount(bookHTML(S(1))), months.length + 2);
});

test("圓點的 data-p 是 0 起算的連號", () => {
  const html = bookHTML(S(1));
  const ps = [...html.matchAll(/data-p="(\d+)"/g)].map(m => Number(m[1]));
  assert.deepEqual(ps, ps.map((_, i) => i));
});

test("第一頁的『前一頁』與最後一頁的『下一頁』是 disabled", () => {
  const last = pagesOf(S(0)).length - 1;
  const first = bookHTML(S(0));
  assert.match(first, /data-act="prev" disabled/);
  const end = bookHTML(S(last));
  assert.match(end, /data-act="next" disabled/);
});

test("沒有活動的月份，圓點不算蓋滿", () => {
  // acts.every() 對空陣列回 true，直接用會讓一個沒有任何活動的月份顯示成「已蓋滿」。
  const html = bookHTML(S(1));
  assert.ok(!/data-on="1"/.test(html), "沒有活動就不該有橘色圓點");
});

test("入境章：蓋滿才出現，而且沒有活動的月份不算蓋滿", () => {
  // 空集合讓 .every() 無條件成立 —— 這個 repo 被同一個 bug class 咬過三次。
  // 這一處還跟圓點互相矛盾過：dotOn 在 2026-08-22 就加了守衛，
  // 所以同一個沒有活動的月份，圓點說未蓋滿、頁面卻蓋著完成的標記。
  //
  // 2026-08-26：完成的標記從 MONTH CLEARED 換成入境章（spec §三）。
  // 這條測試守的一直是「標記只在真的完成時出現」，不是那五個字，
  // 所以斷言跟著換成 .estamp，三個案例原封不動。
  const m = { seq: 1, month: 9, theme_zh: "", theme_en: "" };
  const DEST = [{ code: "TPE", city: "TAIPEI", active: true }];
  const mk = acts => ({ activities: acts, stamps: {}, entries: {}, justStamped: null,
    months: [m], destinations: DEST, visas: {},
    profile: { id: "00000000-0000-0000-0000-000000000000" } });
  const A = { id: "09A", month: 9, seq: 1, category: "gather", title_zh: "開學電影夜", title_en: "OPENING NIGHT", description: "d" };
  const has = s => monthPageHTML(s, m).includes("estamp");

  assert.equal(has(mk([])), false, "沒有活動的月份不算蓋滿");
  assert.equal(has(mk([A])), false, "有一格未蓋章不算蓋滿");
  const done = { ...mk([A]), stamps: { "09A": { date: "2026-09-01" } } };
  assert.equal(has(done), true, "全部蓋章才算蓋滿");
});

test("沒有活動的月份，圓點與頁面說的是同一件事", () => {
  // 兩處各自判斷「蓋滿」，曾經一個修了一個沒修，於是同一個月份
  // 圓點說未蓋滿、頁面說蓋滿了。
  //
  // 2026-08-26：原本斷言的是 !includes("MONTH CLEARED")。那個字串在這一輪
  // 被移除之後，那條斷言會**永遠為真** —— 通過的理由跟它保護的東西無關
  // （README 第 10、12 項）。改成斷言入境章。
  const m = { seq: 1, month: 9, theme_zh: "", theme_en: "" };
  const S2 = { page: 2, months: [m], activities: [], stamps: {}, entries: {}, justStamped: null,
    destinations: [{ code: "TPE", city: "TAIPEI", active: true }], visas: {},
    profile: { id: "00000000-0000-0000-0000-000000000000" } };
  const book = bookHTML(S2);
  assert.ok(!book.includes('data-on="1"'), "圓點不該是蓋滿");
  assert.ok(!book.includes("estamp"), "頁面也不該蓋入境章");
});

test("說明頁的三張卡也是 聚會 → 題目 → 鏡頭", () => {
  const html = guideCardsHTML();
  const [g, p, f] = ["聚會 GATHER", "題目 PROMPT", "鏡頭 FRAME"].map(n => html.indexOf(n));
  assert.ok(g >= 0 && p >= 0 && f >= 0);
  assert.ok(g < p && p < f);
});

test("說明頁卡片的 .ttl 放的是定義句，不是分類短名", () => {
  // 2026-08-23 使用者的決定（對照圖 B）：.ttl 放的是定義句，
  // 不准再寫一次分類短名（那會讓「聚會」在同一張卡上出現兩次）。
  // 下面刻意釘死字面而不是比對 CATEGORY.gather.define —— 後者對任何字串都成立
  // （含空字串），會變成永遠綠的同義反覆，正是 README 第 12 項第一條的形狀。
  // 改文案時這條會紅一次，那就是它在做的事：強迫一個人來看一眼。
  const html = guideCardsHTML();
  assert.ok(html.includes("What the whole team does"), "gather 那張卡要顯示定義句");
  assert.ok(!html.includes('<span class="ttl">聚會</span>'), ".ttl 不准放分類短名");
});

test("說明頁的 .mhead 帶 solo，且不含 mnum", () => {
  // 2026-08-23 使用者的決定（對照圖 C）：那一頁不是月份，00 已經給了資料頁，
  // .mnum 留空、標題放大到 52px（由 .mhead.solo 這個修飾詞在 CSS 端接手）。
  const html = guidePageHTML();
  assert.ok(html.includes('<div class="mhead solo">'), "說明頁的 .mhead 要帶 solo");
  assert.ok(!html.includes("mnum"), "說明頁不准出現 mnum");
});

test("月份頁的 .mhead 不帶 solo", () => {
  // solo 只准掛在說明頁，否則月份頁的月份數字那一格會被牽連（見 index.html 的
  // .mhead.solo .mzh 只掛在 .mhead.solo 上，不是裸的 .mzh）。
  const month = { seq: 1, month: 9, theme_zh: "07:00", theme_en: "" };
  const state = { activities: [], months: [month], stamps: {}, entries: {}, justStamped: null };
  const html = monthPageHTML(state, month);
  assert.ok(html.includes('<div class="mhead">'), "月份頁的 .mhead 不帶 solo");
  assert.ok(!html.includes('<div class="mhead solo">'), "月份頁不准出現 mhead solo");
});

test(".hint 不再是待補文案的佔位字 —— 三段文案 2026-08-23 已經填進 CATEGORY", () => {
  const html = guideCardsHTML();
  assert.equal((html.match(/【待補文案】/g) || []).length, 0, "文案已經填入，不該再出現佔位字");
});

test("說明頁用的是 .slot 而不是可點的 button", () => {
  const html = guidePageHTML();
  assert.ok(html.includes('<div class="slot">'), "三張卡是 div，不可點");
  assert.ok(!html.includes('data-act="open"'), "說明頁不該有蓋章入口");
  assert.ok(html.includes('<div class="slots guide">'),
    "說明頁的 .slots 要帶 guide 修飾詞，桌機的 min-height 靠它拿掉");
});

test("翻到說明頁時 bookHTML 畫的是說明頁", () => {
  assert.ok(bookHTML(S(1)).includes(guideCardsHTML()));
});

test("引導頁與說明頁用的是同一份三張卡", () => {
  // 兩處各自寫一份文案的話，改了一邊忘了另一邊是遲早的事，
  // 而那時候護照會對同一件事講兩種說法。
  const cards = guideCardsHTML();
  assert.ok(introHTML().includes(cards), "引導頁要包含那三張卡");
  assert.ok(guidePageHTML().includes(cards), "說明頁要包含那三張卡");
});

test("引導頁有一顆送出鍵，而且只有一顆", () => {
  const html = introHTML();
  assert.equal((html.match(/data-act="intro-done"/g) || []).length, 1);
});

test('三張卡的文案都以 "Once a month" 開頭 —— 並排時第一句要對齊', () => {
  // 使用者的版面要求：三張並排時第一句要對得起來。
  // 開頭統一是那個對齊的基礎，改掉任何一張的開頭就破壞它。
  // 2026-08-28 文案改成英文，開頭從「一個月一」換成 "Once a month"。
  for (const c of SLOT_ORDER) {
    assert.ok(CATEGORY[c].body.startsWith("Once a month"),
      `${c} 的文案要以 "Once a month" 開頭，實際是「${CATEGORY[c].body.slice(0, 14)}…」`);
  }
});

test("每個分類都有非空的文案 —— 少一張不准靜靜地印佔位字", () => {
  for (const c of SLOT_ORDER) {
    assert.ok(CATEGORY[c].body && CATEGORY[c].body.length > 0, `${c} 沒有文案`);
  }
  assert.ok(!guideCardsHTML().includes("待補"), "說明頁不准出現佔位字");
});

test("題目那張必須講 \"Nobody else can open\"", () => {
  // **這條不是文案偏好，是告知義務。** 使用者的原話：
  // 「那是這裡面有未成年幹部的情況下，唯一必須在第一眼講清楚的事。」
  // 心得與照片只有本人看得到（schema.sql 的 entries_read RLS），
  // 而學生要在寫下第一個字之前就知道這件事。
  // 有人為了讓三張卡等長而刪掉這句話的話，這條會紅。
  //
  // 2026-08-28 文案改成英文，這條跟著換字面：舊的中文是「別人打不開」。
  // **換字面不是刪守門** —— 告知義務跟著文案走，文案改幾次它就換幾次。
  assert.ok(CATEGORY.prompt.body.includes("Nobody else can open"),
    '題目卡的文案必須包含 "Nobody else can open"');
  assert.ok(guideCardsHTML().includes("Nobody else can open"),
    '"Nobody else can open" 必須真的渲染到說明頁上');
});

test("CATNAME 的每個值都等於 CATEGORY 的 label —— 兩者不准漂移", () => {
  // Task 8a 的審查指出：把 CATNAME 改成手寫的字面物件，測試不會紅。
  // 那是真的，而且測不出來 —— 「衍生」是機制，從外面看不見。
  // 所以這裡測的是那個機制要保證的**性質**：兩邊永遠一致。
  // 今天（衍生）與「手寫且剛好一樣」都會綠，但任何一邊被改而另一邊沒跟上就紅。
  for (const [k, v] of Object.entries(CATEGORY)) {
    assert.equal(CATNAME[k], v.label);
  }
  assert.deepEqual(Object.keys(CATNAME).sort(), Object.keys(CATEGORY).sort());
});

test("清除護照的按鈕降級，另外三顆不變", () => {
  // 那顆會刪掉一整年的資料且不可復原，不該跟可逆的三顆等重。
  // 這是安全設計不是視覺偏好，所以釘住。
  const html = idPageHTML(S(0));
  assert.match(html, /class="btn sm quiet" data-act="reset"/);
  for (const act of ["edit", "export", "import"]) {
    const m = html.match(new RegExp(`class="([^"]*)" data-act="${act}"`));
    assert.ok(m, `找不到 data-act="${act}" 的按鈕`);
    assert.ok(!m[1].includes("quiet"), `data-act="${act}" 不該被降級`);
  }
});

// ---- 階段 5：非幹部那一頁與 Google 登入按鈕 ----
// 這幾條守的是「使用者卡在一個沒有出路的畫面」。
// 非幹部頁如果掉了邀請碼輸入框，登入進來的學員就沒有任何方式升級，
// 而畫面看起來是好的 —— 沒有錯誤、沒有空白，只是走不下去。
// 那種壞法不會有任何東西報錯，所以要有測試。
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
