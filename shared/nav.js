// 站台的頂欄。每一個登入後的頁面都畫這一條，長得一樣。
//
// ── 這裡是功能清單唯一的來源 ──
// 頂欄的項目與 /app/ 的選單卡片都從 FEATURES 產生。之後多一個功能就是在這裡
// 多一筆，不是改 HTML。兩份清單的話，漏加的那一頁不會壞、只會少一個入口，
// 而那種缺陷沒有人會回報 —— 使用者只會以為那個功能還沒做。
//
// roles 是誰看得到。學員（student）目前一項都看不到，所以他的頂欄只有
// logo、名字、登出 —— **列照樣畫，只是空的**。不整條藏起來的理由：
// 他知道自己在這個站裡、只是還沒有功能，而不是懷疑頁面壞了；
// 而且之後開放給學員的功能只要在 roles 加 "student"，列就自動長出來，
// 不用另外設計一條路徑。過濾在這裡做，不在各頁做 —— 漏做的頁面不會壞、
// 只會多一個點了會被彈回來的入口。
//
// **這個檔案不准 import 任何功能資料夾的東西**（passport/、availability/、app/）。
// shared/ 的依賴方向只能往下；反過來的話，護照壞掉會讓每一頁的頂欄一起壞。
export const FEATURES = [
  { key: "passport",     label: "護照",     href: "/passport/",     roles: ["cadre"],
    title: "幹部護照",     desc: "這一年的活動、章、心得與照片" },
  { key: "availability", label: "時間看板", href: "/availability/", roles: ["cadre"],
    title: "每週時間看板", desc: "填自己每週固定有空的時段，約會議時直接挑" },
];

export function featuresFor(role) {
  return FEATURES.filter(f => f.roles.includes(role));
}

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// current：現在在哪一個功能（FEATURES 的 key），會被標成當前。
// role：看的人的角色。name：顯示在右邊的名字。
//
// 頂欄是米白底（見 nav.css 檔頭：深藍是點綴色，整條鋪滿等於把它當主色用），
// 所以 logo 直接坐在上面，不需要另外墊一塊——它本來就是為這個紙色設計的。
export function navHTML({ current, role, name }) {
  const items = featuresFor(role).map(f =>
    `<a href="${f.href}"${f.key === current ? ' aria-current="page"' : ""}>${esc(f.label)}</a>`).join("");
  const n = String(name || "");
  return `<nav class="btnav" aria-label="站台導覽">
    <a class="btnav-logo" href="/app/" aria-label="回到入口"><img src="/shared/logo.png" alt="Beyond Taiwan" width="386" height="191"></a>
    <div class="btnav-items">${items}</div>
    <span class="btnav-sp"></span>
    ${n ? `<span class="btnav-who" title="${esc(n)}"><span class="full">${esc(n)}</span><span class="short">${esc([...n][0])}</span></span>` : ""}
    <button class="btnav-out" data-act="signout">登出</button>
  </nav>`;
}
