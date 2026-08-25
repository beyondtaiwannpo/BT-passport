-- BT Passport schema
-- 用法：整份貼進 Supabase SQL Editor 執行。可以重複執行，重跑不會弄壞已經有的資料。
--
-- 但「可以重複執行」只保證資料安全，不保證結構會更新。這裡的
-- create table if not exists，如果那張表已經存在，就整段跳過，
-- 不會比對、也不會補上新舊差異。所以如果你改了這個檔案裡的某個欄位、
-- 型別或限制，然後重貼進去重跑，資料庫會維持原樣、不會報錯也不會提醒你——
-- 你會以為改好了，其實完全沒生效。
-- （create policy 跟 create or replace function 不在此限，這兩種重跑真的會更新，
-- 因為它們是用 drop policy if exists / create or replace 寫的。只有表跟欄位的結構會被跳過。）
-- 已經有真實資料的資料庫要改結構，請另外寫一支針對那個改動的 alter table 遷移，
-- 不要靠改這個檔案再重跑。
--
-- 這個檔案只建「結構」與「權限」。活動文案在 seed.sql，
-- 之後課程組要改文案，是去 Supabase 後台直接編輯 activities 表，不用再碰 SQL。
--
-- 執行順序：schema.sql → seed.sql → rls-test.sql

-- ---------- 表 ----------

-- 月份主題。學年制 9 月到隔年 7 月，所以 seq（學年順序）跟 month（月份數字）是兩件事，
-- 月份頁的排序一律用 seq，不要用 month 排，不然 1 月會跑到最前面。
create table if not exists months (
  seq      int primary key,          -- 學年順序 1-11
  month    int not null,             -- 1-12
  theme_zh text not null,
  theme_en text not null
);

-- 活動定義。id 用 '09A' 這種人看得懂又穩定的字串，不用流水號 ——
-- stamps 與 entries 都靠它對應，改掉會讓已經蓋過的章對不到格子。
create table if not exists activities (
  id          text primary key,      -- '09A'，穩定不變
  month       int  not null,
  seq         int  not null,
  category    text not null check (category in ('gather','prompt','frame')),
  title_zh    text not null,
  title_en    text not null,
  description text,
  needs_host  boolean default false,
  callback_to text references activities,   -- 07B → 09B，回望機制看這個欄位
  active      boolean default true   -- 已經有人蓋過的活動請停用，不要刪
);

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

-- 邀請碼。note 是寫給人看的（這組發給誰），不會出現在任何畫面上。
create table if not exists invite_codes (
  code       text primary key,
  uses_left  int not null default 1,
  note       text,
  created_at timestamptz default now()
);

-- 邀請碼的比對不分大小寫、也不分前後空白（見最下面的註冊 trigger），
-- 所以「只差在大小寫或前後空白」的兩組碼不可以同時存在 ——
-- 那樣的話正規化之後它們長得一模一樣，trigger 那句 update 會一次扣到兩列，
-- 等於一個學生註冊燒掉兩組碼各一次（本機實測過，不是推論）。
-- 這個唯一索引就是用來擋住那種狀態。
-- 索引的是 upper(btrim(code)) 而不是 code 本身，跟 trigger 裡的比對用同一套正規化。
--
-- 如果這一句在既有的資料庫上報 "could not create unique index"，代表裡面已經有撞在
-- 一起的碼了。用這句找出來，決定留哪一組之後再重跑：
--   select upper(btrim(code)), count(*), array_agg(code)
--     from invite_codes group by 1 having count(*) > 1;
create unique index if not exists invite_codes_code_normalized_key
  on invite_codes (upper(btrim(code)));

-- 護照持有人。這一列不是由前端 insert 的，是註冊時由本檔最下面的 trigger 建好，
-- 所以「申請護照」畫面送出的是 update。
create table if not exists passports (
  id         uuid primary key references auth.users on delete cascade,
  name_zh    text,
  name_en    text,
  team       text,
  motto      text,
  avatar     text,                   -- base64 jpeg
  issued     date default current_date,
  -- 第一次核發護照後的引導頁看過沒有。**介面狀態，不是護照內容** ——
  -- 所以它不進匯出的備份檔，importPassport 也不碰它（見 data.js）。
  -- 跟著帳號走而不是跟著瀏覽器走：換裝置登入時老幹部不該再被擋一次引導。
  intro_seen boolean not null default false,
  updated_at timestamptz default now()
);

