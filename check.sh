#!/usr/bin/env bash
# BT Passport 靜態檢查。對應 spec §11 的視覺項與金鑰項。
# 用法：./check.sh
set -u
fail=0
say() { printf '%s\n' "$1"; }
bad() { printf 'FAIL  %s\n' "$1"; fail=1; }
ok()  { printf 'ok    %s\n' "$1"; }

FILES="index.html src"

# §11-6 secret key 絕不可入庫。sb_secret_ 全 repo 掃（真金鑰不可能合法出現在
# vendor 裡）；service_role 排除 vendor/（supabase-js 原始碼含這個字，是 API
# 的一部分，之後 vendor/ 進來會誤報）。
# 兩者都排除 check.sh 自己（腳本原始碼裡就寫著這兩個字串當 grep pattern，
# 不排除的話腳本永遠會抓到自己）和 docs/、.superpowers/（規劃文件用白話文
# 說明金鑰命名規則，不是真的金鑰；spec §11-6 的「全 repo 含 git 歷史零命中」
# 是上線前的人工稽核步驟，不是這個自動腳本要覆蓋的範圍）。
SECRET_EXCL="--exclude-dir=.git --exclude-dir=docs --exclude-dir=.superpowers --exclude=check.sh"
if grep -rIq $SECRET_EXCL 'sb_secret_' . ; then
  bad "§11-6 repo 裡出現 sb_secret_"
  grep -rIn $SECRET_EXCL 'sb_secret_' .
elif grep -rIq $SECRET_EXCL --exclude-dir=vendor 'service_role' . ; then
  bad "§11-6 repo 裡出現 service_role"
  grep -rIn $SECRET_EXCL --exclude-dir=vendor 'service_role' .
else
  ok "§11-6 沒有 secret key"
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
# ——這是原型就有、蓋章要用的墨水紋理效果，不是分類代碼，"G" 只是誤觸。
catcodes=$(grep -rnIE '"[GPF]"' $FILES 2>/dev/null | grep -v 'ChannelSelector')
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

# §10-3 進度牆 11 欄
if grep -rIq 'repeat(12,1fr)' $FILES 2>/dev/null; then
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

# CNAME 不可掉
if [ -f CNAME ]; then
  ok "CNAME 存在"
else
  bad "CNAME 不見了，自訂網域會掉（spec §8）"
fi

[ $fail -eq 0 ] && say "" && say "全部通過。" || { say ""; say "有項目未通過。"; }
exit $fail
