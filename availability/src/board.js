// 把每個人的時段換算成觀看者的格子。純函式，抽出來是為了測得到
// （main.js 一 import 就會跑 boot()）。
import { slotInstants, cellOf } from "./tz.js";

// members: [{id, tz}]、slots: Map(id → Set("wd:min")）
// 回 Map("dayIndex:minute" → [id]）。
//
// **沒設時區的人只跳過他自己，不影響其他人。** 三十個人裡有一個沒設，
// 其他二十九個照樣畫得出來 —— 那一個會出現在成員清單上被催。
export function boardCounts(members, slots, weekStart, viewerTz) {
  const counts = new Map();
  for (const m of members) {
    if (!m.tz) continue;
    for (const k of (slots.get(m.id) || [])) {
      const [wd, min] = k.split(":").map(Number);
      for (const inst of slotInstants(weekStart, wd, min, m.tz)) {
        const c = cellOf(inst, weekStart, viewerTz);
        if (!c) continue;
        // 週起點就是星期一（setWeek 傳 firstWeekday = 1），畫面欄位也是
        // 星期一到星期日，所以 dayIndex 直接就是欄號，中間沒有轉換。
        const key = c.dayIndex + ":" + c.minute;
        if (!counts.has(key)) counts.set(key, []);
        if (!counts.get(key).includes(m.id)) counts.get(key).push(m.id);
      }
    }
  }
  return counts;
}

// 第一個有人有空的時刻（分鐘）。沒有人有空就回 null。
// 看板開起來要捲到這裡，理由見 main.js 呼叫它的地方。
export function firstBusyMinute(counts) {
  let best = null;
  for (const k of counts.keys()) {
    const min = Number(k.split(":")[1]);
    if (best === null || min < best) best = min;
  }
  return best;
}
