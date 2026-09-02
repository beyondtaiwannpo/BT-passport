// 每週時間看板（規格 §4、§5）。
import * as AUTH from "../../shared/auth.js";
import { supabase } from "../../shared/supabase.js";
import * as DATA from "./data.js";
import * as UI from "./ui.js";
import { searchTz } from "./tz-alias.js";
import { applyRange, copyDay, quickDays } from "./edit.js";
import { startOfWeek, slotInstants, cellOf, detectTz, partsIn, addDays, toInstant } from "./tz.js";

const root = () => document.getElementById("bt-root");
const K = DATA.key;

let S = {
  user: null, role: null, myTz: null, down: false, ready: false,
  tab: "board", members: [], slots: new Map(),
  mine: new Set(), saved: new Set(), dirty: false, mineMsg: "",
  weekStart: null, weekOffset: 0,
  chips: new Set(), bfrom: 19 * 60, bto: 22 * 60, copyFrom: 1,
  needNotice: false, needTz: false, tzQuery: "", tzResults: [], tzGuess: null,
  peek: null, msg: "", busy: false
};

// ── 換算：把所有人的時段落到觀看者的格子上 ──────────────────────────
function boardCounts() {
  const counts = new Map();
  for (const m of S.members) {
    if (!m.tz) continue;                       // 沒設時區的人畫不出來（成員清單會列他）
    for (const k of (S.slots.get(m.id) || [])) {
      const [wd, min] = k.split(":").map(Number);
      for (const inst of slotInstants(S.weekStart, wd, min, m.tz)) {
        const c = cellOf(inst, S.weekStart, S.myTz);
        if (!c) continue;
        // **週起點就是星期一**（setWeek 傳 firstWeekday = 1），而畫面欄位也是
        // 星期一到星期日，所以 dayIndex 直接就是欄號，中間沒有轉換。
        // 第一版讓週起點停在星期日、欄位卻從星期一排，那個錯開需要一段對映程式碼，
        // 而我在那段裡寫出了一個算成兩倍的式子。**讓那段對映不存在比寫對它更好。**
        const key = c.dayIndex + ":" + c.minute;
        if (!counts.has(key)) counts.set(key, []);
        if (!counts.get(key).includes(m.id)) counts.get(key).push(m.id);
      }
    }
  }
  return counts;
}

function weekDates() {
  const p = partsIn(S.weekStart, S.myTz);
  return [0, 1, 2, 3, 4, 5, 6].map(i => {
    const d = addDays(p.year, p.month, p.day, i);
    return d.month + "/" + d.day;
  });
}
function weekLabel() {
  const p = partsIn(S.weekStart, S.myTz);
  const e = addDays(p.year, p.month, p.day, 6);
  return `${p.month}/${p.day} – ${e.month}/${e.day}` + (S.weekOffset === 0 ? "（本週）" : "");
}

// ── 畫面 ────────────────────────────────────────────────────────────
function render() {
  const el = root();
  if (!el) return;
  if (S.down) { el.innerHTML = UI.downHTML(); return; }
  if (!S.ready) { el.innerHTML = `<div class="empty">載入中…</div>`; return; }
  if (S.role !== "cadre") { el.innerHTML = UI.notCadreHTML(); return; }
  if (S.needNotice) { el.innerHTML = UI.noticeHTML(S.msg, S.busy); return; }
  if (S.needTz) { el.innerHTML = UI.tzSetupHTML(S.tzGuess, S.tzQuery, S.tzResults, S.msg); return; }

  let inner, label = null;
  if (S.tab === "board") { inner = UI.boardHTML(S, boardCounts(), weekDates()); label = weekLabel(); }
  else if (S.tab === "mine") inner = UI.mineHTML(S);
  else inner = UI.membersHTML(S, Date.now());
  el.innerHTML = UI.shellHTML(S.tab, inner, label);
  if (S.peek) el.insertAdjacentHTML("beforeend", S.peek);
}

