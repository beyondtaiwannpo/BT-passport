// Supabase 連線設定。換專案時只改這個檔案。
// publishable key 出現在這裡是正常的，不是外洩 —— 真正的防線是資料庫的 RLS。
// 詳見 README「為什麼金鑰可以放在原始碼裡」。
// 絕對不要把 sb_secret_ 開頭的金鑰放進這個檔案或這個 repo 的任何地方。
//
// ↓↓↓ 下面兩行現在是假的佔位字串，還沒有接上任何專案。整站在換掉之前都連不上資料庫，
// 畫面會停在登入頁並顯示「現在連不上資料庫」。到後台 Project Settings → API Keys
// 複製真值貼上來（URL 形如 https://xxxxxxxx.supabase.co，key 以 sb_publishable_ 開頭）。
// 後台若只看得到 legacy 的 anon key，先在同一頁啟用／建立新版金鑰再回來（spec §4.1）。
export const SUPABASE_URL = "https://REPLACE-ME-PROJECT-REF.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_REPLACE_ME";
