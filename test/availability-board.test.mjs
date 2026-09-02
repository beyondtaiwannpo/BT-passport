// 團隊看板的換算與呈現。
import { test } from "node:test";
import assert from "node:assert/strict";
import { boardCounts, firstBusyMinute } from "../availability/src/board.js";
import { startOfWeek } from "../availability/src/tz.js";
import { boardHTML } from "../availability/src/ui.js";

const TPE = "Asia/Taipei", DET = "America/Detroit";
const evening = id => new Set((() => {
  const s = []; for (let d = 0; d < 7; d++) for (let m = 1140; m <= 1290; m += 30) s.push(d + ":" + m);
  return s;
})());
const ws = tz => startOfWeek(new Date("2026-09-02T12:00:00Z"), tz, 1);

// ★ 使用者 2026-09-02 的擔心：三十個人裡只要有一個沒設時區，
// 會不會全部人都看不到看板。**不會** —— 但那個擔心值得有東西守著，
// 因為「一個人的壞資料拖垮整頁」是很容易寫出來的形狀。
test("★ 有人沒設時區，不影響其他人畫得出來", () => {
  const members = [{ id: "w", tz: DET }, { id: "a", tz: null }, { id: "z", tz: TPE }];
  const slots = new Map([["w", evening()], ["a", evening()], ["z", evening()]]);
  const counts = boardCounts(members, slots, ws(DET), DET);
  assert.ok(counts.size > 0, "整個看板空了 —— 一個人沒設時區把全部人拖垮了");
  const ids = new Set([...counts.values()].flat());
  assert.ok(ids.has("w") && ids.has("z"), "有設時區的人應該都畫得出來");
  assert.ok(!ids.has("a"), "沒設時區的人畫不出來（他會出現在成員清單上被催）");
});

test("換算不會掉格子：42 格進去，42 格出來", () => {
  const counts = boardCounts([{ id: "w", tz: DET }], new Map([["w", evening()]]), ws(DET), DET);
  assert.equal(counts.size, 42);
});

test("同一格兩個人會被算成兩個，不會覆蓋", () => {
  const members = [{ id: "w", tz: DET }, { id: "x", tz: DET }];
  const slots = new Map([["w", new Set(["1:1140"])], ["x", new Set(["1:1140"])]]);
  const counts = boardCounts(members, slots, ws(DET), DET);
  const only = [...counts.values()][0];
  assert.equal(only.length, 2);
});

test("同一個人的同一格不會被算兩次", () => {
  const members = [{ id: "w", tz: DET }];
  const slots = new Map([["w", new Set(["1:1140", "1:1140"])]]);  // Set 本來就去重，這裡測的是 includes 那一層
  const counts = boardCounts(members, slots, ws(DET), DET);
  assert.equal([...counts.values()][0].length, 1);
});

// ★ 2026-09-02 的 bug：格子都畫出來了，但第一格在第 38 列（19:00），
// 也就是容器頂端往下 600 多 px，而容器一次只看得到二十幾列。
// 使用者看到一片空的凌晨，結論是「看板看不到我填的東西」。
test("★ 知道第一個有人的時刻是幾點，好讓畫面捲過去", () => {
  const counts = boardCounts([{ id: "w", tz: DET }], new Map([["w", evening()]]), ws(DET), DET);
  assert.equal(firstBusyMinute(counts), 1140, "19:00");
  assert.equal(firstBusyMinute(new Map()), null, "空的時候要回 null，不是回 0");
});

test("空的看板要說出是哪一種空，不是給一片空白", () => {
  const dates = ["9/1", "9/2", "9/3", "9/4", "9/5", "9/6", "9/7"];
  const noTz = boardHTML({ members: [{ id: "a", tz: null }], slots: new Map() }, new Map(), dates);
  assert.ok(noTz.includes("還沒有人設定時區"), "沒有人設時區時要講那件事");

  const noFill = boardHTML({ members: [{ id: "w", tz: DET }], slots: new Map() }, new Map(), dates);
  assert.ok(noFill.includes("還沒有人填過"), "沒有人填時要講那件事");

  const filledButEmpty = boardHTML(
    { members: [{ id: "w", tz: DET }], slots: new Map([["w", new Set(["1:600"])]]) }, new Map(), dates);
  assert.ok(filledButEmpty.includes("這一週沒有任何一格對得上"), "有填卻對不上時要講那件事");

  // 有東西的時候不准出現那段話。
  const ok = boardHTML({ members: [{ id: "w", tz: DET }], slots: new Map([["w", evening()]]) },
                       boardCounts([{ id: "w", tz: DET }], new Map([["w", evening()]]), ws(DET), DET), dates);
  assert.ok(!ok.includes("這一週的看板是空的"), "有格子的時候不該說是空的");
});

test("格子真的被畫進 HTML（不是只算出來）", () => {
  const counts = boardCounts([{ id: "w", tz: DET }], new Map([["w", evening()]]), ws(DET), DET);
  const html = boardHTML({ members: [{ id: "w", tz: DET }], slots: new Map([["w", evening()]]) },
                         counts, ["9/1", "9/2", "9/3", "9/4", "9/5", "9/6", "9/7"]);
  const coloured = (html.match(/class="cell lv[1-4]"/g) || []).length;
  assert.equal(coloured, 42, `畫出來的有顏色格子是 ${coloured} 個，應該是 42`);
});
