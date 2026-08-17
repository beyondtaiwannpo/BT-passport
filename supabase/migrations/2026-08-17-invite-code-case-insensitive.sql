-- BT Passport 遷移：邀請碼比對改成「不分大小寫、也不分前後空白」
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。跑完不用重開站台，下一個註冊的人就生效了。
--
-- ---------- 這支會改什麼 ----------
-- 兩件事，其他什麼都不動：
--   1. 幫 invite_codes 加一個唯一索引，索引的不是 code 本身，而是「正規化之後的碼」
--      upper(btrim(code))。從此 bt2026test、BT2026TEST、'  Bt2026Test  ' 被當成同一組碼，
--      不能同時存在兩列。
--   2. 換掉註冊 trigger 用的 handle_new_user()，把裡面的比對從
--        where code = v_code
--      改成
--        where upper(btrim(code)) = upper(btrim(v_code))
--      學生打大寫、打小寫、前後不小心多打了空白，都對得到管理員存的那一組。
--
-- ---------- 為什麼要改 ----------
-- 2026-08-17 出過一次事：管理員建了一組小寫的 bt2026test（uses_left 還有 5），
-- 但前端會偷偷把學生輸入的碼轉成大寫才送出，而資料庫這邊是嚴格比對、分大小寫，
-- 於是每一個學生都被擋在門外，畫面上只說「這個邀請碼不對，或是已經被用完了」。
-- 前端那段轉大寫已經拿掉，站台不再壞掉，但那只是回到「管理員存什麼大小寫，
-- 學生就得打什麼大小寫」—— 而這條規定沒有寫在任何地方，管理員也看不到。
--
-- 所以這次把「大小寫不算數、前後空白也不算數」整件事搬到資料庫來做，一次做完。
-- 連 trim 也搬過來，不是只搬大小寫：上次會出事的根本原因，就是正規化被拆在
-- 前端和資料庫兩層、各做一半，兩邊對不起來。只搬一半等於把同一個坑再挖一次。
-- 前端輸入框仍然會 trim，但那從此只是順手，正確性不再靠它。
--
-- ---------- 對已經有真實資料的資料庫安不安全 ----------
-- 安全，可以直接在正式專案上跑。理由：
--   * 它不會新增、修改或刪除 invite_codes、passports、stamps、entries 的任何一列。
--     現有的邀請碼會原封不動留著，存的是大寫就還是大寫，uses_left 也不會被動到。
--   * 它不會刪表、刪欄位、刪政策。
--   * 可以重複執行。索引是 create unique index if not exists（已經有就整段跳過），
--     函式是 create or replace（直接覆蓋成同樣的內容）。跑第二次、第三次都不會有事。
--   * invite_codes 是一張很小的表（幾十列），建索引只會鎖住它零點幾秒，
--     而且鎖住的期間只有「新註冊」會等一下，不影響已經登入的人看護照。
--
-- ---------- 萬一第 1 段建索引失敗 ----------
-- 如果跑到建索引那一句紅字報錯，訊息裡有 "could not create unique index" 或
-- "duplicate key value violates unique constraint"，那**不是這支遷移壞掉**，
-- 是資料庫在告訴你一件你本來就該知道的事實：你的 invite_codes 裡已經有兩組以上
-- 「只差在大小寫或前後空白」的碼（例如同時存在 bt2026test 和 BT2026TEST）。
-- 這種情況下改成不分大小寫之後，一句 update 有可能一次扣到兩列，
-- 等於一個學生註冊燒掉兩組碼的次數 —— 所以資料庫擋著不讓建，是對的。
--
-- 先跑下面這段，把撞在一起的碼找出來：
--
--   select upper(btrim(code)) as 正規化後的碼,
--          count(*)           as 撞了幾組,
--          array_agg(code)    as 實際存的值,
--          sum(uses_left)     as 剩餘次數合計
--     from invite_codes
--    group by 1
--   having count(*) > 1;
--
-- 查出來之後自己決定要留哪一組：把用不到的那組 delete 掉，或是改成一個不會撞的新名字
-- （改名之前記得先通知拿到那組碼的人）。處理完再把這支遷移整份重跑一次即可。
--
-- 注意 create unique index if not exists 認的是「索引名字」不是「索引內容」：
-- 如果你手上已經有一個同名 invite_codes_code_normalized_key 但內容不一樣的索引，
-- 這一句會安靜跳過、不會幫你更新。正常情況不會遇到，這裡寫出來是免得將來有人踩到。
--
-- ---------- 如果你不是用 SQL Editor，而是用 psql 跑 ----------
-- 請加上 -1（整份包成一個交易）或 -v ON_ERROR_STOP=1。
-- psql 預設是「一句失敗、後面照跑」，萬一第 1 段因為有撞在一起的碼而失敗、
-- 第 2 段卻照樣把函式換掉，就會變成「比對已經不分大小寫，但撞碼還在」——
-- 那正是一次註冊扣掉兩組碼的情況。Supabase SQL Editor 沒有這個問題，
-- 它是整份包在一個交易裡跑的，中間任何一句紅字，整份都會回復原狀。


