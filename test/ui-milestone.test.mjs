// 里程碑的狀態計算。跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { milestoneState, barHTML, idPageHTML } from "../src/ui.js";

const MS = [
  { id: "m22", threshold: 22, title_zh: "二十二", title_en: "TBD", description: "d" },
  { id: "m05", threshold: 5,  title_zh: "五",     title_en: "TBD", description: "d" },
  { id: "m33", threshold: 33, title_zh: "三十三", title_en: "TBD", description: "d" },
  { id: "m11", threshold: 11, title_zh: "十一",   title_en: "TBD", description: "d" }
];

const PROFILE = { id: "00000000-0000-0000-0000-000000000000", name_zh: "王小明",
                   name_en: "Ming Wang", team: "Sponsorship Team", issued: "2026-08-22" };

const stateWith = n => ({
  milestones: MS,
  stamps: Object.fromEntries(Array.from({ length: n }, (_, i) => [`a${i}`, { date: "2026-09-01" }]))
});

test("list 依 threshold 排序，不管進來的順序", () => {
  assert.deepEqual(milestoneState(stateWith(0)).list.map(m => m.threshold), [5, 11, 22, 33]);
});

test("邊界：0 / 4 / 5 / 32 / 33 / 34 個章", () => {
  const cases = [
    [0,  0, 5,  5],
    [4,  0, 5,  1],
    [5,  1, 11, 6],
    [32, 3, 33, 1],
    [33, 4, null, 0],
    [34, 4, null, 0]
  ];
  for (const [done, reachedN, nextThreshold, remaining] of cases) {
    const s = milestoneState(stateWith(done));
    assert.equal(s.done, done, `done=${done}`);
    assert.equal(s.reached.length, reachedN, `done=${done} 的 reached`);
    assert.equal(s.next ? s.next.threshold : null, nextThreshold, `done=${done} 的 next`);
    assert.equal(s.remaining, remaining, `done=${done} 的 remaining`);
  }
});

test("剛好達到門檻算達成，不是超過才算", () => {
  // 5 個章要解鎖門檻 5 的那個。差一個字就差一整個里程碑。
  assert.equal(milestoneState(stateWith(5)).reached.length, 1);
  assert.equal(milestoneState(stateWith(4)).reached.length, 0);
});

test("milestones 是空陣列時不炸 —— 那是容錯路徑的實際表現", () => {
  // data.js 在 milestones 查詢失敗時回空陣列（護照其餘部分照常）。
  // 這條測的就是那個狀態下的計算結果，不是假設。
  const s = milestoneState({ milestones: [], stamps: { a: {} } });
  assert.deepEqual(s.list, []);
  assert.deepEqual(s.reached, []);
  assert.equal(s.next, null);
  assert.equal(s.remaining, 0);
  assert.equal(s.done, 1);
});

test("milestones 是 undefined 時也不炸", () => {
  // 未登入的早期 return 若漏了 milestones、或呼叫端傳了舊形狀的 state。
  const s = milestoneState({ stamps: {} });
  assert.deepEqual(s.list, []);
  assert.equal(s.next, null);
});

test("頂欄顯示的數字等於 milestoneState 的 done", () => {
  // 這條驗的只是顯示端有沒有把 milestoneState(S).done 印錯（例如印成 done+1、
  // 或印成 S.activities.length）——**不是**「兩邊各自算的結果永遠同源」。
  // milestoneState 是純函式，同一個 S 呼叫兩次結果必然相同，所以拿 barHTML 的輸出
  // 跟「再呼叫一次 milestoneState(S).done」比較是恆真的：2026-08-25 審查實測過，
  // 把 barHTML 改回自己用 Object.keys(S.stamps).length 算一次，這條照樣綠。
  // 「章的數量整份 src/ui.js 只准算一次」這件事測試碰不到，是架構性質，
  // 改由 check.sh 用 grep 守（見該檔案「章的數量」那條）。
  for (const n of [0, 1, 5, 17, 33]) {
    const S = { ...stateWith(n), activities: [], view: "passport" };
    const shown = barHTML(S).match(/<\/small>(\d+) <span/);
    assert.ok(shown, `barHTML 的數字抓不到（n=${n}），格式可能被改了`);
    assert.equal(Number(shown[1]), milestoneState(S).done, `n=${n} 顯示的數字跟 done 不一致`);
  }
});

test("全部達成之後，頂欄不再顯示「還差幾個」", () => {
  const S = { ...stateWith(33), activities: [], view: "passport" };
  assert.ok(!barHTML(S).includes("下一個里程碑"));
});

test("還沒全部達成時，頂欄顯示正確的差額", () => {
  const S = { ...stateWith(3), activities: [], view: "passport" };
  assert.ok(barHTML(S).includes("下一個里程碑還差 2 個章"));
});

test("資料頁列出全部里程碑，未達成的標成鎖定", () => {
  const S = { ...stateWith(11), activities: [], profile: PROFILE };
  const html = idPageHTML(S);
  assert.equal((html.match(/class="slot" data-locked="0"/g) || []).length, 2, "5 與 11 已達成");
  assert.equal((html.match(/class="slot" data-locked="1"/g) || []).length, 2, "22 與 33 鎖定");
  assert.ok(html.includes("22 個章 · 鎖定"));
  assert.ok(html.includes("5 個章 · 已達成"));
});

test("沒有里程碑時，資料頁整塊不出現、頂欄也不多一行", () => {
  // 這是 milestones 讀取失敗時的實際表現（data.js 回空陣列）。
  const S = { milestones: [], stamps: {}, activities: [], profile: PROFILE, view: "passport" };
  assert.ok(!idPageHTML(S).includes("mstones"));
  assert.ok(!barHTML(S).includes("下一個里程碑"));
});

test("FULL 疊印：蓋滿才出現，而且沒有活動時不算蓋滿", () => {
  // idPageHTML 的 done 改成吃 milestoneState 之後，這條線沒有任何測試涵蓋（審查指出的）。
  // 0/0 那個 case 是既存的 bug：activities 空的時候 0 === 0 會成立，
  // 一個章都沒蓋的人會被蓋一個「0 / 0 · FULL」。
  // 跟 dotOn 的 acts.length && 是同一條理由：沒有東西可以完成的時候，不算完成。
  const mk = (n, total) => ({
    profile: PROFILE, milestones: [], entries: {},
    activities: Array.from({ length: total }, (_, i) => ({ id: "a" + i })),
    stamps: Object.fromEntries(Array.from({ length: n }, (_, i) => ["a" + i, { date: "2026-09-01" }]))
  });
  const hasFull = s => idPageHTML(s).includes("FULL");
  assert.equal(hasFull(mk(0, 33)), false, "0/33 不該是 FULL");
  assert.equal(hasFull(mk(32, 33)), false, "32/33 不該是 FULL");
  assert.equal(hasFull(mk(33, 33)), true, "33/33 要是 FULL");
  assert.equal(hasFull(mk(3, 3)), true, "3/3 要是 FULL（總數可以不是 33）");
  assert.equal(hasFull(mk(0, 0)), false, "沒有活動時不算蓋滿");
});
