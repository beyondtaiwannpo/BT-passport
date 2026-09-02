-- 每週時間看板 RLS 驗收　2026-09-02
--
-- 用法：整份貼進 Supabase SQL Editor 執行，在 2026-09-02-availability.sql 之後。
-- 跑完在 Results 看一張表，失敗的排最上面，第一列固定是 OVERALL。
--
-- ============================================================================
-- ★ 讀這份之前要先懂的一件事（跟 rls-test.sql 同一條）
-- ============================================================================
-- **每一條「讀不到」的斷言，都需要旁邊那條「讀得到」當對照組。**
-- 這份裡面全是「學員讀不到看板、乙寫不到甲的格子」型的 0 列斷言，
-- 而它們有一個共同的失敗模式：**當受測帳號其實什麼都讀不到的時候，全部都會通過。**
-- 測試帳號沒建出來、角色設錯、政策掛錯表 —— 每一種都會讓這份變成全綠，
-- 而它證明的是「這個帳號什麼都看不到」，不是「隔離有效」。
--
-- 所以每一組負向旁邊都有正向：
--   學員讀不到 availability（0）←→ 學員讀得到自己的 profiles（1）
--   乙寫不進甲的格子            ←→ 乙寫得進自己的格子
--   乙改不動 updated_at         ←→ 乙改得動 notice_seen_at
-- **不要因為「正向那條本來就會過」而刪掉它。**
--
-- 這一份最重要的是 210 與 211 那一對：看板的讀取政策是整個功能的隱私邊界，
-- 而它保護的是三十個人的長期作息表，裡面有未成年幹部的（規格 §4-5）。
--
-- 角色一律明寫，不依賴 default（default 現在是 student，靠它會讓所有測試變學員視角）。
-- 不包在交易裡：rollback 會把結果表一起復原掉。用「開頭先清、結尾再清」做到可重複執行。
-- ============================================================================

reset role;
select set_config('request.jwt.claims', '', false);

drop table if exists pg_temp.av_result;
drop table if exists pg_temp.av_tmp;

-- ---------- 0. 先清乾淨 ----------
-- 只認下面三個固定的測試 UUID，碰不到任何真實資料。
delete from availability      where user_id in ('a0000000-0000-0000-0000-0000000000a1','b0000000-0000-0000-0000-0000000000b2','c0000000-0000-0000-0000-0000000000c3');
delete from availability_meta where user_id in ('a0000000-0000-0000-0000-0000000000a1','b0000000-0000-0000-0000-0000000000b2','c0000000-0000-0000-0000-0000000000c3');
delete from profiles          where id      in ('a0000000-0000-0000-0000-0000000000a1','b0000000-0000-0000-0000-0000000000b2','c0000000-0000-0000-0000-0000000000c3');
delete from auth.users        where id      in ('a0000000-0000-0000-0000-0000000000a1','b0000000-0000-0000-0000-0000000000b2','c0000000-0000-0000-0000-0000000000c3');

create temp table av_result (
  n        int,
  what     text,
  expected text,
  actual   text,
  pass     boolean
);
-- **anon 也要給。** 第 4 節會用未登入身分寫一列結果進來，
-- 少了這一句整份會在那裡中斷（2026-09-02 實際發生過）——
-- 而中斷的後果是 217 之後全部沒跑到，包括 999 那條「跑了幾條」的斷言本身。
grant all on av_result to authenticated;
grant all on av_result to anon;

-- 跨交易傳一個值用的。為什麼需要它見下面 212。
create temp table av_tmp (k text primary key, v timestamptz);
grant all on av_tmp to authenticated;

-- ---------- 1. 三個測試帳號 ----------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
 ('a0000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','av-a@example.com','x',now(),now(),now()),
 ('b0000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','av-b@example.com','x',now(),now(),now()),
 ('c0000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','av-c@example.com','x',now(),now(),now());

-- 註冊 trigger 會建 profiles，但角色**明寫**，不靠 default。
insert into profiles (id, name_zh, tz) values
 ('a0000000-0000-0000-0000-0000000000a1','測試甲','Asia/Taipei'),
 ('b0000000-0000-0000-0000-0000000000b2','測試乙','America/Detroit'),
 ('c0000000-0000-0000-0000-0000000000c3','測試丙',null)
