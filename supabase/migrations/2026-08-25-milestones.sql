-- BT Passport 遷移：新增里程碑（milestones）
-- 2026-08-27：這個功能已經從前端移除，這個檔案是歷史紀錄，
-- 表與資料仍在資料庫裡（見 supabase/schema.sql 裡 milestones 表上方的註解）。
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重複執行 ——
-- create table if not exists 對已存在的表整段跳過，insert 那段用
-- on conflict (id) do update，重跑只是把同樣的值再寫一次。
--
-- ---------- 這支會改什麼 ----------
-- 新增一張表 milestones（蓋到第 N 個章時解鎖的東西），打開它的 RLS 與
-- 對應的 select policy，把它加進 schema.sql 既有的 revoke / grant 那兩行，
-- 最後塞四筆暫定資料。不動 months、activities、invite_codes、passports、
-- stamps、entries 任何一張既有的表。
--
-- ---------- 為什麼要改 ----------
-- 新功能「里程碑」。獎勵是護照本身長出東西，不是外部誘因 ——
-- 有幾格（11B 最想放棄的那一刻、06B 我沒做到的事）需要人誠實面對自己，
-- 背後有獎品的話那幾格會被隨便寫掉。這句話也寫在下面 create table 的註解裡，
-- 因為它是這張表存在的理由，不是可有可無的背景。
--
-- **刻意不開「誰達成了什麼」的表**：達成與否用 stamps 的 count 即時算。
-- 存重複的狀態會有不同步問題，而且會多一張帶使用者資料的表要管 RLS。
--
-- ---------- 門檻與文案是暫定值 ----------
-- 下面 insert 的四筆資料：threshold 5 / 11 / 22 / 33 是暫定門檻，
-- title_zh / title_en / description 全部是佔位字（【待補文案】/ TBD）。
-- 兩者之後都會改 —— 改的方式是直接去 Supabase 後台編輯 milestones 表，
-- 或是重跑這支遷移（on conflict do update 會覆蓋成新值），不需要再寫程式。
--
-- ---------- 跟其他檔案的關係 ----------
-- 這支等同於把 supabase/schema.sql 這一輪新增的段落（milestones 表、
-- 它的 RLS、policy、revoke/grant 更新）抽出來給**已經有真實資料的資料庫**用。
-- schema.sql 本身也已經同步改好，下一個從零建資料庫的人直接貼 schema.sql
-- 就會包含這張表，不需要另外跑這支；這支是給不想整份重貼 schema.sql 的人。
--
-- 這一輪前端（src/data.js、src/ui.js）已經在讀 milestones 這張表，
-- 讀不到時前端會把它當「沒有里程碑」處理、不影響護照其餘部分
-- （見 src/data.js 的 firstError 註解）—— 所以這支遷移可以晚於前端部署，
-- 部署順序沒有先後要求。
--
-- ---------- 對已經有真實資料的資料庫安不安全 ----------
-- 安全。milestones 是全新的表，create table if not exists 不會動到任何
-- 既有的表或既有的列。RLS 與 policy 只套用在這張新表上。
-- 唯一改到既有東西的是 schema.sql 裡那兩行 revoke / grant，這支遷移把它們
-- 重新下一次、加上 milestones —— 對 months / activities 既有的權限沒有影響，
-- 只是把同樣的 select 權限也發給 milestones。
--
-- ---------- 跑完想確認有沒有生效 ----------
-- select id, threshold, title_zh, active from milestones order by threshold;
-- 應該看到 m05 / m11 / m22 / m33 四列，threshold 分別是 5 / 11 / 22 / 33。

-- ---------- 表 ----------

-- 里程碑。蓋到第 N 個章時解鎖的東西。
-- **獎勵是護照本身長出東西，不是抽獎也不是實體獎品。** 這不是省錢，是設計：
-- 有幾格（11B 最想放棄的那一刻、06B 我沒做到的事）需要人誠實面對自己，
-- 背後有獎品的話那幾格會被隨便寫掉。
--
-- **刻意沒有「誰達成了什麼」的表**：達成與否用 stamps 的 count 即時算就好。
-- 存一份重複的狀態會有不同步問題，而且會多一張帶使用者資料的表要管 RLS。
create table if not exists milestones (
  id          text primary key,      -- 'm05'，人看得懂又穩定
  threshold   int  not null,         -- 需要幾個章
  title_zh    text not null,
  title_en    text not null,
  description text,
  active      boolean default true   -- 已經有人達成過的請停用，不要刪
);

-- ---------- RLS ----------

alter table milestones enable row level security;

drop policy if exists milestones_read on milestones;
create policy milestones_read on milestones
  for select to authenticated using (true);
-- 沒有寫入政策，跟 months / activities 一樣：內容由後台維護。

-- ---------- 權限 ----------
-- 跟 schema.sql 同一套先 revoke 再 grant 的理由：Supabase 對 public schema
-- 的新表預設會把 ALL 發給 anon 與 authenticated，不收回的話下面的 grant
-- 只是裝飾。這兩行直接取代 schema.sql 裡原本那兩行（加上 milestones），
-- 不是另外新增，重跑不會疊出重複的權限。

revoke all on months, activities, milestones, passports, stamps, entries from anon, authenticated;

grant select on months, activities, milestones to authenticated;

-- ---------- 資料：四個暫定門檻 ----------
-- threshold 5 / 11 / 22 / 33 是暫定值，title_zh / title_en / description
-- 全部是佔位字。兩者之後都會改，改法見檔案最上面的說明。
insert into milestones (id, threshold, title_zh, title_en, description) values
  ('m05',  5, '【待補文案】', 'TBD', '【待補文案】'),
  ('m11', 11, '【待補文案】', 'TBD', '【待補文案】'),
  ('m22', 22, '【待補文案】', 'TBD', '【待補文案】'),
  ('m33', 33, '【待補文案】', 'TBD', '【待補文案】')
on conflict (id) do update set
  threshold = excluded.threshold, title_zh = excluded.title_zh,
  title_en = excluded.title_en, description = excluded.description;
