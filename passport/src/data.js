// 儲存層。auth 與護照內容都走 Supabase，這個檔案是前端唯一碰資料庫的地方 ——
// ui.js 只畫畫面、main.js 只接事件，兩者都不認識 supabase client。
//
// Task 6（2026-08-17）把護照內容從 localStorage 換成 Supabase，七個函式的簽名一個都沒動，
// ui.js 一行都不用改。那是拆檔設計的驗證點，不是巧合：Task 4 就先把回傳形狀對齊資料表欄位
// （snake_case、description 而不是 desc），localStorage 版只是同一個形狀的另一種來源。
//
// 安全性不在這個檔案裡，在資料庫裡。這裡每一句 .eq("user_id", user.id) 都只是「少傳一點
// 資料回來」的效率措施，**不是**防止讀到別人心得的機制 —— 那是 RLS 的工作（schema.sql
// 的 entries_read）。把這裡的條件拿掉，資料庫仍然只會回自己的列；反過來說，
// 這裡寫得再嚴，RLS 一鬆就全破。改動時不要把這兩層搞混。
//
// 2026-08-31（階段 2）：連線與 auth 抽到 shared/ 了。這個檔案現在只管護照的內容。
// 下面把 shared/auth.js 的名字原樣再匯出一次 —— main.js 用的是
// `import * as DATA from "./data.js"`，再匯出之後它與 ui.js 一行都不用改。
// **新功能不要走這裡**，直接 import shared/auth.js。
import { supabase } from "../../shared/supabase.js";
import { currentUser } from "../../shared/auth.js";

export { supabase };
export { authMessage, configMessage, signUp, signIn, signOut,
         isOfflineError, currentUserDetailed, currentUser } from "../../shared/auth.js";

/* ---------- 護照內容 ---------- */

// 每個寫入函式開頭都重新問一次 currentUser()，而不是信任呼叫端傳進來的 id。
// 理由：id 若由呼叫端提供，「寫誰的資料」就變成畫面狀態說了算，而畫面狀態可能是
// 上一個使用者留下的（同一台電腦換人登入、session 過期後又登入別的帳號）。
// getUser() 讀的是 client 手上的 session，跟資料庫實際認的身分同一個來源。
// 成本是每次寫入多一次本地查詢，不是多一趟網路 —— supabase-js 有 session 快取。
async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Error("尚未登入");
  return user;
}

// 這些查詢彼此不相依，一起發。序列發的話是一個查詢一個 RTT，在手機網路上很有感。
//
// **刻意不寫數字。** 這句話原本寫「六個查詢」，而查詢數從那之後加過三次
// （milestones、destinations、visas）又減過一次 —— 註解沒有跟著改，
// 2026-08-27 拿掉 milestones 的時候它已經錯了兩輪、說的是六而實際是八。
// 數字不是這句話要傳達的東西，它要傳達的是「為什麼一起發」。
// 真的要守住數量的是 check.sh 那條「fetchAll 有幾個查詢，firstError 就要收幾個」。
function fetchAll(user) {
  return Promise.all([
    supabase.from("months").select("*").order("seq"),
    // month 之後一定要再 order("seq")：同月份有多個活動，只排 month 的話同月內順序
    // 由資料庫決定，也就是「不保證」—— 活動格子會在每次載入之間換位置，而學生記的是位置。
    supabase.from("activities").select("*").eq("active", true).order("month").order("seq"),
    // profiles 是「這個人」，passports 是「這本護照」（2026-08-31 拆表）。
    // 兩個都查，下面合併成同一個 profile 物件 —— ui.js 與 main.js 是照那個形狀寫的，
    // 拆表在它們眼裡不存在。
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("passports").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("stamps").select("act_id, stamped_on").eq("user_id", user.id),
    supabase.from("entries").select("act_id, note, photo").eq("user_id", user.id),
    supabase.from("destinations").select("*").eq("active", true).order("code"),
    supabase.from("visas").select("month, code")
  ]);
}