on conflict (id) do update set name_zh = excluded.name_zh, tz = excluded.tz;

update profiles set role = 'cadre'   where id = 'a0000000-0000-0000-0000-0000000000a1';
update profiles set role = 'cadre'   where id = 'b0000000-0000-0000-0000-0000000000b2';
update profiles set role = 'student' where id = 'c0000000-0000-0000-0000-0000000000c3';

-- 甲的格子：週一 19:00 與 19:30（以管理者身分放進去，繞過 RLS）。
insert into availability (user_id, weekday, minute) values
 ('a0000000-0000-0000-0000-0000000000a1', 1, 1140),
 ('a0000000-0000-0000-0000-0000000000a1', 1, 1170);

-- ============================================================================
-- 2. 幹部乙的視角
-- ============================================================================
set role authenticated;
select set_config('request.jwt.claims',
                  '{"sub":"b0000000-0000-0000-0000-0000000000b2","role":"authenticated"}', false);

do $$
declare n int; blocked boolean; t timestamptz; t2 timestamptz;
begin
  -- ===== 讀 =====
  -- 幹部本來就該看得到別人的格子 —— 看板就是要給他看（規格 §4-5）。
  select count(*) into n from availability where user_id = 'a0000000-0000-0000-0000-0000000000a1';
  insert into av_result values (200, '幹部乙看得到甲的格子（看板要能運作）', '2 列', n || ' 列', n = 2);

  -- ===== 寫自己的（正向對照）=====
  blocked := false;
  begin
    insert into availability (user_id, weekday, minute)
         values ('b0000000-0000-0000-0000-0000000000b2', 3, 600);
  exception when insufficient_privilege or check_violation then blocked := true;
  end;
  insert into av_result values (201, '【對照】乙寫得進自己的格子', '寫入成功',
    case when blocked then '被擋，政策過緊' else '寫入成功' end, not blocked);

  -- ===== 寫別人的（這是主要的那條）=====
  blocked := false;
  begin
    insert into availability (user_id, weekday, minute)
         values ('a0000000-0000-0000-0000-0000000000a1', 5, 60);
  exception when insufficient_privilege or check_violation then blocked := true;
  end;
  insert into av_result values (202, '乙寫不進甲的格子', '被擋下',
    case when blocked then '被擋下' else '**寫進去了**' end, blocked);

  -- ===== 刪別人的 =====
  delete from availability
   where user_id = 'a0000000-0000-0000-0000-0000000000a1' and weekday = 1 and minute = 1140;
  select count(*) into n from availability
   where user_id = 'a0000000-0000-0000-0000-0000000000a1' and weekday = 1 and minute = 1140;
  insert into av_result values (203, '乙刪不掉甲的格子', '那一列還在', n || ' 列', n = 1);

  -- ===== 刪自己的（正向對照）=====
  delete from availability
   where user_id = 'b0000000-0000-0000-0000-0000000000b2' and weekday = 3 and minute = 600;
  select count(*) into n from availability
   where user_id = 'b0000000-0000-0000-0000-0000000000b2' and weekday = 3 and minute = 600;
  insert into av_result values (204, '【對照】乙刪得掉自己的格子', '0 列', n || ' 列', n = 0);

  -- ===== 這張表根本沒有 update 這條路 =====
  -- 沒有 update 政策、也沒有 update 授權。這一條測的是「那條路不存在」，
  -- 不是「政策把它擋住了」。
  blocked := false;
  begin
    update availability set minute = 0
     where user_id = 'a0000000-0000-0000-0000-0000000000a1';
  exception when insufficient_privilege then blocked := true;
  end;
  insert into av_result values (205, 'availability 沒有 update 這條路', '被擋下',
    case when blocked then '被擋下' else '**改得動**' end, blocked);

  -- ===== trigger 有沒有把 updated_at 記起來 =====
  insert into availability (user_id, weekday, minute)
       values ('b0000000-0000-0000-0000-0000000000b2', 4, 1200);
  select updated_at into t from availability_meta
   where user_id = 'b0000000-0000-0000-0000-0000000000b2';
  insert into av_result values (206, 'trigger 幫乙建了 meta 並記下時間', '有一列且是剛剛',
    coalesce(t::text, '(沒有那一列)'),
    t is not null and t > now() - interval '1 minute');

  -- ===== updated_at 前端寫不動（欄位授權）=====
  blocked := false;
  begin
    update availability_meta set updated_at = now() - interval '400 days'
     where user_id = 'b0000000-0000-0000-0000-0000000000b2';
  exception when insufficient_privilege then blocked := true;
  end;
  insert into av_result values (207, '乙改不動自己的 updated_at（那個紅色是拿來催人的）', '被擋下',
    case when blocked then '被擋下' else '**改得動，可以讓自己永遠是綠的**' end, blocked);

  -- ===== notice_seen_at 改得動（正向對照）=====
  -- 沒有這一條的話，上面那個「被擋下」可能只是「這張表整個改不動」。
  blocked := false;
  begin
    update availability_meta set notice_seen_at = now()
     where user_id = 'b0000000-0000-0000-0000-0000000000b2';
  exception when insufficient_privilege then blocked := true;
  end;
  insert into av_result values (208, '【對照】乙改得動自己的 notice_seen_at', '改得動',
    case when blocked then '被擋，欄位授權漏了' else '改得動' end, not blocked);

  -- ===== 改不動別人的 meta =====
  update availability_meta set notice_seen_at = '2001-01-01'
   where user_id = 'a0000000-0000-0000-0000-0000000000a1';
  select count(*) into n from availability_meta
   where user_id = 'a0000000-0000-0000-0000-0000000000a1'
     and notice_seen_at = '2001-01-01';
  insert into av_result values (209, '乙改不動甲的 meta', '0 列', n || ' 列', n = 0);

  -- ===== 確認按鈕（Q1）的基準線 =====
  -- 只記下現在的值，比較留到下一個交易做。理由見下面那一段。
  insert into av_tmp (k, v)
  select 'before', updated_at from availability_meta
   where user_id = 'b0000000-0000-0000-0000-0000000000b2';
