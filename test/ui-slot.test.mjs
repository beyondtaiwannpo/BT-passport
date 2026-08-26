// 格子在「未蓋章／已蓋章」兩種狀態下該有什麼。
// 跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { slotHTML, faceOf } from "../src/ui.js";

const act = {
  id: "09A", month: 9, seq: 1, category: "gather",
  title_zh: "開學電影夜", title_en: "OPENING NIGHT",
  description: "新學年第一次全員上線，選片權給今年的新幹部"
};
const state = (stamps = {}, entries = {}) => ({ stamps, entries, justStamped: null, activities: [act] });

test("未蓋章的格子有說明與「蓋章 →」", () => {
  const html = slotHTML(state(), act);
  assert.ok(html.includes(act.description));
  assert.ok(html.includes("蓋章 →"));
});

test("蓋過章的格子仍然保留活動說明 —— 章不要浮在一片空白中間", () => {
  // 2026-08-23：蓋章之後說明消失，標題與章之間留下 116.8px 的洞（實測）。
  // 格子有 min-height:270px 而且同一列由最高的那格決定高度，空間一定得去某個地方，
  // 所以解法不是把洞變小，是讓內容從上往下連續、餘白落在底部。
  // 說明用 activities 表裡本來就有的那句，不另外編一份文案。
  const html = slotHTML(state({ "09A": { date: "2026-09-05" } }), act);
  assert.ok(html.includes(act.description), "蓋章後仍要印活動說明");
  assert.ok(!html.includes("蓋章 →"), "蓋過章就不該再出現「蓋章 →」");
  assert.ok(html.includes("stampwrap"), "要有章");
});

test("蓋章後心得與照片仍然照舊顯示", () => {
  const html = slotHTML(
    state({ "09A": { date: "2026-09-05" } }, { "09A": { note: "那天我遲到了十分鐘", photo: "data:image/jpeg;base64,AAAA" } }),
    act
  );
  assert.ok(html.includes("那天我遲到了十分鐘"));
  assert.ok(html.includes("class=\"thumb\""));
});

test("faceOf：未蓋章一律正面", () => {
  assert.equal(faceOf(state(), act), "front");
  // 就算 flipped 說背面也一樣 —— 未蓋章根本沒有背面可以翻到
  assert.equal(faceOf({ ...state(), flipped: { "09A": "back" } }, act), "front");
});

test("faceOf：已蓋章預設正面", () => {
  assert.equal(faceOf(state({ "09A": { date: "2026-09-05" } }), act), "front");
});

test("faceOf：已蓋章時 flipped 可以覆寫成背面", () => {
  const S = { ...state({ "09A": { date: "2026-09-05" } }), flipped: { "09A": "back" } };
  assert.equal(faceOf(S, act), "back");
});

test("faceOf：S.flipped 不存在時不炸", () => {
  // 舊形狀的 state，或還沒有人翻過任何一格
  const S = state({ "09A": { date: "2026-09-05" } });
  delete S.flipped;
  assert.equal(faceOf(S, act), "front");
});

test("未蓋章：只有正面，沒有背面也沒有翻面按鈕", () => {
  const html = slotHTML(state(), act);
  assert.ok(html.includes('class="face front"'));
  assert.ok(!html.includes('class="face back"'), "未蓋章不該產生背面的 DOM");
  assert.ok(!html.includes('data-act="flip"'), "沒有東西可以翻到就不該有翻面按鈕");
  assert.match(html, /data-face="front"/);
});

test("已蓋章：兩面都在，預設正面朝上，兩面各有翻面按鈕", () => {
  const html = slotHTML(state({ "09A": { date: "2026-09-05" } }), act);
  assert.ok(html.includes('class="face front"'));
  assert.ok(html.includes('class="face back"'));
  assert.match(html, /data-face="front"/);
  assert.equal((html.match(/data-act="flip"/g) || []).length, 2, "兩面各一顆");
});

test("朝外的那一面標 aria-hidden，讀螢幕的人不該聽到兩份內容", () => {
  const html = slotHTML(state({ "09A": { date: "2026-09-05" } }), act);
  assert.match(html, /class="face front" data-act="open" data-id="09A" aria-hidden="false"/);
  assert.match(html, /class="face back" aria-hidden="true"/);
});

test("翻面按鈕的 aria-label 說得出它要去哪一面", () => {
  const html = slotHTML(state({ "09A": { date: "2026-09-05" } }), act);
  assert.ok(html.includes('aria-label="翻到正面"'));
  assert.ok(html.includes('aria-label="翻到背面"'));
});

test("翻面按鈕不是 faceopen 的子孫 —— 按鈕不能巢狀", () => {
  // 巢狀按鈕是無效的 HTML，而且會讓 closest("[data-act]") 的委派失效。
  const html = slotHTML(state({ "09A": { date: "2026-09-05" } }), act);
  const open = html.indexOf('data-act="open"');
  const closeOpen = html.indexOf("</button>", open);
  const firstFlip = html.indexOf('data-act="flip"');
  assert.ok(firstFlip > closeOpen, "翻面按鈕要在 faceopen 關閉之後");
});

test("一格仍然只有一個 .slot —— 既有的 slotCount 不能被拆成兩個", () => {
  const html = slotHTML(state({ "09A": { date: "2026-09-05" } }), act);
  assert.equal(html.split('class="slot"').length - 1, 1);
});

test("剛翻過的那一格帶動畫 class，而且旗標被消耗掉", () => {
  // flipped 明確指到背面：預設已經是正面了（見 faceOf），這裡要測的是
  // 手動翻到背面那個方向的動畫 class，不能靠預設值。
  const S = { ...state({ "09A": { date: "2026-09-05" } }), flipped: { "09A": "back" }, justFlipped: "09A" };
  const html = slotHTML(S, act);
  assert.match(html, /class="flip turning-back"/);
  assert.equal(S.justFlipped, null, "旗標要被消耗，否則每次重繪都會再播一次");
});

test("沒有剛翻過的格子不帶動畫 class", () => {
  const html = slotHTML(state({ "09A": { date: "2026-09-05" } }), act);
  assert.ok(!html.includes("turning-"));
});

test("翻回正面時用的是另一個方向的動畫", () => {
  const S = { ...state({ "09A": { date: "2026-09-05" } }), flipped: { "09A": "front" }, justFlipped: "09A" };
  assert.match(slotHTML(S, act), /class="flip turning-front"/);
});

test("已蓋章的正面有章、沒有說明", () => {
  const html = slotHTML(state({ "09A": { date: "2026-09-05" } }), act);
  const front = html.slice(html.indexOf('class="face front"'), html.indexOf('class="face back"'));
  assert.ok(front.includes("stampwrap"), "章要在正面");
  assert.ok(!front.includes(act.description), "說明不該在正面");
  assert.ok(!front.includes('class="en"'), "英文標題不該在正面（章上已經有了）");
});

test("已蓋章的背面有說明、沒有章", () => {
  const html = slotHTML(state({ "09A": { date: "2026-09-05" } }), act);
  const back = html.slice(html.indexOf('class="face back"'));
  assert.ok(back.includes(act.description), "說明要在背面");
  assert.ok(!back.includes("stampwrap"), "章不該在背面");
});

test("未蓋章的正面維持原樣：說明與蓋章入口都在", () => {
  const html = slotHTML(state(), act);
  assert.ok(html.includes(act.description));
  assert.ok(html.includes("蓋章 →"));
  assert.ok(html.includes('class="en"'));
  assert.ok(!html.includes("stampwrap"));
});
