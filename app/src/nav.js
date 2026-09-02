// 登入之後要送人去哪裡。
//
// ── 為什麼是白名單，不是網址參數 ──
// 沒登入的人直接打 /passport/ 會被導到 /app/?next=passport，登入成功之後送回去。
// 少了這個，他要自己再找一次那一頁；書籤與別人在群組貼的連結都會斷在登入頁。
//
// 同源檢查每一種寫法都被繞過去過 —— //evil.com、/\evil.com、%2f%2fevil.com、
// 反斜線與正斜線在不同瀏覽器裡解析還不一樣。我們實際上只有一個目的地，
// 所以參數只當一把鑰匙用：**它的值永遠不會被當成網址**。
// 要加新的目的地就在這張表加一列，不要改成「如果是相對路徑就放行」。
export const NEXT = { passport: "../passport/" };

const KEY = "bt-next";

// search 是 location.search 那種字串（"?next=passport"）。對不到表就回 null。
export function resolveNext(search) {
  const k = new URLSearchParams(search || "").get("next");
  return (k && Object.prototype.hasOwnProperty.call(NEXT, k)) ? NEXT[k] : null;
}

// ── 為什麼要把 next 存起來，而不是只靠網址 ──
//
// 2026-09-02 使用者回報：從 /passport/ 被導來的人，用 email 登入會回到護照，
// 用 Google 登入停在選單。email 那條路 boot() 是在同一頁跑的，網址沒變過；
// Google 那條路瀏覽器離開又回來，next 要一路活過
//   我們的頁面 → supabase-js → GoTrue → Google → GoTrue 的 callback → 我們的頁面
// 這一整串。查證過的部分：我們送出去的 redirect_to **確實**帶著 ?next=passport
// （真的按下去，讀 Google 網址裡的 opparams 看到的）；supabase-js 沒有動它；
// GoTrue 的 /verify 轉回來時保留 query；白名單也接受帶 query 的網址。
// 唯一驗不到的是 GoTrue 的 OAuth callback 那一步 —— 那需要一次真的 Google 登入。
//
// **所以修法是讓那一步不重要。** 離開之前把鑰匙收在 sessionStorage 裡，
// 回來的時候不管網址上還有沒有 next 都拿得到。兩條路變成「因為構造相同所以一致」，
// 不是「因為第三方剛好沒動它所以一致」。
//
// 用 sessionStorage 不用 localStorage：它跟著分頁死掉。localStorage 的話，
// 一個沒走完的登入會把鑰匙留在那裡，三天後他從書籤打開 /app/ 會被莫名其妙
// 丟去護照 —— 那種 bug 沒有人查得出來。
//
// 存的是**鑰匙**（"passport"）不是網址。storage 是使用者能改的地方，
// 存網址等於把「不准把使用者的值當網址用」那條規矩從前門關掉、後門打開。

// 每一次碰 storage 都包 try/catch。Safari 無痕模式與某些「封鎖網站資料」的設定
// 會讓 sessionStorage 直接 throw —— 沒包住的話，**Google 那顆按鈕會整個壞掉**，
// 而壞的方式是按下去沒有反應。記不住要去哪裡是小事，登不進去不是。
function put(storage, v) { try { storage && storage.setItem(KEY, v); } catch (e) {} }
function take(storage) {
  try {
    if (!storage) return null;
    const v = storage.getItem(KEY);
    storage.removeItem(KEY);
    return v;
  } catch (e) { return null; }
}

// 離開去 Google 之前呼叫。只收白名單裡的鑰匙，別的一律不存。
export function stashNext(search, storage) {
  const k = new URLSearchParams(search || "").get("next");
  if (k && Object.prototype.hasOwnProperty.call(NEXT, k)) put(storage, k);
}

// 回來（或原地登入完）之後呼叫。**它會順手把存起來的鑰匙丟掉**，
// 所以同一次登入只會被送過去一次；之後他自己打 /app/ 就是停在選單。
export function takeNext(search, storage) {
  const stashed = take(storage);
  const fromUrl = resolveNext(search);
  if (fromUrl) return fromUrl;
  return (stashed && Object.prototype.hasOwnProperty.call(NEXT, stashed)) ? NEXT[stashed] : null;
}