// 任何一個查詢失敗就整批視為失敗。部分成功比全部失敗更危險：少了 stamps 的畫面
// 看起來就是「一個章都沒蓋」，學生會以為自己的紀錄不見了，然後重蓋一次。
//
// 這條規則依賴一個前提（README 第 11 項的做法要求寫下前提）：**每一個查詢的
// 失敗都會讓畫面說謊。** destinations 讀不到的話，一個已經蓋滿三格的月份會
// 什麼章都沒有 —— 那跟「你還沒蓋滿」長得一模一樣；visas 讀不到更糟：畫面會
// 退回即時算，於是使用者看到的城市可能跟他上禮拜看到的不一樣，而且沒有任何
// 提示。兩者都符合這個前提，所以都在清單裡（2026-08-26，spec §9.4）。
//
// **曾經有過一個例外，現在沒有任何例外。** milestones 曾經刻意不在這張清單
// 裡：它讀不到的表現是「沒有里程碑 UI」，不會讓任何人誤以為自己的
// stamps／entries 不見了 —— 不符合上面那個前提，所以當時被排除在外。
// 2026-08-27 里程碑整個從產品裡移除，那個例外跟著消失。**現在沒有任何例外**：
// 清單裡的每一個查詢，失敗了就是要整批擋下來。
//
// 前提沒了規則就該跟著走（README 第 11 項）。哪天真的有一個新查詢看起來想要
// 例外，要重新判斷，但**判斷的門檻是「讀不到的時候畫面會不會誤導人」，
// 不是「這個功能重不重要」**——那才是當初 milestones 可以容錯而 destinations
// 不行的真正理由。
const firstError = rs => (rs.find(r => r.error) || {}).error || null;

