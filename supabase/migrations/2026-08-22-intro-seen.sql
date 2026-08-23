-- BT Passport 遷移：passports 加一個「引導頁看過沒有」的旗標
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。跑完不用重開站台。
--
-- ---------- 這支會改什麼 ----------
-- 一件事：passports 多一個 intro_seen 欄位，預設 false。其他什麼都不動。
--
-- ---------- 為什麼要有它 ----------
-- 第一次核發護照之後要擋一頁引導（三張卡介紹聚會／題目／鏡頭），看完就不再出現。
-- 「看過沒有」必須跟著帳號走而不是跟著瀏覽器走 —— 換一台裝置登入時，
-- 已經用了半年的人不該再被擋一次。所以它在資料庫裡，不在 localStorage。
--
-- ---------- 幾件要知道的事 ----------
-- 1. default false 會讓**現有的護照也看到一次引導頁**。這是想要的行為，
--    正好拿來驗收。
-- 2. RLS 不用動：passports_write 是列層級的 auth.uid() = id，涵蓋新欄位；
--    grant update on passports 是表層級的，不需要補欄位權限。
-- 3. passports_read 是 using (true)，所以這個欄位對任何登入者可讀。
--    它是一個引導旗標不是私密資料，可以接受。loadWall 只 select 指定欄位，
--    不會把它帶到進度牆上。
-- 4. not null + default false：前端的 clearAll() 是逐欄列名把欄位設成 null，
--    不會誤觸這一欄。

alter table passports
  add column if not exists intro_seen boolean not null default false;
