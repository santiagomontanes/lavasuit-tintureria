#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const docsDir = __dirname;
const mdPath = path.join(docsDir, 'INSTALLATION_GUIDE.md');
const pdfPath = path.join(docsDir, 'INSTALLATION_GUIDE.pdf');
const tmpHtmlPath = path.join(docsDir, '_tmp_pdf_source.html');

if (!fs.existsSync(mdPath)) {
  console.error(`[build-pdf] No existe: ${mdPath}`);
  process.exit(1);
}

let marked;
try {
  marked = require('marked');
} catch (_) {
  console.log('[build-pdf] Instalando marked en docs/node_modules ...');
  execSync('npm install --no-save --no-fund --no-audit marked@^11', {
    cwd: docsDir,
    stdio: 'inherit',
  });
  marked = require(path.join(docsDir, 'node_modules', 'marked'));
}

const css = `
@page {
  size: A4;
  margin: 22mm 18mm 24mm 18mm;
  @bottom-left {
    content: "LavaSuit · Manual de Instalación v1.0.0";
    font-family: "Segoe UI", sans-serif;
    font-size: 8pt;
    color: #64748b;
  }
  @bottom-right {
    content: "Pág. " counter(page);
    font-family: "Segoe UI", sans-serif;
    font-size: 8pt;
    color: #64748b;
  }
}
@page :first { margin: 0; @bottom-left { content: ""; } @bottom-right { content: ""; } }

* { box-sizing: border-box; }

html, body {
  margin: 0; padding: 0;
  font-family: "Segoe UI", "Inter", Tahoma, Geneva, Verdana, sans-serif;
  font-size: 10.5pt;
  line-height: 1.55;
  color: #1f2937;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* ---------- COVER ---------- */
section.cover {
  page-break-after: always;
  width: 210mm; height: 297mm;
  margin: 0;
  background: linear-gradient(135deg, #0b3a6f 0%, #1e5fa0 55%, #2d8fbf 100%);
  color: #fff;
  display: flex; flex-direction: column;
  justify-content: center; align-items: center;
  padding: 30mm 22mm;
  text-align: center;
}
section.cover::before {
  content: "LAVASUIT";
  font-size: 13pt;
  letter-spacing: 8pt;
  color: rgba(255,255,255,0.7);
  margin-bottom: 14mm;
  font-weight: 600;
}
section.cover h1 {
  font-size: 36pt; font-weight: 700;
  color: #ffffff;
  margin: 0 0 14mm 0;
  letter-spacing: -0.4px;
  border: none; padding: 0;
  page-break-before: avoid;
}
section.cover p {
  font-size: 10.5pt;
  margin: 3pt 0;
  color: rgba(255,255,255,0.92);
  text-align: center;
}
section.cover strong {
  color: #ffffff;
  font-weight: 600;
  letter-spacing: 0.5px;
}
section.cover hr { display: none; }
section.cover ul, section.cover ol { display: none; }

/* ---------- TOC ---------- */
section.toc {
  page-break-after: always;
  padding-top: 4mm;
}
section.toc h2 {
  font-size: 26pt;
  color: #0b3a6f;
  text-align: center;
  margin: 0 0 12mm 0;
  padding-bottom: 5mm;
  border-bottom: 3px solid #0b3a6f;
  letter-spacing: -0.3px;
}
section.toc ol {
  list-style: decimal;
  padding-left: 12mm;
  font-size: 11.5pt;
  line-height: 2;
}
section.toc li {
  padding: 2pt 0;
  border-bottom: 1px dotted #cbd5e1;
}
section.toc li::marker {
  color: #1e5fa0;
  font-weight: 600;
}
section.toc a {
  color: #1f2937;
  text-decoration: none;
}

/* ---------- CONTENT TYPOGRAPHY ---------- */
section.content h1 {
  font-size: 22pt;
  color: #0b3a6f;
  border-bottom: 3px solid #0b3a6f;
  padding-bottom: 6pt;
  margin-top: 0;
  margin-bottom: 14pt;
  page-break-before: always;
  page-break-after: avoid;
  letter-spacing: -0.2px;
}
section.content > h1:first-of-type { page-break-before: avoid; }

section.content h2 {
  font-size: 15pt;
  color: #1e5fa0;
  margin-top: 22pt;
  margin-bottom: 7pt;
  page-break-after: avoid;
}
section.content h3 {
  font-size: 12.5pt;
  color: #2d6da3;
  margin-top: 16pt;
  margin-bottom: 5pt;
  page-break-after: avoid;
}
section.content h4 {
  font-size: 11pt;
  color: #334155;
  margin-top: 12pt;
  margin-bottom: 4pt;
}
section.content p {
  margin: 6pt 0;
  text-align: justify;
}
section.content strong { color: #0b3a6f; font-weight: 600; }
section.content em { color: #475569; }

/* ---------- CODE ---------- */
code {
  font-family: "Consolas", "Courier New", monospace;
  font-size: 9pt;
  background: #f1f5f9;
  padding: 1px 5px;
  border-radius: 3px;
  color: #b91c1c;
}
pre {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-left: 4px solid #0b3a6f;
  border-radius: 3px;
  padding: 9pt 12pt;
  overflow-x: hidden;
  font-size: 8.5pt;
  line-height: 1.5;
  page-break-inside: avoid;
  margin: 10pt 0;
}
pre code {
  background: none;
  padding: 0;
  color: #1f2937;
  font-size: 8.5pt;
  white-space: pre-wrap;
  word-wrap: break-word;
  display: block;
}

/* ---------- TABLES ---------- */
table {
  border-collapse: collapse;
  width: 100%;
  margin: 10pt 0;
  page-break-inside: avoid;
  font-size: 9pt;
  border: 1px solid #cbd5e1;
}
thead { display: table-header-group; }
th {
  background: #0b3a6f;
  color: #ffffff;
  padding: 6pt 9pt;
  text-align: left;
  font-weight: 600;
  border: 1px solid #0b3a6f;
}
td {
  padding: 5pt 9pt;
  border: 1px solid #cbd5e1;
  vertical-align: top;
}
tbody tr:nth-child(even) { background: #f8fafc; }

/* ---------- LISTS ---------- */
ul, ol { margin: 6pt 0; padding-left: 22pt; }
li { margin: 3pt 0; }
li > p { margin: 3pt 0; }

/* ---------- BLOCKQUOTES ---------- */
blockquote {
  background: #fef9c3;
  border-left: 4px solid #ca8a04;
  padding: 8pt 14pt;
  margin: 10pt 0;
  color: #713f12;
  page-break-inside: avoid;
  border-radius: 0 3px 3px 0;
}

/* ---------- HR ---------- */
hr {
  border: none;
  border-top: 1px solid #e2e8f0;
  margin: 14pt 0;
}

/* ---------- LINKS ---------- */
a { color: #1e5fa0; text-decoration: none; }
section.content a { text-decoration: underline; text-decoration-color: #cbd5e1; }

/* ---------- BREAKS ---------- */
h1, h2, h3, h4 { break-after: avoid; page-break-after: avoid; }
table, pre, blockquote { break-inside: avoid; page-break-inside: avoid; }

@media print {
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

const md = fs.readFileSync(mdPath, 'utf-8');
const parts = md.split(/\r?\n---\r?\n/);
const coverMd = parts[0] || '';
const tocMd = parts[1] || '';
const restMd = parts.slice(2).join('\n---\n');

marked.setOptions({ gfm: true, breaks: false, headerIds: true, mangle: false });

const coverHtml = marked.parse(coverMd);
const tocHtml = marked.parse(tocMd);
const restHtml = marked.parse(restMd);

const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>LavaSuit — Manual de Instalación</title>
<style>${css}</style>
</head>
<body>
<section class="cover">${coverHtml}</section>
<section class="toc">${tocHtml}</section>
<section class="content">${restHtml}</section>
</body>
</html>`;

fs.writeFileSync(tmpHtmlPath, html, 'utf-8');

const edgeCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
const browser = edgeCandidates.find((p) => fs.existsSync(p));
if (!browser) {
  console.error('[build-pdf] No se encontró Edge ni Chrome');
  process.exit(1);
}

const fileUrl = 'file:///' + tmpHtmlPath.replace(/\\/g, '/');
console.log('[build-pdf] Browser:', browser);
console.log('[build-pdf] Source: ', tmpHtmlPath);
console.log('[build-pdf] Output: ', pdfPath);

const result = spawnSync(
  browser,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-pdf-header-footer',
    '--virtual-time-budget=15000',
    `--print-to-pdf=${pdfPath}`,
    fileUrl,
  ],
  { stdio: 'inherit' }
);

try { fs.unlinkSync(tmpHtmlPath); } catch (_) {}

if (result.status !== 0) {
  console.error(`[build-pdf] FALLÓ (exit ${result.status})`);
  process.exit(result.status || 1);
}

const stats = fs.statSync(pdfPath);
console.log(`[build-pdf] OK · ${(stats.size / 1024).toFixed(0)} KB`);
