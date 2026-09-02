// 守門：官網首頁的照片預算與 <img> 屬性。由 check.sh 呼叫。
//
// 為什麼只管 index.html：那是**給不認識 BT 的人在手機上打開的那一頁**，
// 照片大、人在路上、載入慢就關掉了。其他頁面的 <img> 有兩類不適用 ——
// 使用者上傳的頭像與活動照片（passport/src/ui.js）的尺寸在渲染時根本不知道，
// 硬要求 width/height 只會逼人寫假的數字。**範圍寫窄一點，比寫大一點然後
// 為了過關去放寬它好。**
import fs from "node:fs";

export const DIR = "photos";
export const MAX_WEBP = 80 * 1024;     // 單張
export const MAX_JPG  = 120 * 1024;    // 單張（退路，本來就比較大）
// ⚠ **合計要分格式算，不能把 webp 與 jpg 加在一起。**
// 沒有任何瀏覽器會兩種都下載 —— <picture> 只挑一個。
// 加起來算的話那個數字不對應到任何人的實際載入量，
// 而且會逼人為了一個假的上限去壓縮真正在用的那一份。
// 2026-09-02 第一版就是加起來算的，照片一放進去就超標，
// 但真正下載的 webp 那份離上限還很遠。
export const MAX_WEBP_TOTAL = 400 * 1024;   // 幾乎所有人走這條
export const MAX_JPG_TOTAL  = 700 * 1024;   // 舊 iOS 的退路，人少但也要有上限

export function scanFiles(dir = DIR) {
  if (!fs.existsSync(dir)) return { files: [], bad: [] };
  const files = fs.readdirSync(dir).filter(f => /\.(webp|jpg|jpeg|png)$/i.test(f));
  const bad = [];
  const byExt = { webp: 0, jpg: 0 };
  const stems = new Map();
  for (const f of files) {
    const size = fs.statSync(dir + "/" + f).size;
    const ext = f.slice(f.lastIndexOf(".") + 1).toLowerCase();
    if (ext === "webp") byExt.webp += size;
    if (ext === "jpg" || ext === "jpeg") byExt.jpg += size;
    const stem = f.slice(0, f.lastIndexOf("."));
    if (!stems.has(stem)) stems.set(stem, new Set());
    stems.get(stem).add(ext === "jpeg" ? "jpg" : ext);
    const cap = ext === "webp" ? MAX_WEBP : MAX_JPG;
    if (size > cap) bad.push(`${f} ${Math.round(size / 1024)}KB 超過 ${Math.round(cap / 1024)}KB`);
    if (ext === "png") bad.push(`${f} 是 PNG —— 照片要用 webp 加 jpg，PNG 會大好幾倍`);
  }
  // ⚠ 每一張都要有 webp 與 jpg 兩份。只給 webp 的話舊 iOS 會**安靜地不顯示**。
  for (const [stem, exts] of stems) {
    if (!exts.has("webp")) bad.push(`${stem} 少了 .webp`);
    if (!exts.has("jpg"))  bad.push(`${stem} 少了 .jpg（舊 iOS 會看不到圖，而且不會報錯）`);
  }
  if (byExt.webp > MAX_WEBP_TOTAL)
    bad.push(`webp 合計 ${Math.round(byExt.webp / 1024)}KB 超過 ${Math.round(MAX_WEBP_TOTAL / 1024)}KB`);
  if (byExt.jpg > MAX_JPG_TOTAL)
    bad.push(`jpg 合計 ${Math.round(byExt.jpg / 1024)}KB 超過 ${Math.round(MAX_JPG_TOTAL / 1024)}KB`);
  return { files, byExt, bad };
}

export function scanImgTags(html) {
  const bad = [];
  const tags = [...html.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<img\b[^>]*>/g)].map(m => m[0]);
  let photoSeen = 0;
  for (const t of tags) {
    const src = (t.match(/src="([^"]*)"/) || [])[1] || "(沒有 src)";
    const alt = t.match(/alt="([^"]*)"/);
    if (!alt || !alt[1].trim()) bad.push(`${src} 沒有 alt`);
    // width/height 是為了防版面跳動：手機上圖片一載入整頁往下跳，
    // 讀到一半的人會失去位置。
    if (!/\bwidth="\d+"/.test(t))  bad.push(`${src} 沒有 width`);
    if (!/\bheight="\d+"/.test(t)) bad.push(`${src} 沒有 height`);
    if (src.includes(DIR + "/")) {
      photoSeen++;
      // 第一張照片要立刻載（它在第一屏），其餘都 lazy。
      if (photoSeen > 1 && !/loading="lazy"/.test(t)) bad.push(`${src} 沒有 loading="lazy"`);
      if (photoSeen === 1 && /loading="lazy"/.test(t)) bad.push(`${src} 是第一張照片，不該 lazy`);
    }
  }
  return { count: tags.length, photos: photoSeen, bad };
}

if (import.meta.url === "file://" + process.argv[1]) {
  if (!fs.existsSync("index.html")) { console.log("GUARD-BROKE 找不到 index.html"); process.exit(0); }
  const html = fs.readFileSync("index.html", "utf8");
  const f = scanFiles();
  const t = scanImgTags(html);
  const bad = [...f.bad, ...t.bad];
  if (bad.length) { console.log("BAD " + bad.join(" / ")); process.exit(0); }
  // 數字寫進通過訊息裡：0 張照片的時候這一行會說 0，
  // 才不會有人以為它守著什麼而其實沒有東西可守。
  const b = f.byExt || { webp: 0, jpg: 0 };
  console.log(`OK ${f.files.length} 個檔案（webp ${Math.round(b.webp / 1024)}KB / `
            + `jpg ${Math.round(b.jpg / 1024)}KB，實際只會下載其中一份），`
            + `index.html 有 ${t.count} 個 <img>（照片 ${t.photos} 張）`);
}
