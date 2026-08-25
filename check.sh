#!/usr/bin/env bash
# BT Passport 靜態檢查。對應 spec §11 的視覺項與金鑰項。
# 用法：./check.sh
set -u
fail=0
say() { printf '%s\n' "$1"; }
bad() { printf 'FAIL  %s\n' "$1"; fail=1; }
ok()  { printf 'ok    %s\n' "$1"; }

FILES="index.html src activities.json"

# §11-6 secret key 絕不可入庫。兩支各自獨立回報（不是 elif）——
# 一支沒抓到，不能蓋掉另一支抓到的事。

# sb_secret_ leg：全 repo 掃，不排除任何目錄（含 docs/、.superpowers/、
# check.sh 自己）。真金鑰的字首後面一定接著一長串英數字元；pattern 要求字首後
# 緊接 8 碼以上連續英數，規劃文件用白話文提到這個字首時（例如反引號、刪節號、
# 空格、`\|`）湊不出這個長度，所以不需要也不應該排除任何目錄。
if grep -rIEq --exclude-dir=.git 'sb_secret_[A-Za-z0-9]{8,}' . ; then
  bad "§11-6 repo 裡出現 sb_secret_ 金鑰"
  grep -rInE --exclude-dir=.git 'sb_secret_[A-Za-z0-9]{8,}' .
else
  ok "§11-6 沒有 sb_secret_ 金鑰"
fi

# service_role leg：這個字全 repo 掃一定會撞到 spec/plan 文件討論它的地方——
# 它是一個合法英文詞，規劃文件會直接當名詞寫，前後沒有能拿來過濾字元數的東西。
# 所以縮小到真的會被部署出去的範圍：index.html、src/、activities.json、
# .github/（現在還不存在；用 -d 判斷要不要加進掃描清單，不讓「路徑不存在」
# 這件事把 grep 的錯誤結束碼跟「沒掃到東西」混在一起，害這支檢查誤判成通過）。
# 不掃 docs/、.superpowers/、vendor/（vendor 之後會放 supabase-js，原始碼裡
# service_role 是 API 的一部分）。
service_scope="index.html src activities.json"
[ -d .github ] && service_scope="$service_scope .github"
if grep -rIq service_role $service_scope 2>/dev/null; then
  bad "§11-6 repo 裡出現 service_role"
  grep -rIn service_role $service_scope 2>/dev/null
else
  ok "§11-6 沒有 service_role"
fi

# §11-14 只有三色。抓所有 #hex，扣掉三個允許值。
stray=$(grep -rhIo '#[0-9A-Fa-f]\{3,8\}\b' $FILES 2>/dev/null \
        | tr 'a-f' 'A-F' | sort -u \
        | grep -v '^#FFC46C$' | grep -v '^#EDE5D8$' | grep -v '^#102A86$')
if [ -n "$stray" ]; then
  bad "§11-14 出現不允許的色碼："
  printf '%s\n' "$stray"
else
  ok "§11-14 只有三個色碼"
fi

# §11-14 rgba 只允許三種底色
strayrgba=$(grep -rhIo 'rgba([0-9 ]*,[0-9 ]*,[0-9 ]*,[^)]*)' $FILES 2>/dev/null \
        | sed 's/ //g' | sort -u \
        | grep -v '^rgba(16,42,134,' | grep -v '^rgba(255,196,108,' | grep -v '^rgba(255,255,255,')
if [ -n "$strayrgba" ]; then
  bad "§11-14 出現不允許的 rgba："
  printf '%s\n' "$strayrgba"
else
  ok "§11-14 rgba 只用允許的三個底色"
fi

# §11-14 不允許 rgb()/hsl()（三色只能用 hex 或上面那三種 rgba 底色定義；
# rgb( 這個 pattern 天生不會誤吃 rgba( ——"rgb" 後面緊接的是 "a" 不是 "("，
# 所以不用另外排除）。
strayfunc=$(grep -rhIoE 'rgb\([^)]*\)|hsl\([^)]*\)' $FILES 2>/dev/null | sort -u)
if [ -n "$strayfunc" ]; then
  bad "§11-14 出現不允許的 rgb()/hsl()："
  printf '%s\n' "$strayfunc"
else
  ok "§11-14 沒有 rgb()/hsl()"
fi

# §11-15 不載入中文網頁字體
if grep -rIq '@font-face' $FILES 2>/dev/null; then
  bad "§11-15 出現 @font-face，不得自行載入字體"
else
  ok "§11-15 沒有 @font-face"
fi
fontreq=$(grep -rhIo 'fonts.googleapis.com/css2?[^"]*' $FILES 2>/dev/null)
if printf '%s' "$fontreq" | grep -qi 'Noto\|Source+Han\|CJK\|TC\b'; then
  bad "§11-15 Google Fonts 請求含中文字體：$fontreq"
else
  ok "§11-15 字體請求只有 Barlow Condensed 與 Inter"
fi

