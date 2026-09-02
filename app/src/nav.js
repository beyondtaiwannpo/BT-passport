// 登入之後要送人去哪裡。**這是一張白名單，不是一個網址參數。**
//
// 沒登入的人直接打 /passport/ 會被導到 /app/?next=passport，登入成功之後送回去。
// 少了這個，他要自己再找一次那一頁；書籤與別人貼的連結都會斷在登入頁。
//
// 為什麼是白名單，而不是「檢查這個網址是不是同源」：
// 那種檢查每一種寫法都被繞過去過 —— //evil.com、/\evil.com、%2f%2fevil.com、
// 反斜線與正斜線在不同瀏覽器裡解析還不一樣。我們實際上只有一個目的地，
// 所以參數只當一把鑰匙用：**它的值永遠不會被當成網址**，
// 對不到表就回 null，畫面停在 /app/。
//
// 要加新的目的地就在這張表加一列，不要改成「如果是相對路徑就放行」。
export const NEXT = { passport: "../passport/" };

// search 是 location.search 那種字串（"?next=passport"）。
// 抽成一支沒有副作用的模組是為了測得到：main.js 一 import 就會跑 boot()，
// 而這一段正是最需要拿惡意輸入去打的地方。
export function resolveNext(search) {
  const k = new URLSearchParams(search || "").get("next");
  return (k && Object.prototype.hasOwnProperty.call(NEXT, k)) ? NEXT[k] : null;
}