end $$;

-- ⚠ 212 要**單獨一個交易**，這不是排版。
--
-- Postgres 的 now() 回的是**交易開始時間**，不是當下時間。整個 do 區塊是一句
-- SQL、也就是一個交易，所以 trigger 寫進去的 now() 跟 confirm_availability_unchanged()
-- 寫進去的 now() 會是同一個值 —— 在同一個區塊裡比「有沒有變新」永遠不會變新。
-- pg_sleep 也救不了，它不會讓 now() 前進。
--
-- 這一條 2026-09-02 第一次跑是**通過**的，而它通過的理由是錯的：
-- 當時 207 那個 bug 還在（authenticated 改得動 updated_at），測試前一步剛把它
-- 設成 400 天前，所以「變新」自然成立。**把那個 bug 修掉之後，這條才變紅。**
-- 一條測試靠另一個 bug 才會過，它測的就不是它名字上寫的那件事。
do $$
declare t timestamptz; t2 timestamptz;
begin
  select v into t from av_tmp where k = 'before';
  perform public.confirm_availability_unchanged();
  select updated_at into t2 from availability_meta
   where user_id = 'b0000000-0000-0000-0000-0000000000b2';
  insert into av_result values (212, '幹部按「確認沒變」會把 updated_at 往前推', '變新',
    case when t2 > t then '變新（' || t || ' → ' || t2 || '）' else '沒有變' end, t2 > t);
end $$;

-- ============================================================================
-- 3. 學員丙的視角 —— 這一段是整份最重要的
-- ============================================================================
select set_config('request.jwt.claims',
                  '{"sub":"c0000000-0000-0000-0000-0000000000c3","role":"authenticated"}', false);

