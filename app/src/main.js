// /app/ 的邏輯：登入、註冊、忘記密碼、角色升級，以及登入後的選單。
//
// 這個資料夾**不 import passport/ 底下的任何東西**（見 ui.js 檔頭）。
// 資料層直接用 shared/auth.js，不經過 passport/src/data.js ——
// 那一支是護照的資料層，裡面有 loadAll 那一整包護照專用的查詢。
import * as AUTH from "../../shared/auth.js";
// supabase 本體要從 supabase.js 拿，**auth.js 沒有把它轉出去**。
// 寫成 AUTH.supabase 會是 undefined，而且只有在「登入成功之後」那一步才會炸，
// 登入頁本身完全正常 —— 那種錯誤最容易活著上線。
import { supabase } from "../../shared/supabase.js";
import * as UI from "./ui.js";

let S = { user: null, role: null, name: "", authMode: "in", authMsg: "", authEmail: "", down: false };

// 登入之後送他回原本要去的地方。白名單與理由都在 nav.js，
// 抽出去是為了測得到（main.js 一 import 就會跑 boot()）。
import { resolveNext } from "./nav.js";
const nextURL = () => resolveNext(location.search);

const root = () => document.getElementById("bt-root");

function render() {
  const el = root();
  if (!el) return;
  // 連不上要排在最前面：那時候 S.user 是空的，掉到登入頁等於對一個
  // 明明登入著的人說「請登入」（跟護照那邊同一個道理，spec §8.1）。
  if (S.down) { el.innerHTML = UI.downHTML(); return; }
  if (!S.user) { el.innerHTML = UI.authHTML(S.authMode || "in", S.authMsg, S.authEmail); return; }
  if (S.role !== "cadre") { el.innerHTML = UI.notCadreHTML(S.authMsg); return; }
  el.innerHTML = UI.menuHTML(S.name || S.user.email);
}

async function boot() {
  try {
    S.authMsg = AUTH.configMessage();
    const who = await AUTH.currentUserDetailed();
    if (who.offline) { S.down = true; render(); return; }
    S.down = false;
    S.user = who.user;
    if (!S.user) { render(); return; }

    // 只查自己那一列。**不要在這裡查護照的東西** —— 學員讀不到，
    // 而且這一頁不需要知道他蓋了幾個章。
    const { data, error } = await supabase
      .from("profiles").select("role, name_zh, name_en").eq("id", S.user.id).maybeSingle();
    if (error) throw error;
    S.role = data ? data.role : null;
    S.name = data ? (data.name_zh || data.name_en || "") : "";

    // 是幹部而且他本來就是要去某個地方 → 直接送過去，不要讓他多按一次。
    const n = S.role === "cadre" && nextURL();
    if (n) {
      root().innerHTML = `<div class="empty">帶你過去…</div>`;
      // replace 不留下歷史紀錄。用 href 的話，他從護照按上一頁會回到這裡，
      // 而這裡又會立刻把他送回護照 —— 上一頁就變成按不動的。
      location.replace(n);
      return;
    }
    render();
  } catch (e) {
    console.error("/app/ 載入失敗，畫面顯示的是「資料庫休眠中」那一頁。真正的原因：", e);
    S.down = true;
    render();
  }
}

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;

  if (act === "retry") { location.reload(); return; }
  if (act === "switch-auth") { S.authMode = b.dataset.m; S.authMsg = ""; render(); return; }

  if (act === "do-signin" || act === "do-signup") {
    const email = document.getElementById("ae").value.trim();
    const pw = document.getElementById("ap").value;
    // 空的就不要打網路 —— 空不空前端自己看得到，跑一趟只為了讓伺服器
    // 告訴我們這一格是空的（理由與實測見 passport/src/main.js 同一段）。
    if (!email || !pw) { S.authMsg = AUTH.authMessage(null); render(); return; }
    try {
      if (act === "do-signup") await AUTH.signUp(email, pw);
      else await AUTH.signIn(email, pw);
      await boot();
    } catch (err) { S.authMsg = err.message; render(); }
    return;
  }

  if (act === "do-google") {
    S.authMsg = "";
    // 帶著 location.search 回來，不然 ?next=passport 會在 Google 那一趟來回中掉掉，
    // 從護照被導過來的人繞完 Google 之後會停在選單，還要自己再按一次。
    // next 的值永遠只當白名單的鑰匙用，所以它可以被任何人塞任何字進去，不影響安全。
    try { await AUTH.signInWithGoogle(location.origin + location.pathname + location.search); }
    catch (err) { S.authMsg = err.message; render(); }
    // 成功的話瀏覽器已經在往 Google 跳，這裡不要 render()，那會在跳轉前閃一下。
    return;
  }

  if (act === "do-forgot") {
    const email = document.getElementById("fpe").value.trim();
    if (!email) { S.authMsg = AUTH.authMessage(null); render(); return; }
    // 相對路徑算出來，不要寫死線上網址 —— 寫死的話本機測不了。
    const redirectTo = new URL("../reset/", location.href).href;
    try { await AUTH.sendPasswordReset(email, redirectTo); }
    catch (err) { S.authMsg = err.message; render(); return; }
    // 這裡**不分辨**這個 email 有沒有帳號，理由見 ui.js 的 sent 那一段。
    S.authEmail = email; S.authMsg = ""; S.authMode = "sent"; render();
    return;
  }

  // 角色升級。**前端唯一碰得到角色的地方就是這裡，而它只是呼叫那支 RPC**
  //（規格 §3-5 第 4 點：前端不准有任何「設定角色」的路徑）。
  if (act === "do-claim") {
    const code = document.getElementById("ci").value.trim();
    if (!code) { S.authMsg = AUTH.authMessage(null); render(); return; }
    try { await AUTH.claimInvite(code); await boot(); }
    catch (err) { S.authMsg = err.message; render(); }
    return;
  }

  if (act === "signout") {
    await AUTH.signOut();
    S = { user: null, role: null, name: "", authMode: "in", authMsg: "", authEmail: "", down: false };
    render();
    return;
  }
});

boot();
