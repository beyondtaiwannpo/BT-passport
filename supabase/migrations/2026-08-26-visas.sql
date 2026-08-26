-- 入境章的城市：蓋滿那個月的時候存下來，從此不動。
-- 2026-08-26。使用者的裁定，理由值得完整記下來：
--
--   「城市不要即時算。這本護照的意義是『我到過哪裡』，城市會變的話那句話就不成立。
--     而且我們一定會加城市 —— Lucy 在 gap year 明年會定下來、明年新幹部在別的學校、
--     有人交換去別的國家。不是『哪天可能』，是每年都會。」
--
-- 原本的設計是用 uuid 當種子即時洗牌，代價是池子一動、每個人剩下的城市全部重排，
-- 包含已經蓋過章的月份。那個代價不是一條 README 規則管得住的。
--
-- ── 這張表為什麼沒有 UPDATE policy，也沒有 update 的 grant ──
--
-- **那不是漏寫，是這張表的重點。** 「蓋滿的月份城市從此固定」如果只靠前端自律，
-- 下一個人寫一行 upsert 就破功了，而且不會有任何東西報錯。沒有 UPDATE 權限的話，
-- 資料庫自己會擋。要改一列只能先 delete 再 insert —— 那是刻意讓它變得顯眼。
--
-- ── 為什麼只存 code，不存日期 ──
--
-- 章上的日期是該月三格 stamped_on 的最大值，而使用者可以隨時回去改某一格的日期。
-- 存下來的話兩邊會不同步，而且是安靜地不同步。城市**算不出來**（那正是這張表存在的
-- 理由），日期**算得出來**，所以只存算不出來的那一個。
--
-- ── code 的外鍵是刻意的 ──
--
-- 有人用到的城市就刪不掉，資料庫會擋。這讓「不要刪 destinations」從一條 README 規則
-- 變成一個約束。反過來，**新增** destinations 現在是安全的：已經存下來的 visa 不受
-- 池子變動影響，這正是使用者要的（每年都會加城市）。
--
-- 這段 SQL 可以重複執行。它不會新增、修改或刪除 months、activities、milestones、
-- destinations、passports、stamps、entries 的任何一列。

create table if not exists visas (
  user_id    uuid not null references auth.users on delete cascade,
  month      int  not null check (month between 1 and 12),
  code       text not null references destinations(code),
  created_at timestamptz not null default now(),
  primary key (user_id, month)
);

alter table visas enable row level security;

-- 讀取收成自己的。stamps 的讀取是 true 因為進度牆要跨帳號看別人的進度，
-- 但沒有任何畫面需要看別人的城市 —— 最小權限，之後真的要開再說。
drop policy if exists visas_read on visas;
create policy visas_read on visas
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists visas_insert on visas;
create policy visas_insert on visas
  for insert to authenticated with check (auth.uid() = user_id);

-- delete 要開：「清除這本護照」與「匯入還原」的取代模式都需要它。
-- **update 不開**，理由見檔頭。
drop policy if exists visas_delete on visas;
create policy visas_delete on visas
  for delete to authenticated using (auth.uid() = user_id);

-- 預設的 grant 包含 TRUNCATE，而 RLS 管不到 TRUNCATE，所以先 revoke 再 grant。
revoke all on visas from anon, authenticated;
grant select, insert, delete on visas to authenticated;

-- ---------- 確認 ----------
select
  (select count(*) from pg_policies where schemaname='public' and tablename='visas')            as 政策數,
  (select count(*) from pg_policies where schemaname='public' and tablename='visas'
     and cmd='UPDATE')                                                                          as 不該存在的update政策,
  (select count(*) from information_schema.role_table_grants
     where table_name='visas' and grantee='authenticated' and privilege_type='UPDATE')           as 不該存在的update權限,
  (select count(*) from visas)                                                                   as 已發出的入境章;