do $$
declare n int; blocked boolean;
begin
  -- ★ 看板的隱私邊界。保護的是三十個人的長期作息表，裡面有未成年幹部的。
  select count(*) into n from availability;
  insert into av_result values (210, '★ 學員讀不到任何格子', '0 列', n || ' 列', n = 0);

  -- ↓ 對照組。沒有這一條，上面那個 0 列可能只是「這個 session 什麼都讀不到」
  --   （角色設錯、claims 沒吃到、帳號沒建出來，每一種都會讓 210 假通過）。
  select count(*) into n from profiles where id = 'c0000000-0000-0000-0000-0000000000c3';
  insert into av_result values (211, '【對照】學員讀得到自己的 profiles', '1 列', n || ' 列', n = 1);

  select count(*) into n from availability_meta;
  insert into av_result values (213, '學員讀不到任何 meta', '0 列', n || ' 列', n = 0);

  blocked := false;
  begin
    insert into availability (user_id, weekday, minute)
         values ('c0000000-0000-0000-0000-0000000000c3', 1, 540);
  exception when insufficient_privilege or check_violation then blocked := true;
  end;
  insert into av_result values (214, '學員寫不進自己的格子（寫端也認 cadre）', '被擋下',
    case when blocked then '被擋下' else '**寫進去了**' end, blocked);

  blocked := false;
  begin
    perform public.confirm_availability_unchanged();
  exception when raise_exception then blocked := true;
  end;
  insert into av_result values (215, '學員叫不動「確認沒變」', '被擋下',
    case when blocked then '被擋下' else '**叫得動**' end, blocked);
end $$;

-- ============================================================================
-- 4. 未登入
-- ============================================================================
reset role;
set role anon;
select set_config('request.jwt.claims', '', false);

do $$
declare n int; blocked boolean;
begin
  -- ⚠ 這一條 2026-09-02 改寫過，因為**舊版在說謊**。
  -- 舊版的例外分支寫死「連授權都沒有」，但當時 anon 其實有 select 授權，
  -- 真正擋下它的是 permission denied for function is_cadre（早先的 migration
  -- 把那支函式從 anon 收回了）。也就是說：測試通過了，而它給的理由是錯的，
  -- 未登入的人是被一個意外擋住的，不是被設計擋住的。
  -- 現在這一版**不宣稱原因**，把實際的錯誤訊息填進 actual 欄；
  -- 「anon 到底有沒有權限」交給下面 225／226 直接查目錄。
  begin
    select count(*) into n from availability;
    insert into av_result values (216, '未登入讀不到任何格子', '0 列或被擋下', n || ' 列', n = 0);
  exception when insufficient_privilege then
    insert into av_result values (216, '未登入讀不到任何格子', '0 列或被擋下',
      '被擋下：' || sqlerrm, true);
  end;
end $$;

-- ============================================================================
-- 5. 資料層的檢查（管理者身分）
-- ============================================================================
reset role;
select set_config('request.jwt.claims', '', false);

