// 重設密碼頁的狀態機。文案在 index.html 的 <main> 與下面的 VIEW 裡，
// 使用者會重寫那些字 —— 改文案不要動這個檔案的邏輯。
//
// ── 四個狀態，缺一個都會讓使用者卡住 ──
//   checking  剛載入，等 supabase-js 從網址接住 recovery token
//   ready     接住了，可以設新密碼
//   invalid   連結無效或過期（**這個狀態最重要，見下面**）
//   done      改好了
//
// **invalid 那個狀態不是可有可無的。** 重設連結有時效（Supabase 預設 1 小時），
// 而使用者常常是隔天早上才打開信。少了它，畫面會停在「檢查中」或顯示一個
// 送出去必定失敗的表單 —— 他會以為是自己密碼打錯，再試五次，然後放棄。
// 連結過期是**正常會發生的事**，不是例外。
import { supabase } from "../shared/supabase.js";
import { updatePassword, configMessage } from "../shared/auth.js";

const root = () => document.getElementById("root");
const esc = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const shell = inner => `
  <img class="logo" src="../shared/logo.png" alt="Beyond Taiwan">
  ${inner}
  <p class="foot"><a href="../passport/">← 回 BT 護照</a></p>`;

const VIEW = {
  checking: () => shell(`
    <h1>重設密碼</h1>
    <p class="sub">正在確認你的連結…</p>`),

  ready: msg => shell(`
    <h1>設一組新密碼</h1>
    <p class="sub">設好之後就會直接登入，不用再輸入舊密碼。</p>
    ${msg ? `<div class="note">${esc(msg)}</div>` : ""}
    <label><i>新密碼（至少 6 個字）</i>
      <input id="pw" type="password" autocomplete="new-password"></label>
    <button class="btn" id="go">設定新密碼</button>`),

  // 連結壞掉時**不要**只說「連結無效」就停在那裡 —— 那是一條死路。
  // 使用者當下需要的是「下一步做什麼」，所以這裡給出口。
  invalid: msg => shell(`
    <h1>這個連結不能用了</h1>
    <p class="sub">${esc(msg || "重設密碼的連結有時效，通常一小時後就會過期。")}</p>
    <div class="note">重新要一封就好：回到護照的登入頁，用「忘記密碼」再寄一次。
    如果還是不行，寄信到 beyondtaiwan2020@gmail.com，我們直接幫你處理。</div>
    <p><a href="../passport/">回護照登入頁</a></p>`),

  done: () => shell(`
    <h1>改好了</h1>
    <p class="sub">新密碼已經生效，而且你現在已經登入了。</p>
    <p><a href="../passport/">進入 BT 護照 →</a></p>`)
};

let state = "checking";
function render(msg) { root().innerHTML = VIEW[state](msg); }

// hash 或 query 裡的錯誤。Supabase 在連結過期／被用過時會這樣回，
// 而**它不會丟例外**，只是把錯誤放在網址上 —— 不讀的話畫面會停在「檢查中」。
function urlError() {
  const h = new URLSearchParams(location.hash.replace(/^#/, ""));
  const q = new URLSearchParams(location.search);
  const code = h.get("error_code") || q.get("error_code");
  const desc = h.get("error_description") || q.get("error_description");
  if (!code && !desc) return null;
  // otp_expired 是最常見的一種，單獨給一句人話。其餘照 Supabase 給的描述翻成中文語氣。
  if (String(code).includes("expired")) return "這封信裡的連結已經過期了。";
  return desc ? desc.replace(/\+/g, " ") : "這個連結沒辦法使用。";
}

async function boot() {
  render();

  const cfg = configMessage();
  if (cfg) { state = "invalid"; render(cfg); return; }

  const e = urlError();
  if (e) { state = "invalid"; render(e); return; }

  // supabase-js 在 client 建立時就開始處理網址（detectSessionInUrl），
  // 但那是非同步的。onAuthStateChange 會在它處理完之後才觸發，
  // 所以**先掛監聽、再查一次現況**：只做其中一件都會有時機漏掉。
  //   只掛監聽 → 如果它在我們掛之前就處理完了，事件已經過去，永遠不會來
  //   只查現況 → 如果它還沒處理完，我們會查到 null 然後誤判成連結無效
  let settled = false;
  const ok = () => { if (settled) return; settled = true; state = "ready"; render(); };

  supabase.auth.onAuthStateChange((event, session) => {
    if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION")) ok();
  });

  const { data } = await supabase.auth.getUser();
  if (data && data.user) ok();

  // 兩條路都沒接到就是真的沒有 session。給一點餘裕再判定 ——
  // 直接判定的話，網路慢的人會被告知連結無效，而連結其實是好的。
  setTimeout(() => {
    if (settled) return;
    settled = true;
    state = "invalid";
    render("我們沒有從這個連結讀到有效的登入資訊。");
  }, 3000);
}

document.addEventListener("click", async ev => {
  const b = ev.target.closest("#go");
  if (!b) return;
  const pw = document.getElementById("pw").value;
  // 空的或太短就不要打網路 —— 那一趟往返只為了知道前端自己看得到的事。
  // 文案跟 shared/auth.js 的 MSG.shortPw 一致，但這裡是本地判斷，不經過那條路。
  if (!pw || pw.length < 6) { state = "ready"; render("密碼至少要 6 個字。"); return; }
  b.disabled = true;
  try {
    await updatePassword(pw);
    state = "done"; render();
  } catch (err) {
    state = "ready"; render(err.message);
  }
});

boot();
