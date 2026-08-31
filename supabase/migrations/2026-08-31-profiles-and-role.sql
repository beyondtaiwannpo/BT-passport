-- 遷移 A：加 role、拆 profiles / passports　2026-08-31
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。最後會出現一張 PASS / FAIL 的結果表。
-- **跑之前先確認 ~/bt-site-backups/2026-08-31-pre-migration.sql 還在你的電腦上。**
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
-- 規格第 3、4 步合併成一次（見 BT-Site-交接規格.md §3-1、§3-2）。合併的理由：
-- role 若先加在 passports 上，第 4 步又要搬到 profiles，欄位層級 grant 要發兩次、
-- 每一條 RLS 要改兩次，中間那個誰都不會用到的狀態還要驗一輪。合成一次、
-- 包在同一個 transaction 裡，中途任何一句失敗就整份回滾。
--
-- ============================================================================
-- 這一支「不做」什麼 —— 這是它安全的原因
-- ============================================================================
-- **passports 一個欄位都不 drop。** name_zh / name_en / team / avatar 全部留著。
-- 也就是說這一支跑完之後，舊的前端仍然能正常運作（它讀 passports.name_zh，
-- 那一欄還在，內容也沒動）。SQL 與前端不必同一秒上線。
--
-- drop 舊欄位是「遷移 B」的事，要等到：profiles 有資料、前端已經改成讀 profiles、
-- 而且你實測過一輪之後，才單獨跑。drop column 不可逆，不要跟這一支混在一起。
--
-- 這段期間 passports 與 profiles 的名字欄位是重複的。**唯一要守的規矩是：
-- 這段期間寫入只走 profiles。** 兩邊都寫會分岔，而分岔是安靜的。
-- 遷移 B 之前會先用一句唯讀 SQL 比對兩邊還一不一致。
--
-- ============================================================================
-- 守門在這一支裡沒有變弱
-- ============================================================================
-- 註冊 trigger 的邀請碼檢查**原封不動**。這一支只是讓它多建一列 profiles。
-- 「沒有邀請碼就沒有帳號」在階段 5 之前完全不變。
-- role 的 default 是 'cadre'，因為現在能註冊的都是幹部。
-- **階段 5 的最後一句才會把 default 改成 'student'** —— 那是整輪唯一一個
-- 守門變弱的瞬間，要單獨一個 commit、單獨確認，不在這裡。
-- ============================================================================

begin;

-- ---------- 1. profiles ----------
-- 每一個使用者都有一列，不管他有沒有護照。
-- avatar 放這裡而不是 passports：那是「這個人」的大頭照，不是「這本護照」的。
-- tz 是 IANA 時區字串（例如 Asia/Taipei），時間看板要用，現在先留空。
-- **不要存 UTC 偏移量**，夏令時間會讓偏移量在一年中改變（規格 §5-1）。
create table if not exists profiles (
  id         uuid primary key references auth.users on delete cascade,
  name_zh    text,
  name_en    text,
  team       text,
  -- 三個值都允許，但這一版的 RLS 只認 cadre：alumni 等同 student，什麼都看不到。
  -- 等真的有校友要進來再定義（規格 §3-1）。
  role       text not null default 'cadre'
             check (role in ('cadre', 'student', 'alumni')),
  tz         text,
  avatar     text,                    -- base64 jpeg
  updated_at timestamptz not null default now()
);

-- ---------- 2. 把既有的人搬過來 ----------
-- role 吃 default 'cadre'。on conflict 讓這一支可以重複執行。
insert into profiles (id, name_zh, name_en, team, avatar, updated_at)
select id, name_zh, name_en, team, avatar, coalesce(updated_at, now())
  from passports
on conflict (id) do nothing;

-- ---------- 3. is_cadre()：「我是不是幹部」只有一個答案來源 ----------
-- security definer 有兩個必要理由，不是為了方便：
--   1. 避免遞迴。profiles 自己的 SELECT 政策要看 role，而 role 在 profiles 裡。
--      政策裡直接寫子查詢的話，那個子查詢又要套一次 profiles 的政策。
--   2. 其他表的政策要看 profiles，但呼叫者不一定讀得到那一列。
-- stable：同一個查詢裡只算一次，不會每一列都去查一次 profiles。
--
-- ⚠ 這裡有一個沒寫出來就看不見的前提：**security definer 之所以不會遞迴，
-- 是因為函式以擁有者的身分執行，而表的擁有者預設繞過 RLS。**
-- 哪天有人對 profiles 下 `alter table profiles force row level security`，
-- 擁有者就不再繞過，這個函式會在自己的政策裡呼叫自己 —— 無限遞迴。
-- **不要對 profiles 開 force row level security。** 真的需要的話，
-- 這個函式要改成別的做法（例如把 role 快取進 JWT claim）。
-- set search_path 釘死，別人就沒辦法用同名的暫存表換掉 profiles（跟註冊 trigger 同一個理由）。
create or replace function public.is_cadre()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'cadre'
  );
