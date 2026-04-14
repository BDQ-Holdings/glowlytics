import fs from "fs";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import matter from "gray-matter";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(__dirname, "../../../content");

interface DraftInfo {
  slug: string;
  title: string;
  type: string;
  status: string;
  wordCount: number;
  dateGenerated: string;
  keywords: string[];
  filePath: string;
  content: string;
}

function getAllDrafts(): DraftInfo[] {
  const drafts: DraftInfo[] = [];
  const dirs = ["blog", "faq", "guides", "glossary"];

  for (const dir of dirs) {
    const fullDir = path.join(CONTENT_DIR, dir);
    if (!fs.existsSync(fullDir)) continue;

    const files = fs.readdirSync(fullDir).filter((f) => f.endsWith(".mdx"));
    for (const file of files) {
      const filePath = path.join(fullDir, file);
      const raw = fs.readFileSync(filePath, "utf-8");
      const { data, content } = matter(raw);

      drafts.push({
        slug: data.slug || file.replace(".mdx", ""),
        title: data.title || "Untitled",
        type: data.type || dir,
        status: data.status || "draft",
        wordCount: content.split(/\s+/).length,
        dateGenerated: data.dateGenerated || "",
        keywords: data.keywords || [],
        filePath,
        content,
      });
    }
  }

  return drafts;
}

function updateStatus(filePath: string, newStatus: string): void {
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);
  data.status = newStatus;
  if (newStatus === "approved") {
    data.dateModified = new Date().toISOString().split("T")[0];
  }
  const updated = matter.stringify(content, data);
  fs.writeFileSync(filePath, updated);
}

