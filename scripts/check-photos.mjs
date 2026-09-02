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
export const MAX_TOTAL = 600 * 1024;   // 整頁的圖片合計

export function scanFiles(dir = DIR) {
  if (!fs.existsSync(dir)) return { files: [], bad: [] };
  const files = fs.readdirSync(dir).filter(f => /\.(webp|jpg|jpeg|png)$/i.test(f));
  const bad = [];
  let total = 0;
  const stems = new Map();
  for (const f of files) {
    const size = fs.statSync(dir + "/" + f).size;
    total += size;
    const ext = f.slice(f.lastIndexOf(".") + 1).toLowerCase();
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
  if (total > MAX_TOTAL) bad.push(`合計 ${Math.round(total / 1024)}KB 超過 ${Math.round(MAX_TOTAL / 1024)}KB`);
  return { files, total, bad };
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
  console.log(`OK ${f.files.length} 個檔案 ${Math.round((f.total || 0) / 1024)}KB，`
            + `index.html 有 ${t.count} 個 <img>（照片 ${t.photos} 張）`);
}
