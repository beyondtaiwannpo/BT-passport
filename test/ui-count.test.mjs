// stampCount：蓋了幾個章的唯一定義點。跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { stampCount, barHTML, idPageHTML } from "../passport/src/ui.js";

const PROFILE = { id: "00000000-0000-0000-0000-000000000000", name_zh: "王小明",
                   name_en: "Ming Wang", team: "Sponsorship Team", issued: "2026-08-22" };

const stateWith = n => ({
  stamps: Object.fromEntries(Array.from({ length: n }, (_, i) => [`a${i}`, { date: "2026-09-01" }]))
});

test("頂欄顯示的數字等於 stampCount", () => {
  // 這條驗的只是顯示端有沒有把 stampCount(S) 印錯（例如印成 done+1、
  // 或印成 S.activities.length）。stampCount 是唯一的計數定義點，
  // barHTML 內部透過 milestoneState 間接呼叫它 —— 跟這裡直接呼叫 stampCount(S)
  // 是兩條不同的路徑，不是同一次呼叫比兩次，所以不是恆真。
  // 「章的數量整份 src/ui.js 只准算一次」這件事測試碰不到，是架構性質，
  // 改由 check.sh 用 grep 守（見該檔案「章的數量」那條）。
  for (const n of [0, 1, 5, 17, 33]) {
    const S = { ...stateWith(n), activities: [], view: "passport" };
    const shown = barHTML(S).match(/<\/small>(\d+) <span/);
    assert.ok(shown, `barHTML 的數字抓不到（n=${n}），格式可能被改了`);
    assert.equal(Number(shown[1]), stampCount(S), `n=${n} 顯示的數字跟 stampCount 不一致`);
  }
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