do $$
declare n int;
begin
  -- 乙偷寫甲的那一列，真的沒有落地嗎。
  -- 202 是從乙的視角看的；這一條從管理者視角再確認一次，因為
  -- 「乙看不到它」跟「它不存在」不是同一件事。
  select count(*) into n from availability
   where user_id = 'a0000000-0000-0000-0000-0000000000a1' and weekday = 5;
  insert into av_result values (217, '乙那筆偷寫的資料真的不存在（管理者視角）', '0 列', n || ' 列', n = 0);

  -- 學員那筆也是。
  select count(*) into n from availability
   where user_id = 'c0000000-0000-0000-0000-0000000000c3';
  insert into av_result values (218, '學員那筆偷寫的資料真的不存在（管理者視角）', '0 列', n || ' 列', n = 0);

  -- availability 不准有 update 政策：這是設計，不是疏忽。
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'availability' and cmd = 'UPDATE';
  insert into av_result values (219, 'availability 沒有 update 政策（刻意的）', '0 條', n || ' 條', n = 0);

  -- 兩張表的 RLS 都要真的開著。
  select count(*) into n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relname in ('availability','availability_meta')
     and c.relrowsecurity;
  insert into av_result values (220, '兩張表的 RLS 都開著', '2 張', n || ' 張', n = 2);

  -- authenticated 不准有 availability 的 update 授權。
  insert into av_result values (221, 'authenticated 沒有 availability 的 update 授權', 'false',
    has_table_privilege('authenticated','public.availability','update')::text,
    not has_table_privilege('authenticated','public.availability','update'));

  -- updated_at 不准被授權給前端；notice_seen_at 要（對照）。
  insert into av_result values (222, 'updated_at 沒有給 authenticated 的欄位授權', 'false',
    has_column_privilege('authenticated','public.availability_meta','updated_at','update')::text,
    not has_column_privilege('authenticated','public.availability_meta','updated_at','update'));
  insert into av_result values (223, '【對照】notice_seen_at 有欄位授權', 'true',
    has_column_privilege('authenticated','public.availability_meta','notice_seen_at','update')::text,
    has_column_privilege('authenticated','public.availability_meta','notice_seen_at','update'));

  -- anon 對這兩張表不准有任何權限。
  -- **這兩條是這次真正該有而沒有的。** Supabase 在 public schema 設了
  -- default privileges，每一張新表自動 grant 全部權限給 anon 與 authenticated，
  -- 所以「我沒有 grant 給 anon」不等於「anon 沒有權限」——要先 revoke。
  -- 只驗政策的話這件事永遠不會被看見：政策確實會擋，但那是第二層，
  -- 而第一層破了的時候沒有任何東西會講。
  select count(*) into n from (
    select unnest(array['select','insert','update','delete']) as p) x
   where has_table_privilege('anon','public.availability', x.p);
  insert into av_result values (225, 'anon 對 availability 沒有任何權限', '0 種', n || ' 種', n = 0);

  select count(*) into n from (
    select unnest(array['select','insert','update','delete']) as p) x
   where has_table_privilege('anon','public.availability_meta', x.p);
  insert into av_result values (226, 'anon 對 availability_meta 沒有任何權限', '0 種', n || ' 種', n = 0);

  -- 兩支函式都要 security definer 且鎖住 search_path。
  -- 少了 search_path，同名的表可以被塞進 search_path 前面把函式騙走。
  select count(*) into n from pg_proc
   where proname in ('touch_availability','confirm_availability_unchanged')
     and prosecdef and proconfig @> array['search_path=public, pg_temp'];
  insert into av_result values (224, '兩支函式都是 security definer 且鎖了 search_path', '2 支', n || ' 支', n = 2);
end $$;

-- ---------- 6. 清掉測試資料 ----------
delete from availability      where user_id in ('a0000000-0000-0000-0000-0000000000a1','b0000000-0000-0000-0000-0000000000b2','c0000000-0000-0000-0000-0000000000c3');
delete from availability_meta where user_id in ('a0000000-0000-0000-0000-0000000000a1','b0000000-0000-0000-0000-0000000000b2','c0000000-0000-0000-0000-0000000000c3');
delete from profiles          where id      in ('a0000000-0000-0000-0000-0000000000a1','b0000000-0000-0000-0000-0000000000b2','c0000000-0000-0000-0000-0000000000c3');
delete from auth.users        where id      in ('a0000000-0000-0000-0000-0000000000a1','b0000000-0000-0000-0000-0000000000b2','c0000000-0000-0000-0000-0000000000c3');

-- ---------- 7. 結果 ----------
-- 最後一條斷言：實際跑了幾條。
-- 中途硬錯誤會讓某個 do 區塊整段沒跑完，而少掉的那幾條在結果表裡是「不見」，
-- 不是「紅」—— 沒有這一條的話，一份少了一半的報告看起來仍然全綠。
insert into av_result
select 999, '實際執行的測試數', '27 條', count(*) || ' 條', count(*) = 27 from av_result;

select * from (
  select 0 as sort, -1 as n,
         case when bool_and(pass) then '★ OVERALL：全部通過' else '✗ OVERALL：有項目未通過' end as what,
         '' as expected, count(*) filter (where not pass) || ' 條未通過' as actual,
         bool_and(pass) as pass
    from av_result
  union all
  select case when pass then 2 else 1 end, n, what, expected, actual, pass from av_result
) x order by sort, n;
