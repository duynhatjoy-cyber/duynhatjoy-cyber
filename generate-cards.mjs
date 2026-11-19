import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECTS_PATH = path.join(__dirname, "projects.json");
const OUTPUT_DIR = path.join(__dirname, "assets", "cards");
const README_PATH = path.join(__dirname, "README.md");

const CARD_W = 400;
const CARD_H = 292;
const VIEWPORT_X = 14;
const VIEWPORT_Y = 14;
const VIEWPORT_W = 372;
const VIEWPORT_H = 205;
const SLIDE_DURATION_SEC = 3; // ~2.3s hold + ~0.7s slide
const HOLD_RATIO = 2.3 / 3.0;
const MAX_IMAGE_KB = 150;
const MAX_SVG_KB = 1500;

const MIME_MAP = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_MAP[ext] || "image/png";
}

function loadSlideAsDataUri(slideRelPath) {
  const absPath = path.resolve(__dirname, slideRelPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Không tìm thấy ảnh slide: ${slideRelPath}`);
  }
  const buf = fs.readFileSync(absPath);
  const sizeKb = buf.length / 1024;
  if (sizeKb > MAX_IMAGE_KB) {
    console.warn(
      `⚠️  Ảnh "${slideRelPath}" nặng ${sizeKb.toFixed(1)} KB (> ${MAX_IMAGE_KB} KB). ` +
        `Đề xuất nén sang .webp 750x415px:\n` +
        `    cwebp -resize 750 415 -q 80 "${slideRelPath}" -o "${slideRelPath.replace(/\.[^.]+$/, ".webp")}"`
    );
  }
  const mime = getMimeType(absPath);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function buildSliderKeyframes(slideCount) {
  if (slideCount <= 1) return "";
  const lines = ["@keyframes slideTrack {"];
  for (let i = 0; i < slideCount; i++) {
    const startPct = ((i / slideCount) * 100).toFixed(2);
    const holdPct = (((i + HOLD_RATIO) / slideCount) * 100).toFixed(2);
    const tx = -(i * VIEWPORT_W);
    lines.push(`  ${startPct}% { transform: translateX(${tx}px); }`);
    lines.push(`  ${holdPct}% { transform: translateX(${tx}px); }`);
  }
  const endTx = -(slideCount * VIEWPORT_W);
  lines.push(`  100% { transform: translateX(${endTx}px); }`);
  lines.push("}");
  return lines.join("\n    ");
}

function buildDotKeyframes(slideCount, dotIndex) {
  if (slideCount <= 1) return "";
  const activeColor = "#a3e635";
  const inactiveColor = "rgba(255,255,255,0.35)";
  const startPct = (dotIndex / slideCount) * 100;
  const endPct = ((dotIndex + HOLD_RATIO) / slideCount) * 100;
  const nextStartPct = ((dotIndex + 1) / slideCount) * 100;

  if (dotIndex === 0) {
    // Dot 0 sáng từ 0% đến hết thời gian giữ slide 0, rồi sáng lại ở 98%..100% khi slide clone về đầu
    return `@keyframes dot-${dotIndex} {
      0%, ${endPct.toFixed(2)}% { fill: ${activeColor}; }
      ${Math.min(99, nextStartPct).toFixed(2)}%, 95% { fill: ${inactiveColor}; }
      100% { fill: ${activeColor}; }
    }`;
  }

  const fadeIn = Math.max(0, startPct - 2).toFixed(2);
  const fadeOut = Math.min(100, nextStartPct).toFixed(2);
  return `@keyframes dot-${dotIndex} {
      0%, ${fadeIn}% { fill: ${inactiveColor}; }
      ${startPct.toFixed(2)}%, ${endPct.toFixed(2)}% { fill: ${activeColor}; }
      ${fadeOut}%, 100% { fill: ${inactiveColor}; }
    }`;
}

function buildTagBadges(tags) {
  const safeTags = Array.isArray(tags) ? tags.slice(0, 3) : [];
  let cursorX = CARD_W - 14;
  const elements = [];

  for (let i = safeTags.length - 1; i >= 0; i--) {
    const label = String(safeTags[i]);
    const badgeW = Math.round(Math.max(48, label.length * 6.3 + 16));
    const badgeH = 22;
    const x = cursorX - badgeW;
    const y = 244;
    elements.unshift(
      `<rect x="${x}" y="${y}" width="${badgeW}" height="${badgeH}" rx="6" fill="#172554" stroke="rgba(96,165,250,0.28)" stroke-width="1"/>`,
      `<text x="${x + badgeW / 2}" y="${y + 14.5}" text-anchor="middle" fill="#60a5fa" font-family="Inter, -apple-system, BlinkMacSystemFont, sans-serif" font-size="10" font-weight="600">${escapeXml(label)}</text>`
    );
    cursorX = x - 6;
  }
  return elements.join("\n  ");
}

function generateCardSvg(project, cardIndex) {
  const slidesData = project.slides.map(loadSlideAsDataUri);
  const slideCount = slidesData.length;
  const totalSec = Math.max(1, slideCount) * SLIDE_DURATION_SEC;
  const staggerDelay = (-(cardIndex * 0.8)).toFixed(2);
  const ledDelay = (-(cardIndex * 0.55)).toFixed(2);

  const [c1, c2, c3] =
    Array.isArray(project.ledColors) && project.ledColors.length >= 3
      ? project.ledColors
      : ["#7c3aed", "#ec4899", "#f472b6"];

  // Nhân đôi slide đầu tiên ở cuối track để lặp mượt không giật
  const trackSlides = slideCount > 1 ? [...slidesData, slidesData[0]] : slidesData;
  const trackImagesSvg = trackSlides
    .map(
      (dataUri, idx) =>
        `<image x="${VIEWPORT_X + idx * VIEWPORT_W}" y="${VIEWPORT_Y}" width="${VIEWPORT_W}" height="${VIEWPORT_H}" preserveAspectRatio="xMidYMid slice" href="${dataUri}"/>`
    )
    .join("\n      ");

  // Cụm chấm tròn chỉ báo góc dưới phải
  const dotSpacing = 12;
  const dotRadius = 3;
  const dotsPadX = 8;
  const dotsBoxW = slideCount * dotSpacing + dotsPadX * 2 - 4;
  const dotsBoxH = 16;
  const dotsBoxX = VIEWPORT_X + VIEWPORT_W - dotsBoxW - 10;
  const dotsBoxY = VIEWPORT_Y + VIEWPORT_H - dotsBoxH - 10;

  const dotsSvg = slidesData
    .map((_, idx) => {
      const cx = dotsBoxX + dotsPadX + idx * dotSpacing + dotRadius;
      const cy = dotsBoxY + dotsBoxH / 2;
      const anim =
        slideCount > 1
          ? `style="animation: dot-${idx} ${totalSec}s linear infinite; animation-delay: ${staggerDelay}s;"`
          : `fill="#a3e635"`;
      return `<circle cx="${cx}" cy="${cy}" r="${dotRadius}" fill="rgba(255,255,255,0.35)" ${anim}/>`;
    })
    .join("\n    ");

  const dotKeyframesCss =
    slideCount > 1
      ? slidesData.map((_, idx) => buildDotKeyframes(slideCount, idx)).join("\n    ")
      : "";

  const sliderKeyframesCss = buildSliderKeyframes(slideCount);
  const trackAnimCss =
    slideCount > 1
      ? `.slides-track { animation: slideTrack ${totalSec}s cubic-bezier(0.22, 1, 0.36, 1) infinite; animation-delay: ${staggerDelay}s; }`
      : "";

  const tagsSvg = buildTagBadges(project.tags);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}" fill="none">
  <defs>
    <linearGradient id="ledGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${escapeXml(c1)}"/>
      <stop offset="50%" stop-color="${escapeXml(c2)}"/>
      <stop offset="100%" stop-color="${escapeXml(c3)}"/>
    </linearGradient>
    <filter id="ledGlow" x="-15%" y="-15%" width="130%" height="130%">
      <feGaussianBlur stdDeviation="2.5" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <clipPath id="viewportClip">
      <rect x="${VIEWPORT_X}" y="${VIEWPORT_Y}" width="${VIEWPORT_W}" height="${VIEWPORT_H}" rx="10"/>
    </clipPath>
  </defs>

  <style>
    @keyframes ledSpin {
      from { stroke-dashoffset: 100; }
      to { stroke-dashoffset: 0; }
    }
    @keyframes livePulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
    .led-border {
      animation: ledSpin 3.4s linear infinite;
      animation-delay: ${ledDelay}s;
    }
    .live-dot {
      animation: livePulse 1.5s ease-in-out infinite;
    }
    ${sliderKeyframesCss}
    ${trackAnimCss}
    ${dotKeyframesCss}
  </style>

  <!-- Nền card tối -->
  <rect x="2" y="2" width="${CARD_W - 4}" height="${CARD_H - 4}" rx="16" fill="#0b0e14" stroke="#1e293b" stroke-width="1"/>

  <!-- Viền Gradient LED chạy quanh card -->
  <rect x="2" y="2" width="${CARD_W - 4}" height="${CARD_H - 4}" rx="16" fill="none" stroke="url(#ledGrad)" stroke-width="2.5" pathLength="100" stroke-dasharray="28 72" stroke-linecap="round" filter="url(#ledGlow)" class="led-border"/>

  <!-- Khung trình chiếu ảnh slide -->
  <g clip-path="url(#viewportClip)">
    <rect x="${VIEWPORT_X}" y="${VIEWPORT_Y}" width="${VIEWPORT_W}" height="${VIEWPORT_H}" fill="#0f172a"/>
    <g class="slides-track">
      ${trackImagesSvg}
    </g>
  </g>

  <!-- Badge LIVE · MOTION góc trên trái -->
  <rect x="${VIEWPORT_X + 10}" y="${VIEWPORT_Y + 10}" width="92" height="20" rx="10" fill="rgba(5,8,15,0.75)" stroke="rgba(163,230,53,0.3)" stroke-width="1"/>
  <circle cx="${VIEWPORT_X + 21}" cy="${VIEWPORT_Y + 20}" r="3" fill="#a3e635" class="live-dot"/>
  <text x="${VIEWPORT_X + 29}" y="${VIEWPORT_Y + 23.5}" fill="#a3e635" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="9" font-weight="700" letter-spacing="0.6">LIVE · MOTION</text>

  <!-- Cụm chấm chỉ báo góc dưới phải -->
  <rect x="${dotsBoxX}" y="${dotsBoxY}" width="${dotsBoxW}" height="${dotsBoxH}" rx="8" fill="rgba(5,8,15,0.68)" stroke="rgba(255,255,255,0.1)" stroke-width="0.8"/>
  ${dotsSvg}

  <!-- Phần chân card: Trái (title + demoLabel), Phải (tags) -->
  <text x="16" y="248" fill="#ffffff" font-family="Inter, -apple-system, BlinkMacSystemFont, sans-serif" font-size="14" font-weight="700">${escapeXml(project.title)}</text>
  <text x="16" y="268" fill="#94a3b8" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="10.5">${escapeXml(project.demoLabel)} ↗</text>

  ${tagsSvg}
</svg>
`;
}

function buildReadmeTable(projects) {
  const rows = [];
  for (let i = 0; i < projects.length; i += 3) {
    const chunk = projects.slice(i, i + 3);
    const cells = chunk
      .map(
        (p) => `    <td align="center" width="33.33%">
      <a href="${escapeXml(p.demoUrl)}">
        <img src="./assets/cards/${escapeXml(p.id)}.svg" alt="${escapeXml(p.title)}" width="100%" />
      </a>
      <br />
      <a href="${escapeXml(p.sourceUrl)}"><sub>source ↗</sub></a>
    </td>`
      )
      .join("\n");
    rows.push(`  <tr>\n${cells}\n  </tr>`);
  }
  return `<table>\n${rows.join("\n")}\n</table>`;
}

function updateReadme(projects) {
  const tableHtml = buildReadmeTable(projects);
  const block = `<!-- FEATURED_PROJECTS_START -->\n${tableHtml}\n<!-- FEATURED_PROJECTS_END -->`;

  let readme = fs.existsSync(README_PATH) ? fs.readFileSync(README_PATH, "utf8") : "";
  const markerRegex = /<!-- FEATURED_PROJECTS_START -->[\s\S]*?<!-- FEATURED_PROJECTS_END -->/;

  if (markerRegex.test(readme)) {
    readme = readme.replace(markerRegex, block);
  } else if (readme.trim().length === 0) {
    readme = `## 🚀 Featured Projects\n\n${block}\n`;
  } else {
    readme = `${readme.trimEnd()}\n\n---\n\n## 🚀 Featured Projects\n\n${block}\n`;
  }

  fs.writeFileSync(README_PATH, readme, "utf8");
}

function main() {
  if (!fs.existsSync(PROJECTS_PATH)) {
    throw new Error(`Không tìm thấy ${PROJECTS_PATH}`);
  }
  const projects = JSON.parse(fs.readFileSync(PROJECTS_PATH, "utf8"));
  if (!Array.isArray(projects) || projects.length === 0) {
    throw new Error("projects.json phải là một mảng chứa ít nhất 1 dự án.");
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log("🚀 Đang tạo Animated SVG Project Cards...\n");
  for (let i = 0; i < projects.length; i++) {
    const project = projects[i];
    const svg = generateCardSvg(project, i);
    const outFile = path.join(OUTPUT_DIR, `${project.id}.svg`);
    fs.writeFileSync(outFile, svg, "utf8");

    const sizeKb = Buffer.byteLength(svg, "utf8") / 1024;
    const status = sizeKb > MAX_SVG_KB ? "⚠️  VƯỢT QUÁ 1500 KB!" : "✅";
    console.log(`${status} assets/cards/${project.id}.svg — ${sizeKb.toFixed(1)} KB`);
  }

  updateReadme(projects);
  console.log("\n📝 Đã cập nhật bảng Featured Projects (3 cột) trong README.md.");
}

main();