-- ---------- 0. 先確認沒有撞在一起的碼 ----------
-- 這一段不改任何東西，只是先看一眼。有撞碼的話直接用白話把情況講出來，
-- 比讓下一句吐出 "duplicate key value violates unique constraint" 好懂得多。
-- 沒有撞碼（正常情況、以及第二次重跑）時，這段什麼事都不做。
do $$
declare n int;
begin
  select count(*) into n
    from (select 1 from invite_codes group by upper(btrim(code)) having count(*) > 1) t;
  if n > 0 then
    raise exception
      '這個資料庫裡有 % 組邀請碼「只差在大小寫或前後空白」，要先處理完才能跑這支遷移。'
      '請執行：select upper(btrim(code)), count(*), array_agg(code), sum(uses_left) '
      'from invite_codes group by 1 having count(*) > 1;  '
      '把用不到的那組刪掉或改名之後，再重跑這支遷移。', n;
  end if;
end $$;


-- ---------- 1. 唯一索引 ----------
-- 為什麼一定要有這個索引：下面的 update 是靠 where 條件挑列的，
-- 如果 bt2026test 和 BT2026TEST 同時存在，正規化之後兩列長得一樣，
-- 一句 update 會同時扣掉兩列的 uses_left。有了這個唯一索引，那種狀態就進不來。
-- 順帶一提，它也讓比對變快（PostgreSQL 認得 upper(btrim(code)) 這個表達式索引），
-- 但這只是附加效果，真正的目的是上面那件事。
--
-- 沒有用 concurrently：Supabase SQL Editor 是包在一個交易裡跑的，
-- concurrently 不能在交易裡用。這張表很小，不需要。
create unique index if not exists invite_codes_code_normalized_key
  on invite_codes (upper(btrim(code)));


-- ---------- 2. 註冊 trigger 的比對 ----------
-- 這裡是整份 schema.sql 裡那個 handle_new_user() 的最新版本，
-- create or replace 會直接覆蓋掉舊的。trigger 本身不用重綁，它指到的是函式名字。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer                     -- 用函式擁有者的身分跑，才讀得到對所有人關閉的 invite_codes
set search_path = public, pg_temp    -- 釘死搜尋路徑，別人就沒辦法用同名的暫存表換掉下面的兩張表
as $$
declare v_code text := new.raw_user_meta_data->>'invite';
begin
  -- 檢查與扣減寫成同一句 update ... where uses_left > 0，再用 if not found 判斷。
  -- 分成「先 select 檢查、再 update 扣減」兩句的話，兩個人同時用同一組只剩一次的碼，
  -- 會兩個都通過。這樣寫由資料庫的列鎖擋掉。
  --
  -- 兩邊都套 upper(btrim(...))，缺一不可：
  --   只包右邊（學生打的）→ 管理員存小寫的碼還是對不到。
  --   只包左邊（資料庫存的）→ 學生打小寫還是對不到。
  -- 所以正規化這件事完整地在這一行做完，前端一個字都不用改學生打進來的值。
  --
  -- v_code 是 null（metadata 沒填 invite）的時候，upper(btrim(null)) 還是 null，
  -- null = null 不成立、對不到任何列，會走下面的 raise —— 跟以前的行為一樣。
  update invite_codes set uses_left = uses_left - 1
   where upper(btrim(code)) = upper(btrim(v_code)) and uses_left > 0;
  if not found then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;

  insert into passports(id) values (new.id);
  return new;
end $$;

-- 這個函式只該由 trigger 呼叫，沒有人需要能直接執行它。
-- create or replace 會把權限重設回預設（public 可執行），所以這一句每次都要跟著跑。
revoke execute on function public.handle_new_user() from public, anon, authenticated;


-- ---------- 3. 跑完想確認有沒有生效 ----------
-- 這一段是選用的，不跑也沒關係。跑的話應該看到一列，indexdef 裡有 upper(btrim(code))：
--
--   select indexname, indexdef from pg_indexes
--    where tablename = 'invite_codes';
--
-- 真正的驗收是用一組還有次數的碼，故意用相反的大小寫去註冊一個測試帳號，
-- 確認註冊得成功、而且那組碼的 uses_left 有扣掉 1。
