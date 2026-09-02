// 「我的每週時間」的編輯運算。純函式，不碰 DOM ——
// 抽出來是為了測得到：main.js 一 import 就會跑 boot()。
//
// 格子用 "weekday:minute" 當鍵（weekday 0 = 星期日，跟資料庫同一套）。
export const key = (wd, min) => wd + ":" + min;
export const SLOT = 30;

// 把一段時間套到選中的那幾天。回傳新的 Set 與實際變動的格數。
//
// **範圍是左閉右開**：19:00 到 22:00 是 19:00、19:30、20:00、20:30、21:00、21:30
// 六格，不包含 22:00 那一格。理由是使用者講「到 22:00」的意思是 22:00 就結束了，
// 把 22:00 那一格也塗上去等於他被排到 22:30。
// 2026-09-02：這裡本來有一句 `if (!(weekdays.length) || !(from < to)) return ...`。
// 反向驗證時把它拿掉是**全綠**的，而原因不是測試不夠嚴 ——
// 是它在防一件不會發生的事：空陣列的 for...of 不會跑，
// from >= to 時 `m < to` 第一次就不成立。**那個危險不存在**（README 第 12 項第三種）。
// 真正需要的只有 null 防護，所以留下 `|| []`，其餘刪掉。
// （畫面上「結束時間要比開始時間晚」那句提示在 main.js，那是給人看的，不是防呆。）
export function applyRange(set, weekdays, from, to, add) {
  const out = new Set(set);
  let n = 0;
  for (const wd of weekdays || [])
    for (let m = from; m < to; m += SLOT) {
      const k = key(wd, m);
      if (add ? !out.has(k) : out.has(k)) n++;
      add ? out.add(k) : out.delete(k);
    }
  return { set: out, changed: n };
}

// 把某一天整天複製到別的幾天。
//
// **這是覆蓋不是疊加**：目標日原本有、來源日沒有的格子會被清掉。
// 「複製星期一到星期三」的意思是「星期三變得跟星期一一樣」，
// 疊加的話使用者沒有辦法用它來修正 —— 只能越加越多。
export function copyDay(set, from, targets) {
  const out = new Set(set);
  let n = 0;
  for (const wd of targets || []) {
    if (wd === from) continue;
    for (let m = 0; m < 1440; m += SLOT) {
      const src = out.has(key(from, m)), dst = out.has(key(wd, m));
      if (src !== dst) n++;
      src ? out.add(key(wd, m)) : out.delete(key(wd, m));
    }
  }
  return { set: out, changed: n };
}

// 快捷鍵選的是哪幾天。0 = 星期日、6 = 星期六。
export function quickDays(q) {
  if (q === "weekday") return [1, 2, 3, 4, 5];
  if (q === "weekend") return [0, 6];
  if (q === "all") return [0, 1, 2, 3, 4, 5, 6];
  return [];
}

// 把要刪的格子照星期分組。PostgREST 的 or 語法在幾十個條件時會很長，
// 分組之後最多七個請求，而實際上通常只有一兩個。
// 抽出來是為了測得到 —— 它埋在 saveMine 裡的時候要 mock 整個 supabase client 才測得動。
export function groupByWeekday(keys) {
  const byDay = new Map();
  for (const k of keys) {
    const [wd, min] = k.split(":").map(Number);
    if (!byDay.has(wd)) byDay.set(wd, []);
    byDay.get(wd).push(min);
  }
  return byDay;
}

// 要寫進資料庫的差集。**不是先刪光再全部寫回**（理由見 data.js 的 saveMine）。
export function diff(wanted, current) {
  return {
    add: [...wanted].filter(k => !current.has(k)),
    del: [...current].filter(k => !wanted.has(k)),
  };
}
