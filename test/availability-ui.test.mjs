// 看板的畫面契約。
import { test } from "node:test";
import assert from "node:assert/strict";
import { noticeHTML, membersHTML, downHTML, COL_ORDER, DAY_ZH, hhmm } from "../availability/src/ui.js";

// ★ 2026-09-02 的 bug：知情同意按下去完全沒反應，而且沒有任何錯誤訊息。
// 根因有兩個，這一條守第二個 —— **失敗一定要說話**。
// 沒有它的話，任何一種請求失敗都會畫出一模一樣的畫面，
// 而使用者按了沒反應只會再按一次、按五次、然後關掉。
test("★ 知情同意頁失敗時要把訊息畫出來", () => {
  const clean = noticeHTML();
  const withMsg = noticeHTML("現在連不上資料庫。");
  assert.ok(!clean.includes("現在連不上資料庫"), "沒有訊息時不該憑空出現");
  assert.ok(withMsg.includes("現在連不上資料庫。"), "有訊息時沒有畫出來 —— 使用者會以為按鈕壞了");
  assert.notEqual(clean, withMsg, "有訊息與沒訊息畫出來一模一樣，等於訊息沒有作用");
});

test("知情同意頁處理中會停用按鈕，不讓人連點", () => {
  const busy = noticeHTML("", true);
  assert.match(busy, /data-act="notice-ok"[^>]*disabled/, "處理中沒有停用按鈕");
  assert.ok(busy.includes("處理中"), "沒有告訴他正在處理");
});

test("知情同意頁把那句話講清楚，而且走得掉", () => {
  const h = noticeHTML();
  assert.ok(h.includes("其他 BT 幹部看得到"), "沒有講最重要的那一句");
  assert.ok(h.includes("data-act=\"notice-ok\""), "沒有確認鍵");
  assert.ok(h.includes("../app/"), "沒有「先不要」的出口");
});

test("欄位順序是週一到週日，但存的仍然是 0 = 星期日", () => {
  assert.deepEqual(COL_ORDER, [1, 2, 3, 4, 5, 6, 0]);
  assert.equal(DAY_ZH[0], "日");
  assert.equal(DAY_ZH[COL_ORDER[0]], "一", "第一欄應該是星期一");
});

test("hhmm 補零", () => {
  assert.equal(hhmm(0), "00:00");
  assert.equal(hhmm(90), "01:30");
  assert.equal(hhmm(1410), "23:30");
});

// 規格 §4-3 C：沒有這一區就不知道該催誰。從沒填過與沒設時區的人都要出現。
const S = {
  members: [
    { id: "a", name: "有填的人", team: "Curriculum Team", tz: "Asia/Taipei", updatedAt: new Date().toISOString() },
    { id: "b", name: "很久沒動的人", team: "", tz: "America/Detroit", updatedAt: new Date(Date.now() - 60 * 86400000).toISOString() },
    { id: "c", name: "從沒填過的人", team: "", tz: "Asia/Taipei", updatedAt: null },
    { id: "d", name: "沒設時區的人", team: "", tz: null, updatedAt: null },
  ],
  slots: new Map([["a", new Set(["1:1140"])]]),
};

test("成員清單列出所有人，含從沒填過與沒設時區的", () => {
  const h = membersHTML(S, Date.now());
  for (const m of S.members) assert.ok(h.includes(m.name), `${m.name} 不見了 —— 少了誰看不出來`);
  assert.ok(h.includes("還沒填過"), "沒有標出從沒填過的人");
  assert.ok(h.includes("還沒設定時區"), "沒有標出沒設時區的人");
});

test("超過 30 天的標成該更新，而剛更新的不標", () => {
  const h = membersHTML(S, Date.now());
  const rows = h.split("<tr").filter(r => r.includes("</tr>"));
  const stale = rows.filter(r => r.includes("stale"));
  assert.equal(stale.length, 3, "應該有三列是舊的（60 天、兩個沒填過）");
  assert.ok(rows.find(r => r.includes("有填的人") && !r.includes("stale")), "剛更新的不該被標");
  assert.ok(h.includes("該更新了"), "只有底色沒有文字的話，色盲與黑白列印讀不到");
});

test("沒設時區的人在清單裡，而且說明他為什麼不在看板上", () => {
  const h = membersHTML(S, Date.now());
  assert.ok(h.includes("不會出現在團隊看板上"),
    "沒有解釋他為什麼不在看板上 —— 那看起來會像他沒空");
});

test("連不上的那一頁給得出下一步", () => {
  const h = downHTML();
  assert.ok(h.includes("beyondtaiwan2020@gmail.com"));
  assert.ok(h.includes('data-act="retry"'));
});

// ── 詳情彈窗（2026-09-02 的 bug：關不掉）──────────────────────────────
// 根因用真瀏覽器量過：按「關起來」時 act=close-peek **有**進到處理器，
// 但判斷式是 `!e.target.closest("[data-stop]")`，而 data-stop 掛在 .modal 上、
// 關閉鍵就住在裡面 —— 那個條件把關閉鍵自己排除掉了。
// 事件有觸發、狀態沒改、所以畫面完全不動。
//
// 現在改成正面表列：按到的是 <button>，或點在遮罩本身。
// 下面幾條守的就是那個判斷式依賴的結構事實。
import { peekHTML, shellHTML } from "../availability/src/ui.js";

const PS = { members: [{ id: "w", name: "王平", tz: "Asia/Taipei" }, { id: "a", name: "安", tz: null }] };
const peek = () => peekHTML(PS, ["w"], "星期一", 1140, ["一 19:00　Asia/Taipei"]);

test("★ 彈窗的關閉控制項必須是 <button>（判斷式靠 tagName）", () => {
  const h = peek();
  const btns = [...h.matchAll(/<button[^>]*data-act="close-peek"/g)];
  assert.ok(btns.length >= 2, `關閉鍵只有 ${btns.length} 個 —— 右上角的 ✕ 與底下的「關起來」都要在`);
});

test("★ 彈窗不准再出現 data-stop（就是它把關閉鍵排除掉的）", () => {
  assert.ok(!peek().includes("data-stop"),
    "data-stop 又回來了 —— 關不關現在由 main.js 正面表列，不靠祖先反面排除");
});

test("遮罩本身要帶 close-peek，點外面才關得掉", () => {
  assert.match(peek(), /<div class="scrim" data-act="close-peek"/);
});

test("✕ 有 aria-label（讀螢幕的人聽不到一個叉）", () => {
  assert.match(peek(), /class="x"[^>]*aria-label="[^"]+"/);
});

test("彈窗要講出誰有空、誰沒空，還有沒設時區的人為什麼不在裡面", () => {
  const h = peek();
  assert.ok(h.includes("王平"), "沒有列出有空的人");
  assert.ok(h.includes("安") && h.includes("還沒設定時區"), "沒設時區的人要被交代，不能默默消失");
});

// S.msg 設了卻沒有地方畫，等於又做了一個「按了沒反應」的按鈕。
test("★ shellHTML 會把訊息畫出來", () => {
  const withMsg = shellHTML("board", "<i>x</i>", "9/1 – 9/7", "只能往前看四週。");
  const without = shellHTML("board", "<i>x</i>", "9/1 – 9/7", "");
  assert.ok(withMsg.includes("只能往前看四週。"), "訊息沒有被畫出來");
  assert.notEqual(withMsg, without, "有訊息跟沒訊息畫出來一樣，等於訊息沒有作用");
});