$$;

revoke execute on function public.is_cadre() from public, anon;
grant  execute on function public.is_cadre() to authenticated;

-- ---------- 4. updated_at 由資料庫自己蓋 ----------
-- 前端不准寫這一欄，理由有兩個：
--   1. 規格 §3-1 的欄位層級 grant 只發 (name_zh, name_en, tz, avatar)，
--      updated_at 不在裡面。發給它就等於多開一個洞，而且沒有必要。
--   2. 時間看板的「上次更新 N 天前、超過 30 天標紅」要靠這個時間說實話。
--      讓客戶端自己填的話，那個數字就是客戶端說了算。
-- 所以改成資料庫在每次 update 時自己蓋，前端那一行送出的 updated_at 會被覆蓋掉。
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists profiles_touch_updated_at on profiles;
create trigger profiles_touch_updated_at
  before update on profiles
  for each row execute function public.touch_updated_at();

-- ---------- 5. profiles 的 RLS ----------
alter table profiles enable row level security;

-- 讀：自己那一列永遠讀得到（不然學員連自己叫什麼都不知道）；
-- 幹部另外讀得到所有幹部（進度牆要看別人的名字）。
-- 學員讀不到任何一個幹部，未登入的人一列都讀不到。
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles
  for select to authenticated
  using (auth.uid() = id or (public.is_cadre() and profiles.role = 'cadre'));

-- 改：只能改自己那一列。**能改哪幾欄由下面的欄位層級 grant 決定，不是這裡。**
-- 這條政策管的是「哪一列」，grant 管的是「哪一欄」，兩層都要對。
drop policy if exists profiles_write on profiles;
create policy profiles_write on profiles
  for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- 沒有 insert policy，也沒有 delete policy：那一列由註冊 trigger 建立，
-- 跟 passports 是同一個設計。前端補不出來，也刪不掉。

-- ---------- 6. profiles 的權限（先收光，再一欄一欄發）----------
-- Supabase 對 public schema 的新表預設會把 ALL 發給 anon 與 authenticated。
-- 不先 revoke 的話，下面的欄位層級 grant 只是裝飾 —— 表層級的 UPDATE 還在，
-- 使用者照樣改得動 role。這跟 schema.sql 檔尾那段 revoke 是同一個坑。
--
-- **role 不在發出去的欄位裡，這是整份規格 §3-1 那個洞的解法。**
-- 要改角色只能透過階段 5 那個會驗邀請碼的函式。
-- 驗收方式不是「前端沒有那個按鈕」，是拿 student 帳號直接打 API 要看到權限錯誤。
revoke all on profiles from anon, authenticated;
grant select on profiles to authenticated;
grant update (name_zh, name_en, tz, avatar) on profiles to authenticated;

-- ---------- 7. 外鍵改指 profiles ----------
-- 每一個使用者都有 profiles 那一列，指過去才是對的關係；指 passports 的話，
-- 一個沒有護照的學員就沒辦法有任何一列跟他相關的資料。
--
-- 這三句同時是一道免費的守門：上面第 2 步如果沒把人搬乾淨，
-- add constraint 會失敗，整個 transaction 回滾。它不是形式。
alter table stamps  drop constraint if exists stamps_user_id_fkey;
alter table stamps  add  constraint stamps_user_id_fkey
      foreign key (user_id) references profiles(id) on delete cascade;

alter table entries drop constraint if exists entries_user_id_fkey;
alter table entries add  constraint entries_user_id_fkey
      foreign key (user_id) references profiles(id) on delete cascade;

alter table visas   drop constraint if exists visas_user_id_fkey;
alter table visas   add  constraint visas_user_id_fkey
      foreign key (user_id) references profiles(id) on delete cascade;

-- ---------- 8. 現有的 RLS 全部改認 cadre ----------
-- 規格 §3-1：凡是寫「登入者皆可讀」的，改成「role = 'cadre' 才可讀」。
drop policy if exists months_read on months;
create policy months_read on months
  for select to authenticated using (public.is_cadre());

drop policy if exists activities_read on activities;
create policy activities_read on activities
  for select to authenticated using (public.is_cadre());

drop policy if exists milestones_read on milestones;
create policy milestones_read on milestones
  for select to authenticated using (public.is_cadre());

drop policy if exists destinations_read on destinations;
create policy destinations_read on destinations
  for select to authenticated using (public.is_cadre());

drop policy if exists passports_read on passports;
create policy passports_read on passports
  for select to authenticated using (public.is_cadre());

drop policy if exists passports_write on passports;
create policy passports_write on passports
  for update to authenticated
  using (auth.uid() = id and public.is_cadre())
  with check (auth.uid() = id and public.is_cadre());

