-- BT Passport 遷移：months 的 theme_zh 從月份主題改成時刻
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。跑完不用重開站台，
-- 下一個打開月份頁的人就看到新的時刻。
--
-- ---------- 這支會改什麼 ----------
-- 一件事：months 的 11 列，theme_zh 從月份主題（「開學」「換季」…）
-- 換成時刻（07:00、08:00…），theme_en 全部清空成空字串。
-- 其他欄位（seq、month）不動，activities 表完全不動。
--
-- ---------- 為什麼要改 ----------
-- 版面上月份頁右上角改成只顯示一個時刻數字，不再有英文副標
-- （見 spec 2026-08-22 §5）。theme_zh 這個欄位名稱沒有改，
-- 但它現在放的內容是時刻，不是主題文字。
--
-- 08:40 與 23:50 刻意不是整點：一整排整點看起來像時刻表，
-- 有兩個零頭才像真的一天；23:50 差十分鐘午夜，護照在那裡蓋滿。
-- 這是內容決定，不是打字錯誤，**不要順手改成整點**。
--
-- ---------- 跟其他檔案的關係 ----------
-- activities.json 與 supabase/seed.sql 已經同步改成同一批值
-- （activities.json 是人類可讀原稿，執行期不再被讀取；seed.sql 是
-- 「第一次灌資料」用的腳本）。這支遷移是給**已經有真實資料的資料庫**用的：
-- 重跑 seed.sql 的 on conflict 也會把 theme_zh/theme_en 更新到同樣的值，
-- 但 seed.sql 同時會 insert activities 那一大段，如果只是想更新既有資料庫的
-- months、不想動 activities，跑這支比較小、比較好核對。
--
-- ---------- 對已經有真實資料的資料庫安不安全 ----------
-- 安全。這支只 update months 的 theme_zh / theme_en 兩個欄位，
-- 用 seq 一一對應，不會新增、刪除任何一列，也不會動到 activities、
-- passports、stamps、entries、invite_codes。可以重複執行，
-- 重跑只是把同樣的值再寫一次。
--
-- ---------- 跑完想確認有沒有生效 ----------
-- select seq, month, theme_zh, theme_en from months order by seq;
-- 應該看到 theme_zh 是 07:00 ~ 23:50 這 11 個時刻、theme_en 全部是空字串。

update months as m set
  theme_zh = v.zh,
  theme_en = ''
from (values
  (1,  '07:00'), (2,  '08:00'), (3,  '08:40'), (4,  '10:00'),
  (5,  '12:30'), (6,  '14:00'), (7,  '16:00'), (8,  '18:00'),
  (9,  '19:30'), (10, '21:00'), (11, '23:50')
) as v(seq, zh)
where m.seq = v.seq;
