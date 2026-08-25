// 書本頁序的契約。頁碼的定義點只有 ui.js 的 pagesOf()，
// 不准任何地方再自己算 page - 1 或 months.length。
// 跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { pagesOf, bookHTML, guideCardsHTML, guidePageHTML, introHTML, monthPageHTML,
         idPageHTML, CATEGORY, CATNAME, SLOT_ORDER } from "../src/ui.js";

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

test("MONTH CLEARED：蓋滿才出現，而且沒有活動的月份不算蓋滿", () => {
  // 空集合讓 .every() 無條件成立 —— 這個 repo 被同一個 bug class 咬過三次。
  // 這一處還跟圓點互相矛盾過：dotOn 在 2026-08-22 就加了守衛，
  // 所以同一個沒有活動的月份，圓點說未蓋滿、頁面卻蓋著 MONTH CLEARED。
  const m = { seq: 1, month: 9, theme_zh: "07:00", theme_en: "" };
  const mk = acts => ({ activities: acts, stamps: {}, entries: {}, justStamped: null, months: [m], milestones: [] });
  const A = { id: "09A", month: 9, seq: 1, category: "gather", title_zh: "開學電影夜", title_en: "OPENING NIGHT", description: "d" };
  const has = s => monthPageHTML(s, m).includes("MONTH CLEARED");

  assert.equal(has(mk([])), false, "沒有活動的月份不算蓋滿");
  assert.equal(has(mk([A])), false, "有一格未蓋章不算蓋滿");
  const done = { ...mk([A]), stamps: { "09A": { date: "2026-09-01" } } };
  assert.equal(has(done), true, "全部蓋章才算蓋滿");
});

test("沒有活動的月份，圓點與頁面說的是同一件事", () => {
  // 兩處各自判斷「蓋滿」，曾經一個修了一個沒修，於是同一個月份
  // 圓點說未蓋滿、頁面說 MONTH CLEARED。
  const m = { seq: 1, month: 9, theme_zh: "07:00", theme_en: "" };
  const S2 = { page: 2, months: [m], activities: [], stamps: {}, entries: {}, justStamped: null, milestones: [] };
  const book = bookHTML(S2);
  assert.ok(!book.includes('data-on="1"'), "圓點不該是蓋滿");
  assert.ok(!book.includes("MONTH CLEARED"), "頁面也不該蓋 MONTH CLEARED");
});

test("說明頁的三張卡也是 聚會 → 題目 → 鏡頭", () => {
  const html = guideCardsHTML();
  const [g, p, f] = ["聚會 GATHER", "題目 PROMPT", "鏡頭 FRAME"].map(n => html.indexOf(n));
  assert.ok(g >= 0 && p >= 0 && f >= 0);
  assert.ok(g < p && p < f);
});

test("說明頁卡片的 .ttl 放的是定義句，不是分類短名", () => {
  // 2026-08-23 使用者的決定（對照圖 B）：三句定義已經在 activities.json 定義過，
  // .ttl 不准再寫一次分類短名（那會讓「聚會」在同一張卡上出現兩次）。
  const html = guideCardsHTML();
  assert.ok(html.includes("全 BT 一起做的事"), "gather 那張卡要顯示定義句");
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

test("三張卡的文案都以「一個月一」開頭 —— 並排時第一句要對齊", () => {
  // 使用者的版面要求：三張並排時第一句要對得起來。
  // 開頭統一是那個對齊的基礎，改掉任何一張的開頭就破壞它。
  for (const c of SLOT_ORDER) {
    assert.ok(CATEGORY[c].body.startsWith("一個月一"),
      `${c} 的文案要以「一個月一」開頭，實際是「${CATEGORY[c].body.slice(0, 6)}…」`);
  }
});

test("每個分類都有非空的文案 —— 少一張不准靜靜地印佔位字", () => {
  for (const c of SLOT_ORDER) {
    assert.ok(CATEGORY[c].body && CATEGORY[c].body.length > 0, `${c} 沒有文案`);
  }
  assert.ok(!guideCardsHTML().includes("待補"), "說明頁不准出現佔位字");
});

test("題目那張必須講「別人打不開」", () => {
  // **這條不是文案偏好，是告知義務。** 使用者的原話：
  // 「那是這裡面有未成年幹部的情況下，唯一必須在第一眼講清楚的事。」
  // 心得與照片只有本人看得到（schema.sql 的 entries_read RLS），
  // 而學生要在寫下第一個字之前就知道這件事。
  // 有人為了讓三張卡等長而刪掉這五個字的話，這條會紅。
  assert.ok(CATEGORY.prompt.body.includes("別人打不開"),
    "題目卡的文案必須包含「別人打不開」");
  assert.ok(guideCardsHTML().includes("別人打不開"),
    "「別人打不開」必須真的渲染到說明頁上");
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