export async function loadAll() {
  const user = await currentUser();
  // 未登入不是錯誤，是還沒登入。回空的形狀讓 main.js 的 render() 去顯示登入頁，
  // 這裡 throw 的話畫面會變成錯誤訊息，那是在對還沒登入的人說「出事了」。
  if (!user) return { profile: null, stamps: {}, entries: {}, activities: [], months: [], destinations: [], visas: {} };

  let [mo, ac, pf, pa, st, en, de, vi] = await fetchAll(user);
  let firstErr = firstError([mo, ac, pf, pa, st, en, de, vi]);

  // ── PGRST303「JWT issued at future」只重試這一種，而且只重試一次 ──
  //
  // 實測（2026-08-17，真實專案）：**註冊完成的那一瞬間**，剛簽發的 JWT 其 iat
  // 對 PostgREST 而言還在未來（次秒級的時鐘偏移），這批查詢會有一部分回 401 PGRST303。
  // 哪幾條中槍是隨機的 —— 那次是 activities 中槍、其餘四條 200。
  // 使用者看到的就是註冊完的第一個畫面寫著「活動資料讀不到」。重整一次就好，
  // 但那是整個產品第一印象最差的位置，九月會有三十個人同時踩到。
  //
  // **不要把這裡改成通用重試。** 只認 PGRST303 是刻意的：
  //   - 這個碼的語意單一（時鐘偏移），等一下必然會過，重試是真的在解決問題
  //   - 通用重試會把「權限真的不對」「表被改壞了」這種永遠不會好的錯誤，
  //     從「立刻失敗」拖成「轉圈很久然後失敗」—— 對使用者更糟，對除錯的人也更糟
  // 也不要加第二次重試：一次退避就過不了的話，那就不是時鐘偏移。
  //
  // ── 為什麼是 2000ms，而不是實測到的那個數字 ──
  // 2026-08-17 在真實註冊流程上量過一次：從收到 PGRST303 起，**154ms** 後同一個查詢
  // 就被接受了（第一次重打就過）。看到這個數字的人很容易想把下面的 2000 調小。**不要。**
  // 那個 154ms 是運氣好的一端，不是最差的一端，理由有三：
  //   1. JWT 的 iat 只有「秒」的精度。註冊剛好落在某一秒的開頭時，
  //      最差要等到將近 1 秒之後伺服器的時鐘才會越過 iat。
  //   2. 那次量測是 n=1。同一批五個查詢裡只有一個中槍，其餘四個同時成功 ——
  //      代表偏移不是固定值，而是每個 PostgREST 實例各自不同，會隨路由而變。
  //   3. **這段退避只在已經確認撞到 PGRST303 之後才會執行。**沒撞到的人
  //      一秒都不會多等。所以拉寬的成本不是「所有人多等 0.8 秒」，
  //      而是「本來就會看到錯誤畫面的那少數人多等 0.8 秒」—— 那是零成本的保險。
  // 換句話說：調小它能省下的是不存在的成本，賠上的是真實的失敗率。
  if (firstErr && firstErr.code === "PGRST303") {
    await new Promise(r => setTimeout(r, 2000));
    [mo, ac, pf, pa, st, en, de, vi] = await fetchAll(user);
    firstErr = firstError([mo, ac, pf, pa, st, en, de, vi]);
  }

  // 重試之後仍然失敗就往上丟。main.js 的 boot() 會接住並顯示
  // 「活動資料讀不到，重新整理試試。」—— 那句是可行動的，而且畫面不會是空白（spec §8.1）。
  if (firstErr) throw firstErr;

  // 兩張表都攤平成以 act_id 為鍵的物件 —— ui.js 是照這個形狀寫的（S.stamps[a.id]）。
  const stamps = {};
  (st.data || []).forEach(r => { stamps[r.act_id] = { date: r.stamped_on }; });
  const entries = {};
  (en.data || []).forEach(r => { entries[r.act_id] = { note: r.note, photo: r.photo }; });
  const visas = {};
  (vi.data || []).forEach(r => { visas[r.month] = r.code; });

  // 2026-08-31 拆表之後，一個人的資料在兩張表：
  //   profiles  誰（name_zh / name_en / team / avatar / tz / role）—— 每個人都有
  //   passports 這本護照（motto / issued / intro_seen）—— 只有幹部有
  // 這裡合併回一個物件，形狀跟拆表之前一模一樣（多了 role 與 tz）。
  // **合併是刻意的**：ui.js 有七十幾處讀 S.profile.xxx，讓它們去分辨哪一欄住在
  // 哪張表，等於把資料庫的形狀洩漏到畫面層，而且拆表的每一次調整都要改兩個檔案。
  //
  // 「有沒有護照」由 passports 那一列決定，跟拆表之前同一個判準：
  // maybeSingle() 沒找到時 data 是 null 而不是報錯。正常情況一定找得到 ——
  // 註冊 trigger 會先建好（見遷移 2026-08-31-profiles-and-role.sql）。拿到 null 只有兩種
  // 可能：這個帳號是 trigger 存在之前建的，或是有人手動刪了那一列。兩者都會讓畫面停在
  // 「填護照資料」頁，而使用者存不進去（passports 沒有 insert policy，補不回來）。
  const me = pf.data || {};
  return {
    profile: pa.data ? {
      id:         user.id,
      name_zh:    me.name_zh    ?? null,
      name_en:    me.name_en    ?? null,
      team:       me.team       ?? null,
      avatar:     me.avatar     ?? null,
      tz:         me.tz         ?? null,
      role:       me.role       ?? null,
      motto:      pa.data.motto,
      issued:     pa.data.issued,
      intro_seen: pa.data.intro_seen
    } : null,
    stamps, entries,
    activities: ac.data || [],
    months: mo.data || [],
    destinations: de.data || [],
    visas
  };
}

// update 不是 insert（spec §5.1）：那一列在註冊時就由 trigger 建好了。
// 沒有邀請碼就沒有 passports 列，前端補不出來 —— 這是刻意的，見 schema.sql 的
// passports_write 註解。所以這裡永遠是改既有的列。
export async function saveProfile(p) {
  const user = await requireUser();

  // 拆表之後這裡是兩次寫入：名字與組別屬於「這個人」，motto 屬於「這本護照」。
  //
  // **這兩次寫入不是原子的，PostgREST 沒有交易可以包。** 老實說出來比假裝沒事好：
  // 第一次成功、第二次失敗的話，名字改了而 motto 沒改。但這個失敗是**看得見的**
  // （throw 上去，畫面會顯示存檔失敗），而且兩次都是冪等的 update，
  // 使用者再按一次儲存就會補上。真正危險的是安靜的不一致，這裡不是那種。
  //
  // **不寫 updated_at。** profiles 的欄位層級 grant 只發了四欄，updated_at 不在裡面；
  // 資料庫有一條 before update 的 trigger 會自己蓋。送了也是白送（會被覆蓋），
  // 而且沒有權限，會直接被擋下來。
  //
  // 不寫 issued：核發日是註冊那天，從這裡寫的話每次改暱稱都會把它改成今天。
  const a = await supabase.from("profiles").update({
    name_zh: p.name_zh, name_en: p.name_en, team: p.team
  }).eq("id", user.id);
  if (a.error) throw a.error;

  const b = await supabase.from("passports").update({
    motto: p.motto,
    updated_at: new Date().toISOString()
  }).eq("id", user.id);
  if (b.error) throw b.error;
}

