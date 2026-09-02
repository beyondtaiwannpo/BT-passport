-- 每週時間看板（規格 §4、§5）。階段 8。
--
-- 設計提案與每一個取捨的理由：supabase/2026-09-02-看板資料表設計提案.md
-- 使用者 2026-09-02 核可，含 Q1（做「確認沒變」）、Q2（不併進 profiles）、
-- Q3（表名 availability / availability_meta）。
--
-- ⚠ 這份會建表、開 RLS、發授權、裝 trigger 與一支 security definer 函式。
--    跑之前先讀完，特別是「授權」那一段 —— 政策對但授權漏一欄的話，
--    寫入會靜靜地全部失敗，而 RLS 的驗收會照樣全綠（2026-09-01 的 profiles.team）。

begin;

-- ─────────────────────────────────────────────────────────────────────
-- 1. 格子
-- ─────────────────────────────────────────────────────────────────────
-- weekday / minute 是**這一列的主人自己時區**的星期與時刻（規格 §5-1），
-- 解讀它們要靠 profiles.tz。不存 UTC、不存偏移量 —— 夏令時間會讓偏移量
-- 在一年之中改變，存死了就會錯。
create table if not exists public.availability (
  user_id uuid     not null references public.profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  minute  smallint not null check (minute >= 0 and minute < 1440 and minute % 30 = 0),
  primary key (user_id, weekday, minute)
);

comment on table public.availability is
  '每個人「每週固定有空」的半小時格子。weekday/minute 以該使用者 profiles.tz 的當地時間為準。';
comment on column public.availability.weekday is
  '0 = 星期日，跟 JavaScript 的 Date.getDay() 一致。**不是 ISO 8601 的 1 = 星期一。**
   兩套差一天，而差一天的 bug 在畫面上只會看起來像「這個人的時間怪怪的」。
   看板要顯示成週一到週日是畫面的事，不要在這裡改。';
comment on column public.availability.minute is
  '當地時間的 0–1439 分，半小時對齊（19:00 = 1140）。
   以後要改成 15 分鐘一格只要放寬 % 30，欄位的意思不用變。';

-- **這張表刻意沒有代理主鍵 id。** (user_id, weekday, minute) 本身就是身分，
-- 而且 insert ... on conflict do nothing 因此天然冪等 ——
-- 手滑連點兩下不會變成兩列。

-- ─────────────────────────────────────────────────────────────────────
-- 2. 每人一列的 meta
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.availability_meta (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  updated_at     timestamptz not null default now(),
  notice_seen_at timestamptz
);

comment on column public.availability_meta.updated_at is
  '上次更新每週時間的時刻。看板用它做「超過 30 天標紅」（規格 §4-3 C）。
   **前端寫不到這一欄**，由 trigger 與 confirm_availability_unchanged() 維護 ——
   那個紅色是拿來催人的，寫得動的話一個 bug 或一個不想被催的人就能讓自己永遠是綠的。';
comment on column public.availability_meta.notice_seen_at is
  '看過「你填的每週時間，其他 BT 幹部看得到」那句告知的時刻（規格 §4-5 第 3 點）。
   看板會把三十個人的完整作息表送進每一個幹部的瀏覽器，那是這個功能的形狀，
   而這句告知是它唯一的知情同意。';

-- ─────────────────────────────────────────────────────────────────────
-- 3. RLS：讀和寫兩端都認 cadre
-- ─────────────────────────────────────────────────────────────────────
alter table public.availability      enable row level security;
alter table public.availability_meta enable row level security;

drop policy if exists availability_read   on public.availability;
drop policy if exists availability_insert on public.availability;
drop policy if exists availability_delete on public.availability;

-- 讀：只有登入的幹部。學員與未登入的人一列都讀不到。
create policy availability_read on public.availability
  for select using (public.is_cadre());

-- 寫：只能寫自己的，而且必須是幹部。兩個條件都要，不是只擋讀。
create policy availability_insert on public.availability
  for insert with check (auth.uid() = user_id and public.is_cadre());
create policy availability_delete on public.availability
  for delete using (auth.uid() = user_id and public.is_cadre());

-- **這張表刻意沒有 update 政策。** 除了主鍵沒有別的欄位，「改時間」就是
-- 刪掉舊格子、插入新格子。沒有 update 政策也沒有 update 授權，等於
-- 「改到別人的列」這個 bug class 在這張表上不存在 —— 不是被政策擋住，是不存在。
-- 以後真的加了欄位，update 會直接失敗：大聲壞掉比安靜放行好。

