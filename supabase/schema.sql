-- BT Passport schema
-- 用法：整份貼進 Supabase SQL Editor 執行。可以重複執行，重跑不會弄壞已經有的資料。
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

-- 邀請碼。note 是寫給人看的（這組發給誰），不會出現在任何畫面上。
create table if not exists invite_codes (
  code       text primary key,
  uses_left  int not null default 1,
  note       text,
  created_at timestamptz default now()
);

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
-- 六張表全部打開 RLS。打開之後「沒有寫到的事情一律不准」，
-- 所以 invite_codes 只要開了 RLS 又不給任何 policy，就等於對所有人關閉。
--
-- 前端拿到的金鑰是公開的，任何人都能自己組 API 請求 ——
-- 隔離只能擋在這一段，不能靠前端不顯示。

alter table months       enable row level security;
alter table activities   enable row level security;
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

-- invite_codes：故意一條 policy 都不給。
-- 另外連表層級的權限也收掉 —— Supabase 對 public schema 的新表預設會發權限給
-- anon 與 authenticated，不 revoke 的話，雖然 RLS 會擋成 0 列，
-- 但「連查都不給查」比「查得動但回 0 列」少一層可以出錯的地方。
-- 只有最下面那個 security definer 的 trigger 讀得到這張表。
revoke all on invite_codes from anon, authenticated;

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

-- ---------- grant ----------
-- RLS 決定「看得到哪幾列」，grant 決定「這張表准不准碰」，兩層都要對。
-- 只發給 authenticated：沒登入的人（anon）在這個系統裡沒有任何事情可做。

grant select on months, activities to authenticated;
grant select, insert, update, delete on passports, stamps, entries to authenticated;

-- ---------- 註冊 trigger ----------
-- Supabase Auth 沒有內建邀請碼機制，免費方案也不打算用 Edge Function。
-- 所以用 DB trigger 擋在註冊這筆交易裡面：驗不過就 raise，整筆註冊連同
-- auth.users 那一列一起回滾。這是免費方案能做到最強的一道，前端繞不過去。

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer                     -- 用函式擁有者的身分跑，才讀得到上面關掉的 invite_codes
set search_path = public
as $$
declare v_code text := new.raw_user_meta_data->>'invite';
begin
  -- 檢查與扣減寫成同一句 update ... where uses_left > 0，再用 if not found 判斷。
  -- 分成「先 select 檢查、再 update 扣減」兩句的話，兩個人同時用同一組只剩一次的碼，
  -- 會兩個都通過。這樣寫由資料庫的列鎖擋掉。
  update invite_codes set uses_left = uses_left - 1
   where code = v_code and uses_left > 0;
  if not found then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;

  insert into passports(id) values (new.id);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
