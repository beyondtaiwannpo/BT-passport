#!/usr/bin/env bash
# BT Passport 靜態檢查。對應 spec §11 的視覺項與金鑰項。
# 用法：./check.sh
#
# 寫新檢查前讀這段（2026-08-25，同一個坑咬過四次）：
# 「必須存在」型的 grep 守門一律要錨定到程式碼的完整形式（行首空白 + 完整的
# 選擇器/呼叫），不要只 grep 一個裸字串。理由：這個 repo 的註解習慣解釋規則
# 本身（例如「修法是 min-width:0 加上 overflow-wrap:anywhere」），註解裡的
# 敘述句會含有跟真正宣告一樣的字面，於是「grep -q 那個字串」會被註解餵飽，
# 就算把宣告本身刪掉，守門依然回報 ok —— 而且是安靜地壞，不會像下面「必須不
# 存在」型的守門那樣因為誤報 FAIL 而當場被發現。2026-08-25 實測過：
# overflow-wrap:anywhere 那條就這樣壞掉，直到專門的破壞測試才抓到。
# 「必須不存在」型的守門（grep 到就 bad）不受這個坑影響：註解污染只會讓它
# 誤報 FAIL，那個方向是安全的，不用特別錨定。
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
if grep -qE '^\s*:where\(#bt-root button\)\{' index.html; then
  ok "按鈕 reset 是零特異性（:where）"
else
  bad "index.html 的按鈕 reset 不是 :where(#bt-root button)，全站 class 規則會被蓋掉（spec 2026-08-22 §1）"
fi

# 月份頁的時刻放大只能掛在 .mtheme.clock b 上。直接改 .mtheme b 的話，
# 資料頁右上角的「BEYOND TAIWAN / Passport · 2026」會跟著變 34px 把版面撐爆 ——
# 而那是一個沒有任何東西會報錯的視覺回歸。2026-08-22 實測過：把選擇器改回
# .mtheme b 之後，check.sh 與全部單元測試都還是綠的，所以需要這兩條。
# 單元測試碰不到這件事：它是 CSS 級聯，要真的瀏覽器才量得出 computed style。
if grep -qE '^\s*\.mtheme\.clock b\{' index.html; then
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
if grep -qE '^\s*\.slots\.guide \.slot \.ttl\{' index.html; then
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
if grep -qE '^\s*<button class="btn sm quiet" data-act="reset">' src/ui.js; then
  ok "清除護照的按鈕維持降級外觀（.btn.quiet）"
else
  bad "src/ui.js 的「清除這本護照」不是 class=\"btn sm quiet\"，它會跟可逆操作等重"
fi

if grep -qE '^\s*\.btn\.quiet\{' index.html; then
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
# ── 2026-08-26 改寫。這條守門自己踩了 README 第 12 項 ──
# 原本的寫法是「`firstError([mo, ac, pa, st, en])` 這個字面必須出現兩次」。
# 它想守的是「ms 不准進清單」，斷言的卻是「清單長得跟當時一模一樣」。
# 於是 2026-08-26 依規格 §9.4 把 destinations 與 visas 加進清單（那兩張表**應該**
# 進去，理由見 data.js 的註解）時，這條無辜地 FAIL 了 —— 而 FAIL 的理由跟它
# 保護的東西無關。這是 README 第 12 項的第四個實例，而且發生在守門這一側。
#
# 改成守它真正在意的三件事：出現兩次、兩次一模一樣、兩次都不含 ms。
# 清單裡有幾個、叫什麼名字，都不關這條守門的事。
#
# 用 grep -o | wc -l 數出現次數，不用 grep -c —— grep -c 數的是「符合的行數」，
# 兩處寫在同一行的話只算 1。這裡 grep -o 讓每一筆自成一行，所以後面用
# `sort -u | wc -l` 數「有幾種不同的寫法」是安全的。
# 先剝掉整行註解再抓。這個 repo 的註解會解釋規則本身（data.js 那段就在講
# 「不要把 ms 加進 firstError」），註解裡遲早會出現這個字面。不剝的話，
# 一個「讓註解說實話」的 commit 會把守門弄紅 —— 方向是安全的（誤報而不是
# 放行，見 README 第 10 項），但讓文件弄壞建置沒有必要。
fe=$(grep -v '^[[:space:]]*//' src/data.js | grep -o 'firstError(\[[^]]*\])')
n=$(printf '%s\n' "$fe" | grep -c 'firstError')
kinds=$(printf '%s\n' "$fe" | sort -u | grep -c 'firstError')
if [ "$n" = "2" ] && [ "$kinds" = "1" ] && ! printf '%s\n' "$fe" | grep -qE '(\[|, )ms(\]|,)'; then
  ok "loadAll 的 firstError 兩處一致且不含 milestones"