# §10-1 分類代碼。排除 SVG 濾鏡的 xChannelSelector="R" / yChannelSelector="G"
# ——這是原型就有、蓋章要用的墨水紋理效果，不是分類代碼。只濾掉
# ChannelSelector="X" 這個精確片段，不是整行都不看，避免真的分類代碼殘留
# 剛好跟這段 SVG 擠在同一行時被一起蓋過去。
catcodes=$(grep -rnIE '"[GPF]"' $FILES 2>/dev/null | grep -v 'ChannelSelector="[PGF]"')
if [ -n "$catcodes" ]; then
  bad "§10-1 還有原型的 G/P/F 分類代碼："
  printf '%s\n' "$catcodes"
else
  ok "§10-1 分類代碼已統一"
fi

# §10-2 33 格
if grep -rIq '36 格' $FILES 2>/dev/null; then
  bad "§10-2 還有『36 格』的文案"
else
  ok "§10-2 沒有 36 格"
fi

# §10-3 進度牆 11 欄。容忍 repeat(12,1fr) 與 repeat(12, 1fr) 這類空白差異。
if grep -rIqE 'repeat\(\s*12\s*,' $FILES 2>/dev/null; then
  bad "§10-3 .track 還是 12 欄"
else
  ok "§10-3 .track 不是 12 欄"
fi

# §11-20 不得出現個人聯絡方式：檢查除了組織信箱以外的 email
mails=$(grep -rhIo --exclude-dir=vendor '[A-Za-z0-9._%+-]*@[A-Za-z0-9.-]*\.[A-Za-z]\{2,\}' $FILES 2>/dev/null \
        | sort -u | grep -v '^beyondtaiwan2020@gmail.com$' | grep -v 'example.com$')
if [ -n "$mails" ]; then
  bad "§11-20 出現非組織信箱："
  printf '%s\n' "$mails"
else
  ok "§11-20 只有組織信箱"
fi

# 按鈕 reset 必須是零特異性。裸寫 #bt-root button 的特異性 (1,0,1) 會蓋掉所有
# 用 class 描述外觀的規則，全站按鈕的邊框與底色會靜靜地全部消失 ——
# 不會報錯，只是東西不見了，而 .dots 只剩 aria-current 的 outline 撐著一顆圓點。
# 這個站從原型到 2026-08-22 都是這個狀態。見 spec 2026-08-22 §1。
if grep -q ':where(#bt-root button)' index.html; then
  ok "按鈕 reset 是零特異性（:where）"
else
  bad "index.html 的按鈕 reset 不是 :where(#bt-root button)，全站 class 規則會被蓋掉（spec 2026-08-22 §1）"
fi

# 月份頁的時刻放大只能掛在 .mtheme.clock b 上。直接改 .mtheme b 的話，
# 資料頁右上角的「BEYOND TAIWAN / Passport · 2026」會跟著變 34px 把版面撐爆 ——
# 而那是一個沒有任何東西會報錯的視覺回歸。2026-08-22 實測過：把選擇器改回
# .mtheme b 之後，check.sh 與全部單元測試都還是綠的，所以需要這兩條。
# 單元測試碰不到這件事：它是 CSS 級聯，要真的瀏覽器才量得出 computed style。
if grep -q '\.mtheme\.clock b{' index.html; then
  ok "時刻放大掛在 .mtheme.clock b 上"
else
  bad "index.html 找不到 .mtheme.clock b，時刻放大可能被改到 .mtheme b（spec 2026-08-22 §5.2）"
fi

# 基底規則不可以帶放大值。抓的是「.mtheme b{...}」這一行裡出現 34px。
if grep -E '^\s*\.mtheme b\{' index.html | grep -q '34px'; then
  bad "index.html 的 .mtheme b 帶了 34px，資料頁右上角會被撐爆（spec 2026-08-22 §5.2）"
else
  ok ".mtheme b 沒有被塞進放大值"
fi

# 說明頁三張卡的標題要固定兩行高，否則使用者刻意寫成同樣開頭的第一句會錯開。
# 這件事單元測試碰不到（是版面高度，要真瀏覽器才量得到），只能在這裡守著寫法。
if grep -q '\.slots\.guide \.slot \.ttl{' index.html; then
  ok "說明頁標題固定兩行高（.slots.guide .slot .ttl）"
else
  bad "index.html 找不到 .slots.guide .slot .ttl，說明頁三張卡的第一句會錯開（spec 2026-08-22 §4.2）"
fi

# 底紋的 SVG 不可以用 %23 編碼的色碼。%23102A86 能正常載入，但 §11-14 的 hex 掃描
# 看不到它 —— 等於整段底紋悄悄脫離三色檢查的守備範圍。改用 rgba(16,42,134,α) 就沒這問題
# （未編碼的 # 不能用：它會被當成 data URI 的 fragment，圖直接不載入，2026-08-23 實測）。
if grep -q '%23' index.html; then
  bad "index.html 出現 %23 編碼的色碼，三色檢查看不到它（改用 rgba(16,42,134,α)）"
  grep -n '%23' index.html
else
  ok "沒有 %23 編碼的色碼，三色檢查涵蓋得到底紋"
fi