-- 章。公開資料，進度牆要看得到別人的。
create table if not exists stamps (
  user_id    uuid references passports on delete cascade,
  act_id     text references activities,
  stamped_on date not null,
  created_at timestamptz default now(),
  primary key (user_id, act_id)
);

-- 心得與照片。私人資料，只有本人看得到，見下面的 RLS 段落。
create table if not exists entries (
  user_id uuid references passports on delete cascade,
  act_id  text references activities,
  note    text,
  photo   text,                      -- base64 jpeg，前端壓到 640px / q0.68
  primary key (user_id, act_id)
);

-- ---------- RLS ----------
-- 七張表全部打開 RLS。打開之後「沒有寫到的事情一律不准」，
-- 所以 invite_codes 只要開了 RLS 又不給任何 policy，就等於對所有人關閉。
--
-- 前端拿到的金鑰是公開的，任何人都能自己組 API 請求 ——
-- 隔離只能擋在這一段，不能靠前端不顯示。

alter table months       enable row level security;
alter table activities   enable row level security;
alter table milestones   enable row level security;
alter table invite_codes enable row level security;
alter table passports    enable row level security;
alter table stamps       enable row level security;
alter table entries      enable row level security;

drop policy if exists months_read on months;
create policy months_read on months
  for select to authenticated using (true);

drop policy if exists activities_read on activities;
create policy activities_read on activities
  for select to authenticated using (true);

drop policy if exists milestones_read on milestones;
create policy milestones_read on milestones
  for select to authenticated using (true);
-- 沒有寫入政策，跟 months / activities 一樣：內容由後台維護。

-- invite_codes：故意一條 policy 都不給，等於對所有登入身分關閉。
-- 表層級的權限也要一起收掉，收在下面的 grant 段落。
-- 只有最下面那個 security definer 的 trigger 讀得到這張表。

drop policy if exists passports_read on passports;
create policy passports_read on passports
  for select to authenticated using (true);

drop policy if exists passports_write on passports;
create policy passports_write on passports
  for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);
-- 沒有 insert policy，是刻意的：那一列由註冊 trigger 建立。
-- 也就是說沒有邀請碼就沒有 passports 列，前端沒辦法自己補一張。

drop policy if exists stamps_read on stamps;
create policy stamps_read on stamps
  for select to authenticated using (true);

drop policy if exists stamps_insert on stamps;
create policy stamps_insert on stamps
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists stamps_update on stamps;
create policy stamps_update on stamps
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists stamps_delete on stamps;
create policy stamps_delete on stamps
  for delete to authenticated using (auth.uid() = user_id);

-- entries：這是整個系統唯一真正重要的安全需求。
-- 心得和照片是幹部私下寫的，其中有未成年人；外洩一次就再也沒有人會誠實寫。
-- 所以四種操作全部限本人，讀也一樣 —— 連「查得到但看不到內容」都不行。
drop policy if exists entries_read on entries;
create policy entries_read on entries
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists entries_insert on entries;
create policy entries_insert on entries
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists entries_update on entries;
create policy entries_update on entries
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists entries_delete on entries;
create policy entries_delete on entries
  for delete to authenticated using (auth.uid() = user_id);