function handleAPI(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const url = new URL(req.url || "/", `http://localhost`);

  if (url.pathname === "/api/drafts" && req.method === "GET") {
    const filter = url.searchParams.get("status") || undefined;
    let drafts = getAllDrafts();
    if (filter) drafts = drafts.filter((d) => d.status === filter);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(drafts.map(({ content, filePath, ...rest }) => rest)));
    return true;
  }

  if (url.pathname === "/api/draft" && req.method === "GET") {
    const slug = url.searchParams.get("slug");
    const drafts = getAllDrafts();
    const draft = drafts.find((d) => d.slug === slug);
    if (!draft) {
      res.writeHead(404);
      res.end("Not found");
      return true;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(draft));
    return true;
  }

  if (url.pathname === "/api/approve" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const { slug } = JSON.parse(body);
      const drafts = getAllDrafts();
      const draft = drafts.find((d) => d.slug === slug);
      if (draft) {
        updateStatus(draft.filePath, "approved");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });
    return true;
  }

  if (url.pathname === "/api/reject" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const { slug } = JSON.parse(body);
      const drafts = getAllDrafts();
      const draft = drafts.find((d) => d.slug === slug);
      if (draft) {
        updateStatus(draft.filePath, "rejected");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });
    return true;
  }

  return false;
}

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Glowlytics SEO — Review Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, sans-serif; background: #0a0f1a; color: #e0e0e0; padding: 24px; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .subtitle { color: #7a8a9a; margin-bottom: 24px; font-size: 14px; }
    .filters { display: flex; gap: 8px; margin-bottom: 20px; }
    .filters button { padding: 6px 14px; border-radius: 8px; border: 1px solid #2a3a4a; background: transparent; color: #a0b0c0; cursor: pointer; font-size: 13px; }
    .filters button.active { background: #1a3a4a; color: #7DE7E1; border-color: #7DE7E1; }
    .grid { display: grid; gap: 12px; }
    .card { background: #111a2a; border: 1px solid #1a2a3a; border-radius: 12px; padding: 16px; cursor: pointer; transition: border-color 0.2s; }
    .card:hover { border-color: #3a5a6a; }
    .card-header { display: flex; justify-content: space-between; align-items: center; }
    .card-type { font-size: 11px; text-transform: uppercase; color: #7DE7E1; font-weight: 600; letter-spacing: 0.5px; }
    .card-status { font-size: 11px; padding: 2px 8px; border-radius: 6px; }
    .card-status.draft { background: #2a2a1a; color: #e8c84c; }
    .card-status.approved { background: #1a2a1a; color: #4ce84c; }
    .card-status.rejected { background: #2a1a1a; color: #e84c4c; }
    .card h3 { font-size: 15px; margin: 8px 0 4px; }
    .card-meta { font-size: 12px; color: #5a6a7a; }
    .detail { position: fixed; top: 0; right: 0; bottom: 0; width: 60%; background: #0d1520; border-left: 1px solid #1a2a3a; padding: 24px; overflow-y: auto; display: none; }
    .detail.open { display: block; }
    .detail h2 { font-size: 20px; margin-bottom: 12px; }
    .detail-actions { display: flex; gap: 8px; margin-bottom: 20px; }
    .detail-actions button { padding: 8px 20px; border-radius: 8px; border: none; cursor: pointer; font-weight: 600; font-size: 13px; }
    .btn-approve { background: #1a3a2a; color: #4ce84c; }
    .btn-reject { background: #3a1a1a; color: #e84c4c; }
    .btn-close { background: #1a2a3a; color: #a0b0c0; }
    .content-preview { background: #080e18; border-radius: 8px; padding: 16px; font-size: 14px; line-height: 1.7; white-space: pre-wrap; max-height: 70vh; overflow-y: auto; }
    .empty { text-align: center; padding: 60px; color: #4a5a6a; }
  </style>
</head>
<body>
  <h1>SEO Review Dashboard</h1>
  <p class="subtitle">Review generated content before publishing</p>
  <div class="filters" id="filters"></div>
  <div class="grid" id="grid"></div>
  <div class="detail" id="detail"></div>
  <script>
    let currentFilter = 'all';
    let drafts = [];

    async function loadDrafts() {
      const statusParam = currentFilter === 'all' ? '' : '?status=' + currentFilter;
      const res = await fetch('/api/drafts' + statusParam);
      drafts = await res.json();
      renderGrid();
    }

    function renderFilters() {
      const f = document.getElementById('filters');
      ['all', 'draft', 'approved', 'rejected'].forEach(s => {
        const btn = document.createElement('button');
        btn.textContent = s.charAt(0).toUpperCase() + s.slice(1);
        btn.className = s === currentFilter ? 'active' : '';
        btn.onclick = () => { currentFilter = s; loadDrafts(); renderFilters(); };
        f.appendChild(btn);
      });
    }

    function renderGrid() {
      const g = document.getElementById('grid');
      g.innerHTML = '';
      if (drafts.length === 0) {
        g.innerHTML = '<div class="empty">No content found. Run the SEO pipeline first.</div>';
        return;
      }
      drafts.forEach(d => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = '<div class="card-header"><span class="card-type">' + d.type + '</span><span class="card-status ' + d.status + '">' + d.status + '</span></div><h3>' + d.title + '</h3><div class="card-meta">' + d.wordCount + ' words &middot; ' + d.dateGenerated + ' &middot; ' + (d.keywords || []).slice(0, 3).join(', ') + '</div>';
        card.onclick = () => openDetail(d.slug);
        g.appendChild(card);
      });
    }

    async function openDetail(slug) {
      const res = await fetch('/api/draft?slug=' + slug);
      const d = await res.json();
      const det = document.getElementById('detail');
      det.className = 'detail open';
      det.innerHTML = '<div class="detail-actions"><button class="btn-approve" onclick="approve(\\'' + slug + '\\')">Approve</button><button class="btn-reject" onclick="reject(\\'' + slug + '\\')">Reject</button><button class="btn-close" onclick="closeDetail()">Close</button></div><h2>' + d.title + '</h2><div class="content-preview">' + d.content.replace(/</g, '&lt;') + '</div>';
    }

    function closeDetail() { document.getElementById('detail').className = 'detail'; }

    async function approve(slug) {
      await fetch('/api/approve', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({slug}) });
      closeDetail();
      loadDrafts();
    }

    async function reject(slug) {
      await fetch('/api/reject', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({slug}) });
      closeDetail();
      loadDrafts();
    }

    renderFilters();
    loadDrafts();
  </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (handleAPI(req, res)) return;

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(DASHBOARD_HTML);
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`\n  Review dashboard running at http://localhost:${PORT}\n`);
  console.log("  Open in your browser to review content drafts.\n");
});
