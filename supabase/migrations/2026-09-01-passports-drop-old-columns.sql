-- 遷移 B：drop passports 的四個舊欄位　2026-08-31
--
-- ⚠ **這是這一輪第一個不可逆的動作。** drop column 沒有 undo。
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。
-- 前置條件寫成了 raise exception，不成立會整份回滾、什麼都不會掉。
--
-- ============================================================================
-- 要 drop 的是哪四欄，為什麼可以 drop
-- ============================================================================
--   passports.name_zh / name_en / team / avatar
--
-- 2026-08-31 拆表（遷移 A）之後，這四欄搬到了 profiles，而且**從那一刻起
-- 前端沒有任何一處寫它們**（data.js 的 saveProfile / clearAll / importPassport
-- 都只寫 profiles）。讀的部分：loadAll 用 select("*") 拿整列，但只取
-- motto / issued / intro_seen 三欄，少了那四欄不會有任何影響。
--
-- 所以它們現在是一份沒有人讀、也沒有人寫的資料，值停在拆表那一刻。
-- 留著的壞處不是佔空間，是**下一個人會以為那是活的**：
-- 看到 passports 也有 name_zh，就不知道該信哪一邊。
--
-- ============================================================================
-- 備份
-- ============================================================================
-- 不需要新做一份。~/bt-site-backups/2026-08-31-pre-migration.sql 裡的
-- passports 那兩句 insert 已經完整含有這四欄，而且 2026-08-31 比對過：
-- 兩個人的 name_zh / name_en / team 逐字相同，avatar 的 md5 與長度也相同
-- （f9ce2f954f06254e03ae8e48e31c9bd3 / 17675，另一位是 null）。
-- 那份備份當初逐列對過資料庫，而這四欄從拆表之後就沒有再被寫入過。
--
-- ============================================================================
-- 前置條件：不是「兩張表一樣」，是「沒有人的資料只存在 passports」
-- ============================================================================
-- **刻意不檢查 profiles 與 passports 相等。** 拆表之後 profiles 是活的、
-- passports 那四欄是凍結的快照，兩邊本來就會分開 —— 使用者改一次名字就不一樣了。
-- 拿相等當前置條件的話，這一支會在「一切正常」的時候失敗。
--
-- 真正要擋的是另一件事：**有沒有誰的名字只存在於即將被刪的那一邊。**
-- 那才是 drop 之後會真的掉東西的情況。
-- ============================================================================

begin;

do $$
declare n int;
begin
  -- 1. 每一個有護照的人，profiles 都要有對應的一列
  select count(*) into n
    from passports q left join profiles p using (id)
   where p.id is null;
  if n > 0 then
    raise exception '有 % 個人在 passports 有列、在 profiles 沒有。先補上再 drop。', n
      using errcode = 'P0001';
  end if;

  -- 2. 沒有人的名字／組別／大頭照「只存在於 passports」
  --    （passports 那邊有值、profiles 那邊是空的 —— drop 下去就真的沒了）
  select count(*) into n
    from passports q join profiles p using (id)
   where (q.name_zh is not null and p.name_zh is null)
      or (q.name_en is not null and p.name_en is null)
      or (q.team    is not null and p.team    is null)
      or (q.avatar  is not null and p.avatar  is null);
  if n > 0 then
    raise exception '有 % 個人的資料只存在於 passports，drop 下去會真的掉。先搬到 profiles。', n
      using errcode = 'P0001';
  end if;
end $$;

alter table passports
  drop column name_zh,
  drop column name_en,
  drop column team,
  drop column avatar;

commit;


-- ---------- 驗收 ----------
select * from (
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when
      (select count(*) from information_schema.columns
        where table_schema='public' and table_name='passports'
          and column_name in ('name_zh','name_en','team','avatar')) = 0
      and (select count(*) from information_schema.columns
            where table_schema='public' and table_name='passports'
              and column_name in ('id','motto','issued','intro_seen','updated_at')) = 5
      and (select count(*) from passports) = 2
      and (select count(*) from profiles)  = 2
      and (select count(*) from profiles where name_zh is not null) = 2
      and (select count(*) from profiles where avatar is not null)  = 1
      and (select count(*) from stamps) = 0
      and (select count(*) from entries) = 0
      and (select count(*) from visas)  = 0
    then 'PASS' else 'FAIL' end as 結果

  union all select 1, '★ 那四欄不見了', '0 欄',
    (select count(*) from information_schema.columns
      where table_schema='public' and table_name='passports'
        and column_name in ('name_zh','name_en','team','avatar'))::text || ' 欄',
    case when (select count(*) from information_schema.columns
      where table_schema='public' and table_name='passports'
        and column_name in ('name_zh','name_en','team','avatar')) = 0
    then 'PASS' else 'FAIL' end

  union all select 2, 'passports 剩下的五欄都在', 'id,motto,issued,intro_seen,updated_at',
    coalesce((select string_agg(column_name, ',' order by ordinal_position)
                from information_schema.columns
               where table_schema='public' and table_name='passports'), '（表不見了）'),
    case when (select count(*) from information_schema.columns
                where table_schema='public' and table_name='passports'
                  and column_name in ('id','motto','issued','intro_seen','updated_at')) = 5
    then 'PASS' else 'FAIL' end

  -- ★ 沒有掉列。drop column 只該少幾欄，不該少任何一列。
  union all select 3, '★ passports 與 profiles 都還是 2 列', '2 / 2',
    (select count(*) from passports)::text || ' / ' || (select count(*) from profiles)::text,
    case when (select count(*) from passports) = 2 and (select count(*) from profiles) = 2
    then 'PASS' else 'FAIL' end

  -- ★ profiles 完全沒被碰到 —— 名字與大頭照還在那裡。
  union all select 4, '★ profiles 的名字與大頭照都還在', '2 個名字 / 1 張頭像',
    (select count(*) from profiles where name_zh is not null)::text || ' 個名字 / '
      || (select count(*) from profiles where avatar is not null)::text || ' 張頭像',
    case when (select count(*) from profiles where name_zh is not null) = 2
          and (select count(*) from profiles where avatar is not null) = 1
    then 'PASS' else 'FAIL' end

  union all select 5, 'motto 與 issued 沒被動到', '2 個 motto',
    (select count(*) from passports where motto is not null)::text || ' 個 motto',
    case when (select count(*) from passports where motto is not null) = 2
    then 'PASS' else 'FAIL' end

  union all select 6, 'intro_seen 還是 true（不該又跳引導頁）', '2 人',
    (select count(*) from passports where intro_seen)::text || ' 人',
    case when (select count(*) from passports where intro_seen) = 2 then 'PASS' else 'FAIL' end

  union all select 7, '章／心得／入境章仍然是 0 列', '0 / 0 / 0',
    (select count(*) from stamps)::text || ' / ' || (select count(*) from entries)::text
      || ' / ' || (select count(*) from visas)::text,
    case when (select count(*) from stamps) = 0 and (select count(*) from entries) = 0
          and (select count(*) from visas) = 0 then 'PASS' else 'FAIL' end

  union all select 8, '守門還在：trigger 仍會擋無效邀請碼', '有 invalid_invite',
    case when (select prosrc from pg_proc where proname='handle_new_user') like '%invalid_invite%'
         then '有' else '不見了' end,
    case when (select prosrc from pg_proc where proname='handle_new_user') like '%invalid_invite%'
         then 'PASS' else 'FAIL' end
) x order by ord;
