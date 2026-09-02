// 看板的時區運算。規格 §5 說這是最容易做錯的地方。
// 跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { partsIn, offsetOf, toInstant, weekdayOf, addDays, startOfWeek,
         slotInstants, cellOf, offsetLabel, detectTz } from "../availability/src/tz.js";

const TPE = "Asia/Taipei", DET = "America/Detroit";

test("weekdayOf 的 0 是星期日，跟資料庫 availability.weekday 同一套", () => {
  assert.equal(weekdayOf(2026, 3, 1), 0, "2026-03-01 是星期日");
  assert.equal(weekdayOf(2026, 3, 2), 1, "2026-03-02 是星期一");
  assert.equal(weekdayOf(2026, 3, 7), 6, "2026-03-07 是星期六");
});

// 用 Date.UTC 算而不是 new Date(y,m,d)：後者用執行環境的時區解讀，
// 在 UTC+8 以外的機器上會差一天。這條在 CI 換機器時會抓到。
// ⚠ **要開子行程，不能只改 process.env.TZ。**
// 第一版是在同一個行程裡改 process.env.TZ 然後呼叫 weekdayOf ——
// 反向驗證時把 weekdayOf 改成 `new Date(y, m-1, d).getDay()`（會吃執行環境時區），
// 那條測試**照樣通過**。原因是 Node 不會因為執行中改了那個變數就換掉時區。
// 也就是說它測的不是它名字說的那件事（README 第 12 項）。
// 真的要驗，時區必須在行程啟動時就設好。
test("weekdayOf 不受執行環境時區影響（開子行程真的換時區）", () => {
  const code = 'import("./availability/src/tz.js").then(m => ' +
               'process.stdout.write(String(m.weekdayOf(2026, 3, 1))))';
  for (const tz of ["UTC", "Asia/Taipei", "America/Detroit", "Pacific/Kiritimati"]) {
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", code],
                        { env: { ...process.env, TZ: tz }, encoding: "utf8" });
    assert.equal(r.status, 0, `TZ=${tz} 子行程掛了：${r.stderr}`);
    assert.equal(r.stdout.trim(), "0", `TZ=${tz} 時 2026-03-01 算成星期 ${r.stdout.trim()}`);
  }
});

test("addDays 跨月跨年", () => {
  assert.deepEqual(addDays(2026, 1, 31, 1), { year: 2026, month: 2, day: 1 });
  assert.deepEqual(addDays(2026, 12, 31, 1), { year: 2027, month: 1, day: 1 });
  assert.deepEqual(addDays(2026, 3, 1, -1), { year: 2026, month: 2, day: 28 });
});

test("startOfWeek 回的是當地的週日凌晨", () => {
  const ws = startOfWeek(new Date("2026-03-04T12:00:00Z"), DET);
  const p = partsIn(ws, DET);
  assert.equal(weekdayOf(p.year, p.month, p.day), 0, "不是星期日");
  assert.equal(p.hour, 0);
  assert.equal(p.minute, 0);
});

// ★ 規格 §5-4 的「星期會錯位」。這一條是整個看板存在的理由：
// 台北的週一早上，在美東是週日晚上。
test("★ 台北的週一 08:00 在美東觀看者眼中是週日", () => {
  const ws = startOfWeek(new Date("2026-03-04T12:00:00Z"), DET);
  const [inst] = slotInstants(ws, 1, 8 * 60, TPE);
  const cell = cellOf(inst, ws, DET);
  assert.equal(cell.dayIndex, 0, "應該落在觀看者的星期日那一欄");
  assert.equal(cell.minute, 19 * 60, "應該是 19:00（美東冬令，時差 13 小時）");
});

test("台北的週一 19:00 在美東是週一早上 06:00", () => {
  const ws = startOfWeek(new Date("2026-03-04T12:00:00Z"), DET);
  const [inst] = slotInstants(ws, 1, 19 * 60, TPE);
  assert.deepEqual(cellOf(inst, ws, DET), { dayIndex: 1, minute: 6 * 60 });
});

// 同一個人看自己的時段，永遠落在他自己填的那一格。
// 這是所有換算的下界：連這個都錯的話，上面兩條對了也沒有意義。
test("【對照】自己看自己的時段，格子不會跑掉", () => {
  const ws = startOfWeek(new Date("2026-03-04T12:00:00Z"), TPE);
  for (const [wd, min] of [[0, 0], [1, 1140], [3, 570], [6, 1410]]) {
    const [inst] = slotInstants(ws, wd, min, TPE);
    assert.deepEqual(cellOf(inst, ws, TPE), { dayIndex: wd, minute: min },
      `週${wd} ${min} 分跑掉了`);
  }
});