// 大頭照是「這個人」的，不是「這本護照」的 —— 之後學員也會有大頭照，
// 但學員沒有護照。所以它跟名字一起住在 profiles。
export async function saveAvatar(dataUrl) {
  const user = await requireUser();
  const { error } = await supabase.from("profiles")
    .update({ avatar: dataUrl })     // updated_at 由 trigger 蓋，見 saveProfile
    .eq("id", user.id);
  if (error) throw error;
}

// 記住引導頁看過了。**這是介面狀態，不是護照內容** —— 所以 exportPassport
// 不帶它、importPassport 不碰它、clearAll 不清它（見 spec 2026-08-22 §4.5）。
// 跨帳號還原時，「引導看過沒有」是這個帳號的事，不是備份檔的事。
export async function markIntroSeen() {
  const user = await requireUser();
  const { error } = await supabase.from("passports")
    .update({ intro_seen: true, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) throw error;
}

// 章與心得分兩張表，不是為了正規化，是因為兩者的可見範圍不同（spec §5.1）：
// 章要公開給進度牆看，心得和照片只有本人能讀。混在同一張表的話，進度牆為了讀章
// 就必須讀得到那一列，RLS 沒有「同一列的這幾欄看得到、那幾欄看不到」這種東西。
export async function saveStamp(actId, { date, note, photo }) {
  const user = await requireUser();

  // upsert 而不是 insert：重蓋同一格是允許的（改日期、補心得），
  // 主鍵是 (user_id, act_id)，所以衝突時更新同一列。
  const s = await supabase.from("stamps")
    .upsert({ user_id: user.id, act_id: actId, stamped_on: date }, { onConflict: "user_id,act_id" });
  if (s.error) throw s.error;

  // 章先寫、心得後寫。順序是有意義的：中間斷線的話，結果是「章在、心得空」——
  // 學生看得到自己蓋過，補打一次心得就好。反過來寫的話會變成心得存在資料庫裡
  // 但畫面上那格沒蓋章，學生只會再蓋一次、然後心得被這次的覆蓋掉。
  const e = await supabase.from("entries")
    .upsert({ user_id: user.id, act_id: actId, note: note || "", photo: photo || null },
            { onConflict: "user_id,act_id" });
  if (e.error) throw e.error;
}

export async function removeStamp(actId) {
  const user = await requireUser();
  // 刪的順序跟寫的順序相反：先刪心得再刪章。中間斷線的話結果是「章在、心得沒了」,
  // 跟上面同一個道理 —— 留下看得見的痕跡，比留下看不見的殘留好。
  const e = await supabase.from("entries").delete().eq("user_id", user.id).eq("act_id", actId);
  if (e.error) throw e.error;
  const s = await supabase.from("stamps").delete().eq("user_id", user.id).eq("act_id", actId);
  if (s.error) throw s.error;
}

// 發出入境章：把「已經蓋滿但還沒存下來」的月份寫進 visas。
// on conflict do nothing —— 這張表只准新增不准修改（RLS 也沒有給 update 權限，
// 見 2026-08-26-visas.sql 的檔頭）。「蓋滿的月份城市從此固定」如果只靠前端自律，
// 下一個人寫一行 upsert 就破功而且不會有東西報錯。
export async function issueVisas(rows) {
  if (!rows.length) return;
  const user = await currentUser();
  const r = await supabase.from("visas")
    .upsert(rows.map(x => ({ user_id: user.id, month: x.month, code: x.code })),
            { onConflict: "user_id,month", ignoreDuplicates: true });
  if (r.error) throw r.error;
}

// 清除這個人自己的整本護照（spec §11-10 的「匯出 → 清除 → 匯入還原」）。
// 這個函式當初被加進介面清單，就是為了預防它現在最容易出的錯：計畫的 Task 6
// 只列了六個函式、沒有這一個，照著做的話「清除護照」會留在 localStorage 版本 ——
// 畫面清空、資料庫原封不動、重整後全部回來，而且不會有任何錯誤訊息。
// 那條驗收會通過，但通過的是假的。
//
// **不刪 passports 那一列，只把欄位設回 null。** 這不是風格選擇：schema.sql 刻意
// 沒有給 passports 任何 insert policy，那一列只在註冊時由 trigger 建立一次。
// 刪掉之後前端補不回來，帳號會變成一本永遠填不了的空護照，而且無法自行修復。
// 章與心得則是真的刪除 —— 它們有 insert policy，重蓋就會回來。
export async function clearAll() {
  const user = await requireUser();
  const e = await supabase.from("entries").delete().eq("user_id", user.id);
  if (e.error) throw e.error;
  const s = await supabase.from("stamps").delete().eq("user_id", user.id);
  if (s.error) throw s.error;
  // visas 是護照內容（spec §9.11），跟 stamps／entries 同一批清掉。不是參考資料，
  // 不比照 destinations／activities／months／milestones 那種「全站共用、清人不清它」。
  const v = await supabase.from("visas").delete().eq("user_id", user.id);
  if (v.error) throw v.error;
  // 「清除這本護照」不刪任何一列，只把欄位清空 —— 刪掉的話前端補不回來
  // （profiles 與 passports 都沒有 insert policy），那個帳號會變成一本永遠填不了的空護照。
  // 拆表之後要清兩張：名字與大頭照在 profiles，motto 在 passports。
  //
  // **passports 那幾個舊的名字欄位刻意不清。** 它們在遷移 A 之後就沒有人讀了，
  // 遷移 B 會整欄 drop 掉。現在去寫它們等於在維護一份沒有人看的資料，
  // 而且會讓「這段期間寫入只走 profiles」那條規矩破功。
  const a = await supabase.from("profiles").update({
    name_zh: null, name_en: null, team: null, avatar: null
  }).eq("id", user.id);
  if (a.error) throw a.error;

  const p = await supabase.from("passports").update({
    motto: null,
    updated_at: new Date().toISOString()
  }).eq("id", user.id);
  if (p.error) throw p.error;
}

/* ---------- 匯出與匯入（spec §7.4）---------- */
// 免費方案沒有自動備份，所以這不是加分項。spec 的原話：**不能還原的備份不算備份**。

export const BACKUP_VERSION = 1;

export async function exportPassport() {
  // 刻意重查一次而不是用畫面上的 S：備份要備的是資料庫裡真正有的東西。
  // 畫面可能因為某次儲存失敗而跟資料庫不一致，那時候匯出 S 會把「看起來有」的
  // 東西寫進備份檔，而那個檔案還原回去會少東西 —— 備份檔說謊比沒有備份更糟。
  const all = await loadAll();
  if (!all.profile) throw new Error("還沒有護照可以匯出。");
  return {
    version: BACKUP_VERSION,          // 供日後格式變更判斷（spec §7.4）
    exported_at: new Date().toISOString(),
    passport_no: passportNo(all.profile.id),
    profile: {
      name_zh: all.profile.name_zh, name_en: all.profile.name_en,
      team: all.profile.team, motto: all.profile.motto,
      avatar: all.profile.avatar, issued: all.profile.issued
    },
    // 章與心得合在一起，一個檔案就是完整備份，不需要 zip 函式庫。
    stamps: Object.keys(all.stamps).map(id => ({
      act_id: id,
      stamped_on: all.stamps[id].date,
      note: (all.entries[id] && all.entries[id].note) || "",
      photo: (all.entries[id] && all.entries[id].photo) || null
    })),
    // visas 是護照內容（spec §9.11），備份要跟著走，否則還原之後城市可能全換一批 ——
    // 正是這張表存在要防的事。跟 stamps 同一個模式：物件攤平成陣列。
    visas: Object.keys(all.visas).map(month => ({
      month: Number(month),
      code: all.visas[month]
    }))
  };
}

// 格式不對時給人話，不丟 JSON parse 錯誤（spec §7.4）。
// 三種壞法分別給三句不同的話，因為使用者的下一步不一樣：
// 讀不出來 → 換一個檔；是 JSON 但不是備份 → 選對檔；版本太新 → 找人幫忙。
export function parseBackup(text) {
  let j;
  try { j = JSON.parse(text); }
  catch (e) { throw new Error("這個檔案讀不出來，可能不是護照備份檔，或是在傳送過程中壞掉了。"); }
  if (!j || typeof j !== "object" || !Array.isArray(j.stamps) || !j.profile) {
    throw new Error("這是一個 JSON 檔，但不是護照備份檔。請選你從護照按「匯出備份」下載的那個檔案。");
  }
  if (Number(j.version) > BACKUP_VERSION) {
    throw new Error("這個備份檔來自比較新的版本，這個網站讀不了。請寄信到 beyondtaiwan2020@gmail.com。");
  }
  return j;
}

// 寫入**目前登入的帳號**，不是備份檔裡記的那個 uuid —— 換帳號也要能還原（spec §7.4）。
//
// ★ 寫入順序：先寫，後刪。這跟直覺相反（覆蓋不是應該先清空嗎），但直覺的順序有一個
//   會吃掉資料的破綻：先刪再寫的話，寫入失敗時使用者的章已經沒了，而呼叫端能說的只有
//   「還原失敗」。最可能失敗的正是寫入那一步 —— 照片是 base64，那包 payload 是整個
//   程式裡最大的一包，手機網路上斷在那裡完全不稀奇。
//   先寫後刪之後，兩種失敗都不會吃資料：
//     寫入階段失敗 → 一列都還沒刪，舊資料原封不動，呼叫端說「資料沒有被改動」是真的
//     刪除階段失敗 → 使用者拿到的是兩邊聯集（等同合併模式的結果），沒有任何東西不見
//   換句話說，這個順序讓「最糟的情況」從「資料沒了」降級成「多了幾格」。
export async function importPassport(backup, mode) {
  const user = await requireUser();

  const rows = backup.stamps.filter(s => s.act_id && s.stamped_on);
  // visas 跟 stamps 同一個模式（spec §9.11）：舊備份檔沒有這個欄位，
  // backup.visas || [] 讓還原舊檔照樣能動，只是不帶城市回來。
  const visaRows = (backup.visas || []).filter(v => v.month != null && v.code);

  if (rows.length) {
    const s = await supabase.from("stamps").upsert(
      rows.map(r => ({ user_id: user.id, act_id: r.act_id, stamped_on: r.stamped_on })),
      { onConflict: "user_id,act_id" });
    if (s.error) throw s.error;

    const e = await supabase.from("entries").upsert(
      rows.map(r => ({ user_id: user.id, act_id: r.act_id, note: r.note || "", photo: r.photo || null })),
      { onConflict: "user_id,act_id" });
    if (e.error) throw e.error;
  }

  if (visaRows.length) {
    // ignoreDuplicates: true 不可省，理由跟 issueVisas 一樣：visas 沒有 UPDATE 權限，
    // 少了這個旗標，還原到已經有紀錄的月份會變成 UPDATE，被資料庫拒絕。
    const v = await supabase.from("visas").upsert(
      visaRows.map(r => ({ user_id: user.id, month: r.month, code: r.code })),
      { onConflict: "user_id,month", ignoreDuplicates: true });
    if (v.error) throw v.error;
  }

  if (mode === "overwrite") {
    // 覆蓋 = 最後的狀態要跟備份檔一模一樣，所以刪掉備份檔裡沒有的那些格。
    // 備份檔一個章都沒有時就是全刪 —— 這時候不能用 not.in.()，空的括號 PostgREST 不吃。
    const keep = rows.map(r => r.act_id);
    let ds = supabase.from("stamps").delete().eq("user_id", user.id);
    let de = supabase.from("entries").delete().eq("user_id", user.id);
    if (keep.length) {
      const list = "(" + keep.join(",") + ")";
      ds = ds.not("act_id", "in", list);
      de = de.not("act_id", "in", list);
    }
    const re = await de; if (re.error) throw re.error;
    const rs = await ds; if (rs.error) throw rs.error;

    // 同一套邏輯套在 visas 上：覆蓋之後留著的月份要跟備份檔一致。
    const keepMonths = visaRows.map(r => r.month);
    let dv = supabase.from("visas").delete().eq("user_id", user.id);
    if (keepMonths.length) {
      const list = "(" + keepMonths.join(",") + ")";
      dv = dv.not("month", "in", list);
    }
    const rv = await dv; if (rv.error) throw rv.error;
  }

  // issued 不還原 —— 核發日屬於這個帳號，不屬於備份檔。跨帳號還原時尤其明顯：
  // B 的護照上印 A 的核發日是錯的，那一天 B 根本還沒有護照。
  // 拆表之後同樣是兩張表。備份檔的格式沒有變（version 1 仍然是同一組欄位）——
  // 拆的是資料庫，不是備份格式，舊的備份檔照樣還原得回來。
  const p = backup.profile || {};
  const ua = await supabase.from("profiles").update({
    name_zh: p.name_zh, name_en: p.name_en, team: p.team, avatar: p.avatar
  }).eq("id", user.id);
  if (ua.error) throw ua.error;

  const up = await supabase.from("passports").update({
    motto: p.motto,
    updated_at: new Date().toISOString()
  }).eq("id", user.id);
  if (up.error) throw up.error;

  return { written: rows.length };
}

// 全體進度牆（spec §7.2）。一次查詢把所有人與各自的章一起帶回來。
//
// `stamps(act_id, stamped_on)` 是 PostgREST 的內嵌關聯查詢，靠 stamps.user_id → profiles.id
// 這條 FK 自動推導（2026-08-31 拆表時外鍵從 passports 改指 profiles，這句查詢跟著改）。
// **不要**改成先查 profiles 再逐人查 stamps —— 三十個人就是三十一次往返，
// 在手機網路上是好幾秒。
//
// ★ 這個 select 清單裡**沒有** entries，這是這面牆最重要的一件事（spec §11-1）。
//   心得與活動照片是幹部私下寫的，其中有未成年人。但要講清楚：**真正擋住外洩的不是
//   這行 select，是 entries_read 那條 RLS 政策**（schema.sql，only auth.uid() = user_id）。
//   就算有人在這裡加上 entries(...)，資料庫也只會回他自己的那幾列。
//   這裡不寫 entries 是「不要求本來就不該要的東西」，不是安全機制 ——
//   把它當成安全機制的話，下一個人會以為改這行就能改變可見範圍。
//
// avatar 要：大頭照本來就是公開的，註冊與蓋章兩個畫面都明說了會出現在牆上。
// motto 不要：那是護照內頁的東西，牆上不顯示，就不要拉回來。
export async function loadWall() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name_zh, name_en, team, avatar, stamps(act_id, stamped_on)")
    .eq("role", "cadre");
  if (error) throw error;
  // .eq("role","cadre") 是「少傳一點資料回來」，**不是**擋住學員的機制 ——
  // 真正擋住的是 profiles_read 那條 RLS（學員只讀得到自己那一列）。
  // 拿掉這一行，資料庫仍然只會回幹部；這一層與那一層不要搞混（同 data.js 檔頭）。
  //
  // 還沒填資料的人不上牆。註冊完到填完護照之間會有一段空窗，那段時間他在
  // profiles 裡已經有一列（trigger 建的）但名字是 null —— 牆上出現一個沒有名字的人
  // 只會讓大家問「那是誰」。等他填完自己就會出現。
  return (data || []).filter(p => p.name_zh || p.name_en);
}

// 護照號碼由 id 決定，固定不變。Task 6 之後 id 是 auth uuid，
// 所以護照號碼從此穩定，不會因為重新登入而變（spec §7.2）。
export function passportNo(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return "BT" + String(h % 10000000).padStart(7, "0");
}