# 「清除這本護照」必須維持降級的外觀。它會刪掉一整年的章、心得與照片且不可復原，
# 跟旁邊三顆可逆的操作長得一樣重的話，遲早有人手滑按到。
# 這不是視覺偏好是安全設計 —— 視覺偏好可以被下一個人推翻，安全設計不行，所以釘住它。
if grep -q 'class="btn sm quiet" data-act="reset"' src/ui.js; then
  ok "清除護照的按鈕維持降級外觀（.btn.quiet）"
else
  bad "src/ui.js 的「清除這本護照」不是 class=\"btn sm quiet\"，它會跟可逆操作等重"
fi

if grep -q '\.btn\.quiet{' index.html; then
  ok ".btn.quiet 的樣式定義還在"
else
  bad "index.html 找不到 .btn.quiet 的樣式，那顆按鈕會退回一般外觀"
fi

# loadAll 的 firstError 清單必須維持五個查詢，**不可以包含 milestones**。
# 其他五個是「任一失敗就整批失敗」，理由是少了 stamps 的畫面看起來像「一個章都沒蓋」，
# 學生會以為紀錄不見了然後重蓋一次。milestones 不一樣：讀不到就是沒有里程碑 UI，
# 不會誤導任何人；而且這讓部署順序不再有先後 —— 前端先上、SQL 還沒跑時查詢會 404，
# 護照照常運作。把 ms 加進那個清單，會讓「SQL 還沒跑」變成整站壞掉。
# 單元測試碰不到這件事：data.js 在 module scope 建 supabase client，
# 沒有網路 stub 就測不到錯誤分支。2026-08-25 實測過：把 ms 加進去，37 個測試全綠。
# 用 grep -o | wc -l 數出現次數，不用 grep -c —— grep -c 數的是「符合的行數」，
# 兩處寫在同一行的話 grep -c 只算 1，會把「併成一行」誤判成「只剩一處」而 FAIL
# （這條要求剛好是 2，所以那個誤判方向是安全的：誤報而不是放行，但跟下面
# 「只准數一次」那條的寫法不一致會讓人以為兩條規則不同，所以一起改成同一種數法）。
n=$(grep -o 'firstError(\[mo, ac, pa, st, en\])' src/data.js | wc -l | tr -d ' ')
if [ "$n" = "2" ] && ! grep -q 'firstError(\[mo, ac, pa, st, en, ms\])' src/data.js; then
  ok "loadAll 的 firstError 清單不含 milestones"
else
  bad "src/data.js 的 firstError 清單被動過，milestones 失敗會拖垮整本護照"
fi

# 章的數量整個 src/ui.js 只准數一次，就是 milestoneState 裡那次。
# barHTML 的「N / 33」、idPageHTML 的 FULL 疊印、里程碑的達成判斷，全部吃它的結果。
# 這條守的是架構不是行為，測試碰不到：兩邊各自用同一條公式算一次的話，
# 算出來永遠一樣，任何比對結果的測試都會是綠的（2026-08-25 實測，42 個測試全綠）。
# 真正會出事的是有人只改了其中一處的定義 —— 那時候畫面上兩個數字會不一致，
# 而沒有任何東西會報錯。
# 用 grep -o | wc -l 數出現次數，不用 grep -c —— grep -c 數的是「符合的行數」，
# 把兩次出現寫在同一行（例如加一個 sneaky 變數重複算一次，塞進同一行）會讓
# grep -c 回 1，這條檢查就會誤判成「只有一處」而放行，對它要擋的東西沒有效果
# （2026-08-25 審查實測過）。tr -d ' ' 是因為 macOS 的 wc -l 會補前導空白，
# 不去掉的話字串比對永遠對不上。
n=$(grep -o 'Object\.keys(S\.stamps)\.length' src/ui.js | wc -l | tr -d ' ')
if [ "$n" = "1" ]; then
  ok "章的數量只在 milestoneState 裡數一次"
else
  bad "src/ui.js 有 $n 處在數 S.stamps，應該只有 milestoneState 那一處"
  grep -n 'Object\.keys(S\.stamps)\.length' src/ui.js
fi

# 單元測試。node 不在的話**算失敗不算通過** —— 「沒跑到」跟「跑過而且過了」
# 在一支檢查腳本裡長得一模一樣，那正是最容易騙過自己的地方。
#
# **參數要寫成 test/*.test.mjs，不要寫成 test/。** 實測（node 24.17.0）：
# `node --test test/` 不會遞迴進目錄，它把目錄本身當成一支測試檔去執行，
# 然後 MODULE_NOT_FOUND —— 而那個失敗長得像「測試沒過」，不像「指令寫錯」。
if command -v node >/dev/null 2>&1; then
  if node --test test/*.test.mjs >/dev/null 2>&1; then
    ok "單元測試通過（node --test test/*.test.mjs）"
  else
    bad "單元測試沒過。跑 node --test test/*.test.mjs 看細節"
  fi
else
  bad "找不到 node，單元測試沒有跑到（這不是通過）"
fi

# CNAME 不可掉
if [ -f CNAME ]; then
  ok "CNAME 存在"
else
  bad "CNAME 不見了，自訂網域會掉（spec §8）"
fi

[ $fail -eq 0 ] && say "" && say "全部通過。" || { say ""; say "有項目未通過。"; }
exit $fail