// ── DST：下面兩條釘的是**實測到的行為**，不是「應該怎樣」 ──
// 規格 §5-4：這兩天不用特殊處理，但要知道會發生，不要當成 bug。
// 哪天 toInstant 換了實作，這兩條會變紅 —— 那時候要回來讀規格再決定，
// 不要直接改這裡的期望值。

test("春季不存在的那一小時會被收合，不是消失", () => {
  const ws = startOfWeek(new Date("2026-03-09T12:00:00Z"), DET);   // 含 3/8
  const a = slotInstants(ws, 0, 90, DET);    // 週日 01:30，存在
  const b = slotInstants(ws, 0, 150, DET);   // 週日 02:30，那天不存在
  assert.equal(a.length, 1);
  assert.equal(b.length, 1, "不存在的時刻應該收合成一個，不是回零個");
  assert.equal(a[0].getTime(), b[0].getTime(),
    "01:30 與 02:30 應該收合到同一個瞬間 —— 兩格會疊在一起，這是已知且刻意不處理的");
});

test("秋季重複的那一小時只回一個，不是兩個", () => {
  const ws = startOfWeek(new Date("2026-11-02T12:00:00Z"), DET);   // 含 11/1
  assert.equal(slotInstants(ws, 0, 90, DET).length, 1,
    "重複的當地時刻目前只取第一次。規格 §5-4 說不特殊處理");
});

test("落在這一週以外的時段回空陣列，不會被畫錯格", () => {
  const ws = startOfWeek(new Date("2026-03-04T12:00:00Z"), DET);
  assert.equal(cellOf(new Date(ws.getTime() - 1), ws, DET), null);
  assert.equal(cellOf(new Date(ws.getTime() + 7 * 86400000), ws, DET), null);
});

test("offsetLabel 認得半小時的時區", () => {
  const d = new Date("2026-03-04T12:00:00Z");
  assert.equal(offsetLabel(d, TPE), "UTC+8");
  assert.equal(offsetLabel(d, "Asia/Kolkata"), "UTC+5:30");
  assert.equal(offsetLabel(d, "UTC"), "UTC+0");
});

// 猜不到時區時**不准回一個預設值**。回台北的話，一個在密西根的人會被安靜地
// 畫到台北的時間上，而畫面看起來完全正常 —— 沒有人看得出來那是錯的。
test("detectTz 猜不到就回 null，不編一個出來", () => {
  const real = Intl.DateTimeFormat;
  try {
    Intl.DateTimeFormat = function () { throw new Error("nope"); };
    assert.equal(detectTz(), null);
  } finally { Intl.DateTimeFormat = real; }
  assert.ok(typeof detectTz() === "string" && detectTz().includes("/"),
    "正常環境下應該猜得到一個 IANA 名稱");
});

// offsetOf 是 §5-3 那三支之一，被 toInstant 用著。這一條測的是它真的會
// 隨著 DST 改變 —— 那正是規格說「不要存 UTC 偏移量」的理由：
// 同一個時區在一年之中的偏移不是固定的，存死了就會錯。
test("offsetOf 會隨夏令時間改變（所以偏移量不能存死）", () => {
  const winter = offsetOf(new Date("2026-01-15T12:00:00Z"), DET) / 3600000;
  const summer = offsetOf(new Date("2026-07-15T12:00:00Z"), DET) / 3600000;
  assert.equal(winter, -5, "美東冬令是 UTC-5");
  assert.equal(summer, -4, "美東夏令是 UTC-4");
  assert.notEqual(winter, summer, "偏移量在一年之中變了 —— 這就是不能存死的原因");

  // 台北不換日光節約，一年到頭都是 +8。有這一條才看得出上面那個差別
  // 是 DST 造成的，不是這個函式本身不穩定。
  assert.equal(offsetOf(new Date("2026-01-15T12:00:00Z"), TPE) / 3600000, 8);
  assert.equal(offsetOf(new Date("2026-07-15T12:00:00Z"), TPE) / 3600000, 8);
});

test("offsetLabel 跟著 offsetOf 一起變", () => {
  assert.equal(offsetLabel(new Date("2026-01-15T12:00:00Z"), DET), "UTC-5");
  assert.equal(offsetLabel(new Date("2026-07-15T12:00:00Z"), DET), "UTC-4");
});