-- ---------- 權限（先全部收回，再一項一項發）----------
-- RLS 決定「看得到、動得了哪幾列」，權限決定「這張表准不准碰」，兩層都要對。
--
-- 先 revoke 再 grant，不是多此一舉：Supabase 對 public schema 的新表預設會把
-- ALL 發給 anon 與 authenticated，不收回的話下面那兩行 grant 只是裝飾，
-- 真正生效的是 Supabase 給的那份預設權限。
--
-- 而且 ALL 裡面有 TRUNCATE，**RLS 管不到 TRUNCATE** —— 它不是一列一列刪，
-- 政策條件沒有列可以套。也就是說沒有這段 revoke 的話，任何人（連沒登入的 anon 都算）
-- 只要能對資料庫下 SQL，一句 truncate passports cascade 就能把全部的章與心得清空。
-- PostgREST 沒有 TRUNCATE 這個動詞，所以走 API 打不到，但這一層不該賭在那件事上。
--
-- 收回之後 anon 手上一個權限都不剩。要注意的是「anon 動不了東西」靠的是這件事
-- 加上「每一條 policy 都寫了 to authenticated」——
-- 之後新增 policy 若忘了寫 to authenticated，就等於對未登入的人開門。

revoke all on invite_codes from anon, authenticated;
revoke all on months, activities, milestones, passports, stamps, entries from anon, authenticated;

grant select on months, activities, milestones to authenticated;
grant select, insert, update, delete on passports, stamps, entries to authenticated;

-- ---------- 註冊 trigger ----------
-- Supabase Auth 沒有內建邀請碼機制，免費方案也不打算用 Edge Function。
-- 所以用 DB trigger 擋在註冊這筆交易裡面：驗不過就 raise，整筆註冊連同
-- auth.users 那一列一起回滾。這是免費方案能做到最強的一道，前端繞不過去。

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer                     -- 用函式擁有者的身分跑，才讀得到上面關掉的 invite_codes
set search_path = public, pg_temp    -- 釘死搜尋路徑，別人就沒辦法用同名的暫存表換掉下面的兩張表
as $$
declare v_code text := new.raw_user_meta_data->>'invite';
begin
  -- 檢查與扣減寫成同一句 update ... where uses_left > 0，再用 if not found 判斷。
  -- 分成「先 select 檢查、再 update 扣減」兩句的話，兩個人同時用同一組只剩一次的碼，
  -- 會兩個都通過。這樣寫由資料庫的列鎖擋掉。
  --
  -- 比對**不分大小寫、也不分前後空白**：兩邊都先套 upper(btrim(...)) 再比。
  -- 管理員存 bt2026test，學生打 BT2026TEST 或前後多了空白，都算同一組碼。
  --
  -- 兩邊都要包，缺一不可：
  --   只包右邊（學生打的）→ 管理員存小寫的碼還是對不到。
  --   只包左邊（資料庫存的）→ 學生打小寫還是對不到。
  --
  -- 為什麼正規化全部做在這一行、前端一個字都不改：2026-08-17 出過事，前端會
  -- .toUpperCase() 而這裡是嚴格比對，管理員建的小寫 bt2026test 讓所有學生都註冊失敗。
  -- 那個坑的根源是「正規化被拆在前端和資料庫兩層、各做一半」，所以現在整套都在這裡，
  -- 連 trim 也在這裡。前端輸入框還是會 trim，但那只是順手，正確性不靠它。
  -- **不要回頭在前端加任何大小寫轉換。**
  --
  -- 上面 invite_codes 那個 upper(btrim(code)) 的唯一索引是這一行的搭檔：
  -- 沒有它的話，兩組只差在大小寫的碼會被這句 update 一次扣掉兩列。
  --
  -- v_code 是 null（metadata 沒填 invite）時 upper(btrim(null)) 還是 null，
  -- 對不到任何列，會走下面的 raise。
  update invite_codes set uses_left = uses_left - 1
   where upper(btrim(code)) = upper(btrim(v_code)) and uses_left > 0;
  if not found then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;

  insert into passports(id) values (new.id);
  return new;
end $$;

-- 這個函式只該由 trigger 呼叫，沒有人需要能直接執行它。
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 注意：這個 trigger 對「每一筆」進到 auth.users 的列都會開火，
-- 包含你在 Supabase 後台按 Add user 手動開的帳號、以及用 Admin API 建的帳號。
-- 所以管理者手動開帳號時，metadata 也要填一組還有次數的邀請碼
-- （User Metadata 填 {"invite":"某組碼"}），不然那筆會直接失敗。
-- 這是規格要的行為（spec §6）：沒有邀請碼就沒有護照，沒有例外通道。
