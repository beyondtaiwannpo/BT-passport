// Supabase 連線設定。換專案時只改這個檔案。
// publishable key 出現在這裡是正常的，不是外洩 —— 真正的防線是資料庫的 RLS。
// 詳見 README「為什麼金鑰可以放在原始碼裡」。
// 絕對不要把 sb_secret_ 開頭的金鑰放進這個檔案或這個 repo 的任何地方。
//
// ↓↓↓ 下面兩行已經是真的專案（2026-08-17 由專案負責人填入，第一輪 probe 就是用它跑的）。
// 換專案時到後台 Project Settings → API Keys 複製新值蓋掉這兩行
// （URL 形如 https://xxxxxxxx.supabase.co，key 以 sb_publishable_ 開頭）。
// 後台若只看得到 legacy 的 anon key，先在同一頁啟用／建立新版金鑰再回來（spec §4.1）。
// 填錯或改回佔位值時整站不會白畫面，會停在登入頁顯示「現在連不上資料庫」（見 data.js）。
export const SUPABASE_URL = "https://norjaglyaotzewxavmhv.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Zizio16gUuM97qjhtD4Qaw_Sb_GKkyx";