// ── 啟動 ────────────────────────────────────────────────────────────
async function boot() {
  try {
    const who = await AUTH.currentUserDetailed();
    if (who.offline) { S.down = true; render(); return; }
    S.user = who.user;
    if (!S.user) { location.replace("../app/?next=availability"); return; }

    const { data, error } = await supabase
      .from("profiles").select("role, tz").eq("id", S.user.id).maybeSingle();
    if (error) throw error;
    S.role = data ? data.role : null;
    S.myTz = data ? data.tz : null;
    if (S.role !== "cadre") { S.ready = true; render(); return; }

    const all = await DATA.loadAll();
    S.members = all.members; S.slots = all.slots;
    S.saved = new Set(S.slots.get(S.user.id) || []);
    S.mine = new Set(S.saved);

    const me = S.members.find(m => m.id === S.user.id);
    S.needNotice = !(me && me.noticeSeenAt);
    S.needTz = !S.myTz;
    S.tzGuess = detectTz();
    setWeek(0);
    S.ready = true;
    render();
  } catch (e) {
    console.error("看板載入失敗。真正的原因：", e);
    S.down = true; render();
  }
}
function setWeek(off) {
  S.weekOffset = off;
  const base = new Date(Date.now() + off * 7 * 86400000);
  // firstWeekday = 1：一週從星期一開始，跟畫面欄位一致。
  S.weekStart = startOfWeek(base, S.myTz || "UTC", 1);
}

// ── 事件 ────────────────────────────────────────────────────────────
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;

  if (act === "retry") { location.reload(); return; }
  if (act === "tab") { S.tab = b.dataset.t; S.peek = null; render(); return; }

  if (act === "week") {
    const d = +b.dataset.d;
    // 前後各 4 週（使用者 2026-09-02 裁定）。翻週唯一的作用是看 DST 切換
    // 前後的差別，一年兩次，範圍不需要更大。
    const next = d === 0 ? 0 : Math.max(-4, Math.min(4, S.weekOffset + d));
    setWeek(next); render(); return;
  }

  if (act === "notice-ok") {
    // 連點會送出兩次請求。第二次撞主鍵之後現在雖然不會報錯，
    // 但畫面在那兩秒裡完全沒有反應，而「沒有反應」正是這個 bug 的形狀。
    if (S.busy) return;
    S.busy = true; S.msg = ""; render();
    try {
      await DATA.markNoticeSeen(S.user.id);
      S.needNotice = false; S.busy = false; render();
    } catch (err) {
      console.error("記錄告知失敗。真正的原因：", err);
      S.busy = false;
      S.msg = DATA.authMessage(err);
      render();
    }
    return;
  }

  if (act === "tz-pick") {
    try {
      await DATA.saveTz(S.user.id, b.dataset.tz);
      S.myTz = b.dataset.tz; S.needTz = false; S.msg = ""; setWeek(S.weekOffset); render();
    } catch (err) { S.msg = DATA.authMessage(err); render(); }
    return;
  }
  if (act === "change-tz") { S.needTz = true; S.tzQuery = ""; S.tzResults = []; render(); return; }

  if (act === "chip") {
    const wd = +b.dataset.wd;
    S.chips.has(wd) ? S.chips.delete(wd) : S.chips.add(wd);
    readBatch(); render(); return;
  }
  if (act === "quick") {
    const q = b.dataset.q;
    S.chips = new Set(quickDays(q));
    readBatch(); render(); return;
  }

  if (act === "apply") {
    readBatch();
    if (!S.chips.size) { S.mineMsg = "先選要套用到哪幾天。"; render(); return; }
    if (S.bfrom >= S.bto) { S.mineMsg = "結束時間要比開始時間晚。"; render(); return; }
    const add = b.dataset.mode === "add";
    const r = applyRange(S.mine, [...S.chips], S.bfrom, S.bto, add);
    S.mine = r.set;
    const n = r.changed;
    S.dirty = true;
    S.mineMsg = `${add ? "加了" : "拿掉了"} ${n} 格，記得按儲存。`;
    render(); return;
  }

  if (act === "copyday") {
    readBatch();
    const from = +document.getElementById("copyfrom").value;
    S.copyFrom = from;
    if (!S.chips.size) { S.mineMsg = "先選要複製到哪幾天。"; render(); return; }
    const r = copyDay(S.mine, from, [...S.chips]);
    S.mine = r.set;
    S.dirty = true;
    S.mineMsg = `複製好了，變動 ${r.changed} 格，記得按儲存。`;
    render(); return;
  }

  // 單格微調**不整頁重畫**：336 個格子重畫會讓捲動位置跳掉，
  // 而使用者正在格線中間微調。只改那一顆按鈕的狀態。
  if (act === "toggle") {
    const k = K(+b.dataset.wd, +b.dataset.m);
    const on = !S.mine.has(k);
    on ? S.mine.add(k) : S.mine.delete(k);
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
    S.dirty = true;
    const save = document.querySelector('[data-act="save"]');
    if (save) { save.disabled = false; save.textContent = "儲存"; }
    return;
  }

  if (act === "save") {
    readBatch();
    b.disabled = true; b.textContent = "存檔中…";
    try {
      const r = await DATA.saveMine(S.user.id, S.mine, S.saved);
      S.saved = new Set(S.mine);
      S.slots.set(S.user.id, new Set(S.mine));
      S.dirty = false;
      S.mineMsg = r.add || r.del ? `存好了（+${r.add} / -${r.del}）。` : "沒有變動。";
      const me = S.members.find(m => m.id === S.user.id);
      if (me) me.updatedAt = new Date().toISOString();
    } catch (err) {
      console.error("存檔失敗：", err);
      S.mineMsg = DATA.authMessage(err);
      S.dirty = true;
    }
    render(); return;
  }

  if (act === "confirm-same") {
    try {
      const at = await DATA.confirmUnchanged();
      const me = S.members.find(m => m.id === S.user.id);
      if (me) me.updatedAt = at;
      S.mineMsg = "記下來了，這份時間是最新的。";
    } catch (err) { S.mineMsg = DATA.authMessage(err); }
    render(); return;
  }

  if (act === "peek") {
    const col = +b.dataset.c, min = +b.dataset.m;
    const free = boardCounts().get(col + ":" + min) || [];
    S.peek = UI.peekHTML(S, free, "星期" + UI.DAY_ZH[UI.COL_ORDER[col]], min, localTimesFor(col, min));
    render(); return;
  }
  if (act === "close-peek" && !e.target.closest("[data-stop]")) { S.peek = null; render(); return; }
});