else
  bad "src/data.js 的 firstError 出了問題：要嘛不是兩處、兩處不一樣，要嘛 milestones 被加進去了"
  printf '%s\n' "$fe" | sed 's/^/      /'
fi

# boot() 必須整包裝填，不可以退回手寫逐欄指派。手寫的話 loadAll 每多回傳一個東西
# 就要記得加一行，而那件事已經漏過 —— milestones 從上線起就沒被裝進 S，
# 里程碑 UI 在正式站上是死的，而 (S.milestones || []) 的防呆讓它安靜地不渲染，
# 所以沒有人發現（2026-08-25）。單元測試碰不到：main.js 一條測試都沒有。
if grep -qE '^\s*Object\.assign\(S, all\);' src/main.js; then
  ok "boot() 整包裝填 loadAll 的結果"
else
  bad "src/main.js 的 boot() 不是 Object.assign(S, all)，新欄位會靜靜地不進 S"
fi

# 長英文字串與網址會把 grid 的 1fr 撐開，三格寬度重新分配（實測 158/633/129，
# 正常是 282 三等分）。修法是 .slot 的 min-width:0 加上內容的 overflow-wrap:anywhere。
#
# 2026-08-25 實測推翻了「兩個缺一不可」這個原本的說法：單獨的 overflow-wrap:anywhere
# 就足以讓三欄維持 282/282/282（它會被計入 min-content 尺寸計算，不同於舊式的
# word-break:break-word）；只留 min-width:0 的話欄寬也不會壞，但文字不斷行、
# 溢出格子邊界約 308px——換一種形狀的視覺 bug，不是「缺一不可」。
# 兩個都留是防禦深度：overflow-wrap 只斷得了文字，min-width:0 擋的是斷不了的東西
# （比格子寬的圖、<pre>、white-space:nowrap 的元素），兩者擋的是不同的東西，
# 只是在「長英文字串」這個案例上剛好重疊，所以兩個條件都要成立才 ok。
#
# 這條本身在 2026-08-25 審查中被抓到一個 Critical：overflow-wrap:anywhere 這個
# 字面在上面的註解裡出現了三次，而原本的 grep 沒有錨定行首——註解把守門餵飽，
# 就算把 369 行 .slot .note,.slot .hint{overflow-wrap:anywhere} 那條宣告整行
# 刪掉，check.sh 依然印 ok。現在錨定到宣告的完整形式（行首空白 + 選擇器 +
# {overflow-wrap:anywhere}），敘述句裡的字面無論怎麼寫都不會命中。
#
# 單元測試碰不到這件事（是版面寬度，要真瀏覽器才量得到），而且它不會有橫向捲軸、
# 不像跑版，只像「某一格怪怪的」，人工也不容易發現。
if grep -qE '^\s*min-width:0;' index.html && grep -qE '^\s*\.slot \.note,\.slot \.hint\{overflow-wrap:anywhere\}' index.html; then
  ok "長字串不會撐開格子（min-width:0 防斷不了的內容、overflow-wrap:anywhere 防長字串）"
else
  bad "index.html 少了 min-width:0 或 .slot .note,.slot .hint{overflow-wrap:anywhere} 這條宣告本身——兩個都沒有時長英文字串會撐寬格子；只少 overflow-wrap（min-width:0 還在）不會撐寬，是文字溢出格子邊界"
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

# prefers-reduced-motion 的涵蓋率。**這是無障礙需求不是視覺偏好**，所以由機器守門，
# 不只寫在 CSS 裡（使用者 2026-08-25 的裁定）。
# 2026-08-18 那次 .overprint.land 漏在 reduce 之外，是人工逐條比對才抓到的 ——
# 它只在集滿 33 格那一刻出現，平常測不到。這支讓那件事不可能再發生。
if command -v node >/dev/null 2>&1; then
  motion=$(node check-motion.mjs 2>&1)
  if [ $? -eq 0 ]; then
    ok "reduced-motion 涵蓋所有動畫（${motion}）"
  else
    bad "有動畫沒有被 prefers-reduced-motion 關掉："
    printf '%s\n' "$motion"
  fi
else
  bad "找不到 node，reduced-motion 檢查沒有跑到（這不是通過）"
fi

# CNAME 不可掉
if [ -f CNAME ]; then
  ok "CNAME 存在"
else
  bad "CNAME 不見了，自訂網域會掉（spec §8）"
fi

[ $fail -eq 0 ] && say "" && say "全部通過。" || { say ""; say "有項目未通過。"; }
exit $fail