drop policy if exists meta_read   on public.availability_meta;
drop policy if exists meta_insert on public.availability_meta;
drop policy if exists meta_update on public.availability_meta;

create policy meta_read on public.availability_meta
  for select using (public.is_cadre());
create policy meta_insert on public.availability_meta
  for insert with check (auth.uid() = user_id and public.is_cadre());
create policy meta_update on public.availability_meta
  for update using (auth.uid() = user_id and public.is_cadre())
              with check (auth.uid() = user_id and public.is_cadre());

-- ─────────────────────────────────────────────────────────────────────
-- 4. 授權
-- ─────────────────────────────────────────────────────────────────────
-- ⚠ **授權跟政策是兩件事，兩件都要做。**
-- 2026-09-01：profiles 的 grant update 少列了一個欄位，saveProfile / clearAll /
-- importPassport 三條寫入路徑全部靜靜地失敗，而 RLS 政策是對的、兩層驗收也都
-- 誠實地通過了 —— 因為它們驗的是政策，不是授權。Postgres 要求 SET 清單上的
-- **每一個欄位**都有權限，少一個就整句失敗。
grant select, insert, delete   on public.availability      to authenticated;
grant select, insert           on public.availability_meta to authenticated;
-- 只給 notice_seen_at。updated_at 不在裡面是刻意的（見上面那條欄位註解）。
grant update (notice_seen_at)  on public.availability_meta to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 5. updated_at 由 trigger 維護
-- ─────────────────────────────────────────────────────────────────────
-- **必須是 security definer。** 呼叫者對 availability_meta 只有
-- update (notice_seen_at) 的欄位授權，以呼叫者身分執行的話這個 upsert
-- 會因為碰了 updated_at 而被拒 —— 而那個拒絕會長得像「存檔失敗」。
--
-- security definer 繞過 RLS，所以要問：它會不會寫到別人的列？
-- 不會。user_id 取自**正在被寫入或刪除的那一列**，而那一列本身已經被
-- availability 的 RLS 限制成呼叫者自己的。這裡沒有任何來自參數的身分。
create or replace function public.touch_availability()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.availability_meta (user_id, updated_at)
  values (coalesce(new.user_id, old.user_id), now())
  on conflict (user_id) do update set updated_at = now();
  return coalesce(new, old);
end $$;

drop trigger if exists availability_touch on public.availability;
-- for each row 而不是 for each statement：statement 層拿不到 user_id，
-- 只能靠 auth.uid()，那在後台用 SQL 修資料時是 null，時間戳就不會動。
-- 一次批次編輯會觸發幾十次，但那是同一列的 upsert，在這個量級不值得為它換寫法。
create trigger availability_touch
after insert or delete on public.availability
for each row execute function public.touch_availability();

-- ─────────────────────────────────────────────────────────────────────
-- 6. 「我確認過了，沒有變」（使用者 2026-09-02 核可的 Q1）
-- ─────────────────────────────────────────────────────────────────────
-- 為什麼需要它：規格 §4-3 C 是「超過 30 天標紅」。但作息穩定的人本來就不用改，
-- 他會永遠紅著被催 —— 催到後來大家就不信任那個紅色。
-- 「資料可能過期」跟「最近沒動過」是兩件事，看板要問的是前者。
--
-- **這支函式沒有任何參數，那是刻意的最強形式。**
-- 身分只有一個來源：auth.uid()。沒有參數就沒有「參數跟欄位撞名」那一類問題
-- （claim_invite 的 p_code 那個坑），也沒有任何方式叫它去更新別人的時間戳。
-- 加參數之前先想清楚為什麼需要 —— 多半是不需要。
create or replace function public.confirm_availability_unchanged()
returns timestamptz language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); v_at timestamptz;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  -- security definer 繞過 RLS，所以幹部身分要在這裡自己檢查一次。
  -- 少了這一行，學員也能更新自己的時間戳（雖然看板讀不到，但那是另一道門）。
  if not public.is_cadre() then raise exception 'not_cadre' using errcode = 'P0001'; end if;
  insert into public.availability_meta (user_id, updated_at)
  values (v_uid, now())
  on conflict (user_id) do update set updated_at = now()
  returning availability_meta.updated_at into v_at;
  return v_at;
end $$;

revoke all on function public.confirm_availability_unchanged() from public;
grant execute on function public.confirm_availability_unchanged() to authenticated;

commit;