document.addEventListener("input", e => {
  if (e.target.id === "tzq") {
    S.tzQuery = e.target.value;
    S.tzResults = searchTz(S.tzQuery);
    const list = document.querySelector(".tzlist");
    if (list) list.innerHTML = S.tzResults.map(r =>
      `<button class="tzitem" data-act="tz-pick" data-tz="${r.tz}"><b>${r.label}</b><span>${r.tz}</span></button>`
    ).join("") || `<div class="empty sm">找不到「${S.tzQuery}」。換個講法試試，例如打州名或最近的大城市。</div>`;
  }
});

// 送出前把兩個選單的值收進 S，不然重畫之後會回到預設值。
function readBatch() {
  const f = document.getElementById("bfrom"), t = document.getElementById("bto");
  if (f) S.bfrom = +f.value;
  if (t) S.bto = +t.value;
  const c = document.getElementById("copyfrom");
  if (c) S.copyFrom = +c.value;
}

// 這一格在每個人所在地的當地時間（規格 §4-3 A）。
function localTimesFor(col, min) {
  const p = partsIn(S.weekStart, S.myTz);
  const d = addDays(p.year, p.month, p.day, col);
  const target = toInstant(d.year, d.month, d.day, Math.floor(min / 60), min % 60, S.myTz);
  const zones = [...new Set(S.members.filter(m => m.tz).map(m => m.tz))];
  if (!target) return ["（這一格算不出來）"];
  return zones.map(tz => {
    const q = partsIn(target, tz);
    return `${UI.DAY_ZH[new Date(Date.UTC(q.year, q.month - 1, q.day)).getUTCDay()]} ` +
           `${String(q.hour).padStart(2, "0")}:${String(q.minute).padStart(2, "0")}　${tz}`;
  });
}

boot();
