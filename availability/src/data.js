// 看板的資料層。直接用 shared/，**不 import passport/ 的任何東西**
//（跟 app/ 同一條規矩：護照壞掉不該讓別的功能一起打不開）。
import { supabase } from "../../shared/supabase.js";
import { authMessage, isOfflineError } from "../../shared/auth.js";

const SLOT = 30;                      // 半小時一格
export const key = (wd, min) => wd + ":" + min;

// 一次把看板需要的三份資料拿回來。
//
// **三個查詢都要成功才算成功。** 只有 profiles 回來、availability 失敗的話，
// 畫面會變成「每個人都完全沒空」——那看起來像大家都還沒填，
// 而不是像出錯了，沒有人會回報。
export async function loadAll() {
  if (!supabase) throw new Error(authMessage(null));
  const [pf, av, mt] = await Promise.all([
    supabase.from("profiles").select("id, name_zh, name_en, team, tz").eq("role", "cadre"),
    supabase.from("availability").select("user_id, weekday, minute"),
    supabase.from("availability_meta").select("user_id, updated_at, notice_seen_at"),
  ]);
  const bad = [pf, av, mt].find(r => r.error);
  if (bad) throw bad.error;

  const meta = new Map(mt.data.map(r => [r.user_id, r]));
  const slots = new Map();
  for (const r of av.data) {
    if (!slots.has(r.user_id)) slots.set(r.user_id, new Set());
    slots.get(r.user_id).add(key(r.weekday, r.minute));
  }
  const members = pf.data.map(p => ({
    id: p.id,
    name: p.name_zh || p.name_en || "（沒有名字）",
    team: p.team || "",
    tz: p.tz || null,
    updatedAt: meta.get(p.id) ? meta.get(p.id).updated_at : null,
    noticeSeenAt: meta.get(p.id) ? meta.get(p.id).notice_seen_at : null,
  })).sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
  return { members, slots };
}

// 存自己的時段。**算出差集只寫差的那幾格，不是先刪光再全部寫回。**
//
// 先刪光再寫回有兩個問題：刪成功而插入失敗的話，他整週的時間就沒了
//（而他以為只是存檔失敗）；就算都成功，trigger 也會為了沒有變的格子
// 白跑幾十次。差集寫法在「只改了一格」的常見情況下只送一個請求。
export async function saveMine(userId, wanted, current) {
  const add = [...wanted].filter(k => !current.has(k));
  const del = [...current].filter(k => !wanted.has(k));
  if (!add.length && !del.length) return { add: 0, del: 0 };

  if (del.length) {
    // 一次刪一批。PostgREST 的 or 語法在幾十個條件時會很長，
    // 所以照星期分組刪——最多七個請求，而實際上通常只有一兩個。
    const byDay = new Map();
    for (const k of del) {
      const [wd, min] = k.split(":").map(Number);
      if (!byDay.has(wd)) byDay.set(wd, []);
      byDay.get(wd).push(min);
    }
    for (const [wd, mins] of byDay) {
      const { error } = await supabase.from("availability")
        .delete().eq("user_id", userId).eq("weekday", wd).in("minute", mins);
      if (error) throw error;
    }
  }
  if (add.length) {
    const rows = add.map(k => {
      const [wd, min] = k.split(":").map(Number);
      return { user_id: userId, weekday: wd, minute: min };
    });
    const { error } = await supabase.from("availability").insert(rows);
    if (error) throw error;
  }
  return { add: add.length, del: del.length };
}

// 看過告知。規格 §4-5 第 3 點 —— 這是這個功能唯一的知情同意，
// 所以是「按了確認才記」，不是「打開頁面就記」。
export async function markNoticeSeen(userId) {
  const { error } = await supabase.from("availability_meta")
    .upsert({ user_id: userId, notice_seen_at: new Date().toISOString() },
            { onConflict: "user_id" });
  if (error) throw error;
}

// 「我確認過了，沒有變」。updated_at 前端寫不動，只能走這支 RPC。
export async function confirmUnchanged() {
  const { data, error } = await supabase.rpc("confirm_availability_unchanged");
  if (error) throw error;
  return data;
}

// 設定自己的時區。tz 存在 profiles，欄位授權裡有它。
export async function saveTz(userId, tz) {
  const { error } = await supabase.from("profiles").update({ tz }).eq("id", userId);
  if (error) throw error;
}

export { SLOT, isOfflineError, authMessage };
