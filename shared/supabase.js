// 平台的 Supabase 連線。**整個站只有這一個 client**，
// beyondtaiwannpo.com 底下每一個功能（護照、之後的時間看板、/app/）都從這裡拿。
//
// 2026-08-31（階段 2）：這個檔案由 passport/src/config.js 與 passport/src/data.js
// 上面那段建 client 的程式碼合併而來，內容沒有改，只是換了位置。
// config.js 已經刪掉——真相來源只留一處。
//
// 為什麼所有功能共用一個 client：登入狀態存在 localStorage，同一個來源底下共用。
// 每個功能各自 createClient 也會共用同一份 session，但那樣會有好幾個各自訂閱
// auth 事件的 client，而「哪一個先收到 token 更新」是沒有保證的。一個就好。

// publishable key 出現在這裡是正常的，不是外洩 —— 真正的防線是資料庫的 RLS。
// 詳見 README「為什麼金鑰可以放在原始碼裡」。
// 絕對不要把 sb_secret_ 開頭的金鑰放進這個檔案或這個 repo 的任何地方。
//
// 換專案時到後台 Project Settings → API Keys 複製新值蓋掉下面兩行
// （URL 形如 https://xxxxxxxx.supabase.co，key 以 sb_publishable_ 開頭）。
// 後台若只看得到 legacy 的 anon key，先在同一頁啟用／建立新版金鑰再回來（spec §4.1）。
// 填錯或改回佔位值時整站不會白畫面，會停在登入頁顯示「現在連不上資料庫」（見 shared/auth.js）。

import { createClient } from "../vendor/supabase-js.js";

export const SUPABASE_URL = "https://norjaglyaotzewxavmhv.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Zizio16gUuM97qjhtD4Qaw_Sb_GKkyx";


// createClient 會對格式不對的網址（少了 https://、多了空白之類）當場 throw
// 「Invalid supabaseUrl」。這裡是 module scope，throw 出去就是 data.js 匯入失敗、
// main.js 跟著匯入失敗、整頁全白，一句話都沒有 —— 直接違反 spec §8.1「連不上資料庫時
// 前端不得空白」。而下一步正好是人手動把網址貼進 config.js，打錯的機率不低，所以擋起來。
let client = null;
try {
  client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
} catch (e) {
  // 給部署的人看的線索留在 console；學生看到的是 configMessage() 那句翻譯過的中文。
  console.error("shared/supabase.js 的 SUPABASE_URL 或 SUPABASE_PUBLISHABLE_KEY 格式不對：", e);
}
export const supabase = client;