-- **寫入端也要認 cadre（規格 §3-1，原本漏了）。**
-- 原本這幾條只綁 auth.uid() = user_id，也就是任何登入者都寫得進去，
-- 只有讀取端有角色過濾。一層不夠：學員雖然讀不到別人的 entries，
-- 卻能往自己名下塞資料、把自己蓋成一本護照。
drop policy if exists stamps_read on stamps;
create policy stamps_read on stamps
  for select to authenticated using (public.is_cadre());

drop policy if exists stamps_insert on stamps;
create policy stamps_insert on stamps
  for insert to authenticated
  with check (auth.uid() = user_id and public.is_cadre());

drop policy if exists stamps_update on stamps;
create policy stamps_update on stamps
  for update to authenticated
  using (auth.uid() = user_id and public.is_cadre())
  with check (auth.uid() = user_id and public.is_cadre());

drop policy if exists stamps_delete on stamps;
create policy stamps_delete on stamps
  for delete to authenticated
  using (auth.uid() = user_id and public.is_cadre());

-- entries 四條全部綁本人，這是整個系統唯一真正重要的安全需求（README 第 1 項），
-- 再加上 cadre。**auth.uid() = user_id 這一半不准拿掉**，
-- 角色是額外一層，不是替代品：所有幹部都是 cadre，只認 cadre 等於誰都看得到。
drop policy if exists entries_read on entries;
create policy entries_read on entries
  for select to authenticated
  using (auth.uid() = user_id and public.is_cadre());

drop policy if exists entries_insert on entries;
create policy entries_insert on entries
  for insert to authenticated
  with check (auth.uid() = user_id and public.is_cadre());

drop policy if exists entries_update on entries;
create policy entries_update on entries
  for update to authenticated
  using (auth.uid() = user_id and public.is_cadre())
  with check (auth.uid() = user_id and public.is_cadre());

drop policy if exists entries_delete on entries;
create policy entries_delete on entries
  for delete to authenticated
  using (auth.uid() = user_id and public.is_cadre());

-- visas 沒有 UPDATE，那是刻意的（見 2026-08-26-visas.sql 的檔頭），這裡不動那件事。
drop policy if exists visas_read on visas;
create policy visas_read on visas
  for select to authenticated
  using (auth.uid() = user_id and public.is_cadre());

drop policy if exists visas_insert on visas;
create policy visas_insert on visas
  for insert to authenticated
  with check (auth.uid() = user_id and public.is_cadre());

drop policy if exists visas_delete on visas;
create policy visas_delete on visas
  for delete to authenticated
  using (auth.uid() = user_id and public.is_cadre());

-- ---------- 9. 註冊 trigger 跟著改 ----------
-- **邀請碼那段一個字都沒改。** 差別只有一件事：現在多建一列 profiles。
-- 階段 5 才會把邀請碼從這裡搬到角色升級的函式，那時候這個 trigger 才會變弱。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_code text := new.raw_user_meta_data->>'invite';
begin
  -- 檢查與扣減同一句 update ... where uses_left > 0，再用 if not found 判斷。
  -- 分成先查再扣的話，兩個人同時用同一組只剩一次的碼會兩個都通過。
  -- 比對兩邊都套 upper(btrim(...))：不分大小寫、不分前後空白。
  -- 為什麼正規化全部在這一行、前端一個字都不改：2026-08-17 出過事，
  -- 前端會 .toUpperCase() 而這裡是嚴格比對，管理員建的小寫碼讓所有學生註冊失敗。
  -- **不要回頭在前端加任何大小寫轉換。**
  update invite_codes set uses_left = uses_left - 1
   where upper(btrim(code)) = upper(btrim(v_code)) and uses_left > 0;
  if not found then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;

  -- profiles 是每個人都有的；passports 只有幹部才有。
  -- 現在能走到這裡的都是拿著有效邀請碼的幹部，所以兩列都建。
  -- 階段 5 之後這裡只建 profiles，passports 改由升級函式建。
  insert into profiles (id)  values (new.id) on conflict (id) do nothing;
  insert into passports (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

commit;


-- ============================================================================
-- 跑完了。**接著把 2026-08-31-profiles-and-role-驗收.sql 整份貼進來跑一次。**
-- 那一支是唯讀的，只會印出一張 PASS / FAIL 的表，不會再動任何東西。
--
-- 驗收拆成另一個檔案，是因為它必須在 commit 之後才看得到結果 ——
-- 但寫在同一份的話，萬一驗收那段自己有語法錯，你會看到「遷移已經 commit
-- 卻整片紅」，分不清是哪一段出事。分開就沒有這個模糊地帶。
--
-- 這一支可以重複執行：create table if not exists、insert on conflict、
-- drop policy if exists、drop constraint if exists 都寫好了。
-- 中途出錯的話整個 transaction 會回滾，直接修好再貼一次就行。
-- ============================================================================
