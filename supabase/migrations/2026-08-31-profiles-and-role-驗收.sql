-- 遷移 A 的驗收　2026-08-31　**唯讀，不會改任何東西**
--
-- 用法：在 2026-08-31-profiles-and-role.sql 跑完之後，整份貼進 SQL Editor 按 Run。
-- 第一列 OVERALL 是總結，只看它就知道有沒有全過；FAIL 的列自己會標出來。
--
-- 每一條都是「拿資料庫的實際狀態跟預期比」，不是重算一次同一個函式再跟自己比
-- （README 第 12 項的同義反覆）。★ 標的兩條是規格 §3-1 那個洞的直接驗證。
--
-- 這裡不用 has_table_privilege / has_column_privilege：那兩個函式在「只發了欄位
-- 層級」時各自回什麼，我沒有在這個資料庫上實測過，而建立在沒驗證過的語意上的
-- 斷言，綠燈不代表任何事情。改成直接查權限目錄 —— relacl 是表層級、attacl 是
-- 欄位層級，兩者分開存，查得到就是真的有。


select * from (
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when
      (select count(*) from profiles) = (select count(*) from passports)
      and (select count(*) from profiles p join passports q using (id)
            where p.name_zh is distinct from q.name_zh
               or p.name_en is distinct from q.name_en
               or p.team    is distinct from q.team
               or p.avatar  is distinct from q.avatar) = 0
      and (select count(*) from profiles where role <> 'cadre') = 0
      and (select count(*) from pg_class c, aclexplode(c.relacl) x
            where c.oid = 'public.profiles'::regclass
              and x.grantee = 'authenticated'::regrole and x.privilege_type = 'UPDATE') = 0
      and (select string_agg(distinct a.attname, ',' order by a.attname)
             from pg_attribute a, aclexplode(a.attacl) x
            where a.attrelid = 'public.profiles'::regclass
              and x.grantee = 'authenticated'::regrole and x.privilege_type = 'UPDATE')
          = 'avatar,name_en,name_zh,team,tz'
      and (select count(*) from pg_constraint c
            where c.conname in ('stamps_user_id_fkey','entries_user_id_fkey','visas_user_id_fkey')
              and c.confrelid = 'public.profiles'::regclass) = 3
      and (select count(*) from pg_policies
            where schemaname = 'public'
              and (coalesce(qual, '') like '%is_cadre%'
                or coalesce(with_check, '') like '%is_cadre%')) = 18
      and (select prosrc from pg_proc where proname='handle_new_user') like '%invalid_invite%'
      and (select count(*) from stamps) = 0
      and (select count(*) from entries) = 0
      and (select count(*) from visas) = 0
    then 'PASS' else 'FAIL' end as 結果

  union all select 1, 'profiles 的人數 = passports 的人數', '2 = 2',
    (select count(*) from profiles)::text || ' = ' || (select count(*) from passports)::text,
    case when (select count(*) from profiles) = (select count(*) from passports)
          and (select count(*) from profiles) = 2 then 'PASS' else 'FAIL' end

  union all select 2, '四個欄位逐列搬對了（不是只數列數）', '0 列不一致',
    (select count(*) from profiles p join passports q using (id)
      where p.name_zh is distinct from q.name_zh or p.name_en is distinct from q.name_en
         or p.team is distinct from q.team or p.avatar is distinct from q.avatar)::text || ' 列不一致',
    case when (select count(*) from profiles p join passports q using (id)
      where p.name_zh is distinct from q.name_zh or p.name_en is distinct from q.name_en
         or p.team is distinct from q.team or p.avatar is distinct from q.avatar) = 0
    then 'PASS' else 'FAIL' end

  union all select 3, '既有的人都是 cadre', '0 個不是',
    (select count(*) from profiles where role <> 'cadre')::text || ' 個不是',
    case when (select count(*) from profiles where role <> 'cadre') = 0 then 'PASS' else 'FAIL' end

  -- 這四條直接查權限目錄，不用 has_table_privilege / has_column_privilege。
  -- 理由：那兩個函式在「只發了欄位層級」時各自回什麼，我沒有在這個資料庫上實測過，
  -- 而一條建立在沒驗證過的語意上的斷言，綠燈不代表任何事情。
  -- relacl 是表層級的授權、attacl 是欄位層級的授權，兩者分開存，查得到就是真的有。
  union all select 4, '表層級的 UPDATE 已經收掉', '0 筆',
    (select count(*) from pg_class c, aclexplode(c.relacl) x
      where c.oid = 'public.profiles'::regclass
        and x.grantee = 'authenticated'::regrole and x.privilege_type = 'UPDATE')::text || ' 筆',
    case when (select count(*) from pg_class c, aclexplode(c.relacl) x
      where c.oid = 'public.profiles'::regclass
        and x.grantee = 'authenticated'::regrole and x.privilege_type = 'UPDATE') = 0
    then 'PASS' else 'FAIL' end

  -- ★ 這一條是集合相等，不是「有沒有包含」。多發一欄（例如 role）跟少發一欄
  -- 都會讓它變紅 —— 只檢查「role 不在裡面」的話，哪天多發了 updated_at 不會有人知道。
  union all select 5, '★ 可改的欄位剛好是那四欄（§3-1 那個洞）', 'avatar,name_en,name_zh,team,tz',
    coalesce((select string_agg(distinct a.attname, ',' order by a.attname)
                from pg_attribute a, aclexplode(a.attacl) x
               where a.attrelid = 'public.profiles'::regclass
                 and x.grantee = 'authenticated'::regrole and x.privilege_type = 'UPDATE'),
             '（一欄都沒發）'),
    case when (select string_agg(distinct a.attname, ',' order by a.attname)
                 from pg_attribute a, aclexplode(a.attacl) x
                where a.attrelid = 'public.profiles'::regclass
                  and x.grantee = 'authenticated'::regrole and x.privilege_type = 'UPDATE')
              = 'avatar,name_en,name_zh,team,tz'
    then 'PASS' else 'FAIL' end

  union all select 6, '需要認 cadre 的政策數', '18 條',
    (select count(*) from pg_policies where schemaname = 'public'
       and (coalesce(qual,'') like '%is_cadre%' or coalesce(with_check,'') like '%is_cadre%'))::text || ' 條',
    case when (select count(*) from pg_policies where schemaname = 'public'
       and (coalesce(qual,'') like '%is_cadre%' or coalesce(with_check,'') like '%is_cadre%')) = 18
    then 'PASS' else 'FAIL' end

  union all select 7, 'entries 四條仍然綁 auth.uid()（角色是加一層，不是換掉）', '4 條',
    (select count(*) from pg_policies where schemaname='public' and tablename='entries'
       and (coalesce(qual,'') like '%auth.uid%' or coalesce(with_check,'') like '%auth.uid%'))::text || ' 條',
    case when (select count(*) from pg_policies where schemaname='public' and tablename='entries'
       and (coalesce(qual,'') like '%auth.uid%' or coalesce(with_check,'') like '%auth.uid%')) = 4
    then 'PASS' else 'FAIL' end

  union all select 8, '三條外鍵都指向 profiles', '3 條',
    (select count(*) from pg_constraint c
      where c.conname in ('stamps_user_id_fkey','entries_user_id_fkey','visas_user_id_fkey')
        and c.confrelid = 'public.profiles'::regclass)::text || ' 條',
    case when (select count(*) from pg_constraint c
      where c.conname in ('stamps_user_id_fkey','entries_user_id_fkey','visas_user_id_fkey')
        and c.confrelid = 'public.profiles'::regclass) = 3 then 'PASS' else 'FAIL' end

  union all select 9, '★ 守門還在：trigger 仍會擋無效邀請碼', '有 invalid_invite',
    case when (select prosrc from pg_proc where proname='handle_new_user') like '%invalid_invite%'
         then '有' else '不見了' end,
    case when (select prosrc from pg_proc where proname='handle_new_user') like '%invalid_invite%'
         then 'PASS' else 'FAIL' end

  union all select 10, 'role 的 default 這一步仍是 cadre', 'cadre',
    coalesce((select column_default from information_schema.columns
               where table_schema='public' and table_name='profiles' and column_name='role'), '（無）'),
    case when (select column_default from information_schema.columns
                where table_schema='public' and table_name='profiles' and column_name='role')
              like '%cadre%' then 'PASS' else 'FAIL' end

  union all select 11, 'passports 的舊欄位一個都沒 drop', '4 欄都在',
    (select count(*) from information_schema.columns
      where table_schema='public' and table_name='passports'
        and column_name in ('name_zh','name_en','team','avatar'))::text || ' 欄',
    case when (select count(*) from information_schema.columns
      where table_schema='public' and table_name='passports'
        and column_name in ('name_zh','name_en','team','avatar')) = 4 then 'PASS' else 'FAIL' end

  union all select 12, '章／心得／入境章仍然是 0 列（沒被動到）', '0 / 0 / 0',
    (select count(*) from stamps)::text || ' / ' || (select count(*) from entries)::text
      || ' / ' || (select count(*) from visas)::text,
    case when (select count(*) from stamps) = 0 and (select count(*) from entries) = 0
          and (select count(*) from visas) = 0 then 'PASS' else 'FAIL' end
) x order by ord;
