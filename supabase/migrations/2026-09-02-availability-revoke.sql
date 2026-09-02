-- 看板兩張表的授權修補。2026-09-02，接在 2026-09-02-availability.sql 後面。
--
-- ── 為什麼需要這一份 ──
-- 那份 migration 只寫了 grant，沒有先 revoke。而 Supabase 在 public schema 上
-- 設了 default privileges：**每一張新建的表都自動 grant arwdDxtm（全部權限）
-- 給 anon、authenticated、service_role。**
--
-- 所以那份裡的 `grant select, insert, delete` 是裝飾品 —— 它沒有讓任何權限消失。
-- 實際跑出來的 ACL：
--   availability | anon=arwdDxtm, authenticated=arwdDxtm
-- 三個後果：
--   1. authenticated 有 update 權限，而「availability 沒有 update 這條路」
--      是這個設計刻意要成立的事（驗收 205 抓到）
--   2. authenticated 改得動 availability_meta.updated_at，
--      那個欄位是「超過 30 天標紅」的依據，改得動等於可以讓自己永遠是綠的（207 抓到）
--   3. **anon 對兩張表有 select 與 insert。** 它現在之所以還是進不來，
--      是因為早先的 migration 把 is_cadre() 的 execute 從 anon 收回了，
--      於是政策一評估就報 permission denied for function is_cadre ——
--      未登入的人是被一個**意外**擋住的，不是被設計擋住的。
--      那種保護只要有人哪天把 is_cadre 開放給 anon 就會消失，而且不會有人發現。
--
-- ── 這個坑 repo 裡已經寫過了 ──
-- 2026-08-31-profiles-and-role.sql 第 136 行：
--   「不先 revoke 的話，下面的欄位層級 grant 只是裝飾 —— 表層級的 UPDATE 還在」
-- 那一份做對了（revoke all on profiles from anon, authenticated），
-- 我抄了它的 grant 那一段，沒抄它的 revoke。
--
-- **以後在這個資料庫建任何一張表，都要先 revoke 再 grant。**

begin;

-- 先全部收回，再給回需要的。順序不能反。
revoke all on public.availability      from anon, authenticated;
revoke all on public.availability_meta from anon, authenticated;

-- authenticated 要的：讀、寫自己的、刪自己的。**沒有 update。**
grant select, insert, delete   on public.availability      to authenticated;
grant select, insert           on public.availability_meta to authenticated;
-- 只有這一欄。updated_at 不在裡面，那是 trigger 與 confirm_availability_unchanged()
-- 的職責（見主檔那條欄位註解）。
grant update (notice_seen_at)  on public.availability_meta to authenticated;

-- anon 什麼都不給。看板的讀取政策是 is_cadre()，未登入的人本來就不該碰到這兩張表，
-- 而「政策會擋」跟「他連權限都沒有」是兩層 —— 兩層都要在。
-- （不寫 revoke ... from anon 也可以，上面那兩句已經收乾淨了；
--   這裡不再 grant 任何東西給 anon，就是刻意的。）

commit;
