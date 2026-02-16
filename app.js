const DB_NAME = "wsdc-debating-tracker-db";
const DB_VERSION = 1;
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "image/png",
  "image/jpeg",
  "image/webp",
];
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
const MAX_DRIVE_IMPORT_FILES = 1000;
const GOOGLE_EXPORT_MIME_BY_TYPE = {
  "application/vnd.google-apps.document": "application/pdf",
  "application/vnd.google-apps.presentation": "application/pdf",
  "application/vnd.google-apps.spreadsheet": "text/csv",
};
const THEME_PRESETS = {
  default: {
    label: "Warm Classic",
    bg: "#f4f1ea",
    paper: "#fffdf8",
    ink: "#1e1f22",
    muted: "#5e615f",
    accent: "#0b6e4f",
    line: "#ddd8cc",
    fontBody: "IBM Plex Sans",
    fontHeading: "Sora",
  },
  bwTypewriter: {
    label: "Black & White Typewriter",
    bg: "#0d0d0d",
    paper: "#151515",
    ink: "#f2f2f2",
    muted: "#b5b5b5",
    accent: "#ffffff",
    line: "#565656",
    fontBody: "Courier Prime",
    fontHeading: "Courier Prime",
  },
  purpleQuicksand: {
    label: "Black Purple White Quicksand",
    bg: "#111016",
    paper: "#1b1727",
    ink: "#f8f7ff",
    muted: "#c5bde5",
    accent: "#9b5cff",
    line: "#4c3b73",
    fontBody: "Quicksand",
    fontHeading: "Quicksand",
  },
};

const state = {
  resources: [],
  speeches: [],
  skills: [],
  evaluations: [],
  settings: {},
  drive: {
    token: "",
    expiresAt: 0,
    tokenClient: null,
    connecting: false,
    importing: false,
  },
  theme: {
    key: "default",
    custom: null,
  },
};

let db;

const els = {
  dashboardCards: document.getElementById("dashboardCards"),
  toastHost: document.getElementById("toastHost"),
  exportBtn: document.getElementById("exportBtn"),
  importInput: document.getElementById("importInput"),
  driveImportForm: document.getElementById("driveImportForm"),
  driveClientIdInput: document.getElementById("driveClientIdInput"),
  driveFolderInput: document.getElementById("driveFolderInput"),
  driveConnectBtn: document.getElementById("driveConnectBtn"),
  driveImportBtn: document.getElementById("driveImportBtn"),
  driveStatus: document.getElementById("driveStatus"),
  driveTree: document.getElementById("driveTree"),
  driveTreeSort: document.getElementById("driveTreeSort"),
  resourceSort: document.getElementById("resourceSort"),
  themePresetForm: document.getElementById("themePresetForm"),
  themePresetSelect: document.getElementById("themePresetSelect"),
  themeCustomForm: document.getElementById("themeCustomForm"),
  themeStatus: document.getElementById("themeStatus"),
  themeBgInput: document.getElementById("themeBgInput"),
  themePaperInput: document.getElementById("themePaperInput"),
  themeInkInput: document.getElementById("themeInkInput"),
  themeAccentInput: document.getElementById("themeAccentInput"),
  themeMutedInput: document.getElementById("themeMutedInput"),
  themeLineInput: document.getElementById("themeLineInput"),
  themeFontSelect: document.getElementById("themeFontSelect"),
  skillChart: document.getElementById("skillChart"),
  evalChart: document.getElementById("evalChart"),
};

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(text = "") {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function showToast(message, isError = false) {
  const toast = document.createElement("div");
  toast.className = `toast${isError ? " error" : ""}`;
  toast.textContent = message;
  els.toastHost.appendChild(toast);
  setTimeout(() => toast.remove(), 2800);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function average(numbers) {
  if (!numbers.length) return 0;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

function hexToRgb(hex) {
  const clean = String(hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function mixHex(base, overlay, ratio) {
  const a = hexToRgb(base);
  const b = hexToRgb(overlay);
  const mix = (v1, v2) => Math.round(v1 * (1 - ratio) + v2 * ratio);
  const toHex = (value) => value.toString(16).padStart(2, "0");
  return `#${toHex(mix(a.r, b.r))}${toHex(mix(a.g, b.g))}${toHex(mix(a.b, b.b))}`;
}

function applyTheme(theme) {
  const root = document.documentElement;
  const accentSoft = mixHex(theme.accent, theme.paper, 0.72);
  root.style.setProperty("--bg", theme.bg);
  root.style.setProperty("--paper", theme.paper);
  root.style.setProperty("--ink", theme.ink);
  root.style.setProperty("--muted", theme.muted);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--line", theme.line);
  root.style.setProperty("--accent-soft", accentSoft);
  root.style.setProperty("--font-body", `'${theme.fontBody}', sans-serif`);
  root.style.setProperty("--font-heading", `'${theme.fontHeading}', sans-serif`);
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("resources")) {
        database.createObjectStore("resources", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("speeches")) {
        database.createObjectStore("speeches", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("skills")) {
        database.createObjectStore("skills", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("evaluations")) {
        database.createObjectStore("evaluations", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("files")) {
        database.createObjectStore("files", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("settings")) {
        database.createObjectStore("settings", { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(storeName, mode = "readonly") {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAll(storeName) {
  return requestToPromise(tx(storeName).getAll());
}

async function put(storeName, value) {
  return requestToPromise(tx(storeName, "readwrite").put(value));
}

async function remove(storeName, id) {
  return requestToPromise(tx(storeName, "readwrite").delete(id));
}

async function clearStore(storeName) {
  return requestToPromise(tx(storeName, "readwrite").clear());
}

async function getSetting(key) {
  const setting = await requestToPromise(tx("settings").get(key));
  return setting ? setting.value : null;
}

async function setSetting(key, value) {
  await put("settings", { key, value });
  state.settings[key] = value;
}

async function loadState() {
  const [resources, speeches, skills, evaluations, settings] = await Promise.all([
    getAll("resources"),
    getAll("speeches"),
    getAll("skills"),
    getAll("evaluations"),
    getAll("settings"),
  ]);

  state.resources = resources.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  state.speeches = speeches.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  state.skills = skills.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  state.evaluations = evaluations.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  state.settings = Object.fromEntries(settings.map((item) => [item.key, item.value]));
}

function toIsoDate(dateInput) {
  if (!dateInput) return "";
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function handleTabs() {
  const tabs = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll(".panel");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      panels.forEach((panel) => panel.classList.remove("active"));

      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      const panel = document.getElementById(tab.dataset.tab);
      if (panel) panel.classList.add("active");
    });
  });
}

function renderDashboard() {
  const latestSkill = state.skills[state.skills.length - 1];
  const evalTotals = state.evaluations.map((ev) => ev.total);
  const bestEval = evalTotals.length ? Math.max(...evalTotals) : 0;

  els.dashboardCards.innerHTML = `
    <article class="stat">
      <p>Resources</p>
      <strong>${state.resources.length}</strong>
    </article>
    <article class="stat">
      <p>Speeches</p>
      <strong>${state.speeches.length}</strong>
    </article>
    <article class="stat">
      <p>Latest Skill Score</p>
      <strong>${latestSkill ? latestSkill.score : "-"}</strong>
    </article>
    <article class="stat">
      <p>Best Eval Total</p>
      <strong>${bestEval || "-"}</strong>
    </article>
  `;
}

function getResourceFilters() {
  return {
    search: document.getElementById("resourceSearch").value.trim().toLowerCase(),
    category: document.getElementById("resourceCategoryFilter").value,
    sort: document.getElementById("resourceSort").value,
  };
}

function getSpeechFilters() {
  return {
    search: document.getElementById("speechSearch").value.trim().toLowerCase(),
    role: document.getElementById("speechRoleFilter").value,
    dateFrom: document.getElementById("speechDateFrom").value,
    dateTo: document.getElementById("speechDateTo").value,
  };
}

function getEvalFilters() {
  return {
    search: document.getElementById("evalSearch").value.trim().toLowerCase(),
    dateFrom: document.getElementById("evalDateFrom").value,
    dateTo: document.getElementById("evalDateTo").value,
  };
}

function withinDateRange(itemDate, from, to) {
  const date = toIsoDate(itemDate);
  if (!date) return true;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function renderResources() {
  const container = document.getElementById("resourceList");
  const filters = getResourceFilters();
  const driveItems = state.resources.filter((item) => item.driveFileId);
  const nonDriveItems = state.resources.filter((item) => !item.driveFileId);

  const filtered = nonDriveItems.filter((item) => {
    if (filters.category && item.category !== filters.category) return false;
    if (filters.search && !item.title.toLowerCase().includes(filters.search)) return false;
    return true;
  });

  if (filters.category === "Google Drive") {
    container.innerHTML = `<p class="empty">Google Drive files are shown in the Drive File Tree below.</p>`;
    renderDriveTree(driveItems);
    return;
  }

  if (!filtered.length) {
    container.innerHTML = `<p class="empty">No matching resources.</p>`;
    renderDriveTree(driveItems);
    return;
  }

  const sorted = filtered.slice().sort((a, b) => {
    if (filters.sort === "oldest") return a.createdAt.localeCompare(b.createdAt);
    if (filters.sort === "titleAsc") return a.title.localeCompare(b.title);
    if (filters.sort === "titleDesc") return b.title.localeCompare(a.title);
    return b.createdAt.localeCompare(a.createdAt);
  });

  container.innerHTML = sorted
    .map(
      (item) => `
      <article class="item">
        <header>
          <h3>${escapeHtml(item.title)}</h3>
          <span class="meta">${escapeHtml(item.category)}</span>
        </header>
        <p class="meta">Uploaded ${formatDate(item.createdAt)}${item.fileName ? ` | ${escapeHtml(item.fileName)}` : ""}${item.drivePath ? ` | ${escapeHtml(item.drivePath)}` : ""}${item.driveModifiedTime ? ` | Drive updated ${formatDate(item.driveModifiedTime)}` : ""}</p>
        <div class="item-actions">
          ${item.fileId ? `<button class="btn-link" data-type="resource" data-id="${item.id}" data-action="download">Download</button>` : ""}
          <button class="btn-danger" data-type="resource" data-id="${item.id}" data-action="delete">Delete</button>
        </div>
      </article>
    `
    )
    .join("");

  renderDriveTree(driveItems);
}

function addTreeNode(tree, pathParts, item) {
  if (!pathParts.length) {
    tree.__files.push(item);
    return;
  }
  const [head, ...rest] = pathParts;
  if (!tree.children[head]) {
    tree.children[head] = { name: head, children: {}, __files: [] };
  }
  addTreeNode(tree.children[head], rest, item);
}

function getDriveTreeSortMode() {
  return els.driveTreeSort?.value || "nameAsc";
}

function compareDriveFiles(a, b, sortMode) {
  if (sortMode === "nameDesc") return b.fileName.localeCompare(a.fileName);
  if (sortMode === "modifiedNewest") {
    const aTime = Date.parse(a.driveModifiedTime || a.createdAt || "") || 0;
    const bTime = Date.parse(b.driveModifiedTime || b.createdAt || "") || 0;
    return bTime - aTime || a.fileName.localeCompare(b.fileName);
  }
  if (sortMode === "modifiedOldest") {
    const aTime = Date.parse(a.driveModifiedTime || a.createdAt || "") || 0;
    const bTime = Date.parse(b.driveModifiedTime || b.createdAt || "") || 0;
    return aTime - bTime || a.fileName.localeCompare(b.fileName);
  }
  return a.fileName.localeCompare(b.fileName);
}

function renderTreeNode(node, sortMode) {
  const folderEntries = Object.values(node.children).sort((a, b) => {
    if (sortMode === "pathDesc") return b.name.localeCompare(a.name);
    return a.name.localeCompare(b.name);
  });
  const fileEntries = node.__files.slice().sort((a, b) => compareDriveFiles(a, b, sortMode));
  const folderHtml = folderEntries
    .map(
      (child) => `
      <details class="tree-folder" open>
        <summary class="tree-node folder"><strong>${escapeHtml(child.name)}</strong></summary>
        ${renderTreeNode(child, sortMode)}
      </details>
    `
    )
    .join("");
  const fileHtml = fileEntries
    .map(
      (file) => `
      <div class="tree-node file">
        <span>${escapeHtml(file.fileName || file.title)}</span>
        <button data-type="resource" data-id="${file.id}" data-action="download">Open</button>
      </div>
    `
    )
    .join("");
  return `${folderHtml}${fileHtml}`;
}

function renderDriveTree(driveItems) {
  if (!els.driveTree) return;
  if (!driveItems.length) {
    els.driveTree.innerHTML = `<p class="tree-empty">No Google Drive resources imported yet.</p>`;
    return;
  }

  const root = { children: {}, __files: [] };
  const sortMode = getDriveTreeSortMode();
  driveItems.forEach((item) => {
    const path = String(item.drivePath || "").trim();
    const segments = path ? path.split("/").filter(Boolean) : [];
    const fileName = item.fileName || item.title;
    addTreeNode(root, segments, { ...item, fileName });
  });
  els.driveTree.innerHTML = renderTreeNode(root, sortMode);
}

function renderSpeeches() {
  const container = document.getElementById("speechList");
  const filters = getSpeechFilters();

  const filtered = state.speeches.filter((item) => {
    if (filters.role && item.role !== filters.role) return false;
    if (!withinDateRange(item.createdAt, filters.dateFrom, filters.dateTo)) return false;
    if (filters.search) {
      const haystack = `${item.motion} ${item.content}`.toLowerCase();
      if (!haystack.includes(filters.search)) return false;
    }
    return true;
  });

  if (!filtered.length) {
    container.innerHTML = `<p class="empty">No matching speeches.</p>`;
    return;
  }

  container.innerHTML = filtered
    .slice()
    .reverse()
    .map(
      (item) => `
      <article class="item">
        <header>
          <h3>${escapeHtml(item.motion)}</h3>
          <span class="meta">${escapeHtml(item.role)}</span>
        </header>
        <p class="meta">${formatDate(item.createdAt)}</p>
        <p><strong>Speech:</strong> ${escapeHtml(item.content)}</p>
        <p><strong>Notes:</strong> ${escapeHtml(item.notes || "-")}</p>
        <div class="item-actions">
          ${item.fileId ? `<button class="btn-link" data-type="speech" data-id="${item.id}" data-action="download">Download File</button>` : ""}
          <button class="btn-danger" data-type="speech" data-id="${item.id}" data-action="delete">Delete</button>
        </div>
      </article>
    `
    )
    .join("");
}

function renderSkills() {
  const list = document.getElementById("skillList");
  const summary = document.getElementById("skillSummary");

  if (!state.skills.length) {
    summary.innerHTML = `<p class="empty">Add skill entries to generate trend insights.</p>`;
    list.innerHTML = "";
    drawLineChart(els.skillChart, []);
    return;
  }

  const perSkill = {};
  state.skills.forEach((entry) => {
    if (!perSkill[entry.skill]) perSkill[entry.skill] = [];
    perSkill[entry.skill].push(entry.score);
  });

  const bySkill = Object.entries(perSkill)
    .map(([name, scores]) => ({ name, avg: average(scores) }))
    .sort((a, b) => a.avg - b.avg);

  const weakest = bySkill[0];
  const trend = bySkill
    .map((item) => `${item.name}: ${item.avg.toFixed(1)}/10`)
    .join("<br>");

  const recent = state.skills.slice(-5).map((s) => s.score);
  const recentAvg = average(recent).toFixed(1);

  summary.innerHTML = `
    <h3>Skill Snapshot</h3>
    <p class="insight"><strong>Average of last 5 scores:</strong> ${recentAvg}/10</p>
    <p class="insight"><strong>Most attention needed:</strong> ${escapeHtml(weakest.name)} (${weakest.avg.toFixed(1)}/10)</p>
    <p class="insight"><strong>By skill:</strong><br>${trend}</p>
  `;

  list.innerHTML = state.skills
    .slice()
    .reverse()
    .map(
      (entry) => `
      <article class="item">
        <header>
          <h3>${escapeHtml(entry.skill)} - ${entry.score}/10</h3>
          <span class="meta">${formatDate(entry.createdAt)}</span>
        </header>
        <p><strong>Target:</strong> ${escapeHtml(entry.target)}</p>
        <div class="item-actions">
          <button class="btn-danger" data-type="skill" data-id="${entry.id}" data-action="delete">Delete</button>
        </div>
      </article>
    `
    )
    .join("");

  drawLineChart(els.skillChart, state.skills.map((item) => item.score), 10);
}

function renderEvaluations() {
  const insights = document.getElementById("evalInsights");
  const list = document.getElementById("evalList");
  const filters = getEvalFilters();

  if (!state.evaluations.length) {
    insights.innerHTML = `<p class="empty">No evaluations yet.</p>`;
    list.innerHTML = "";
    drawLineChart(els.evalChart, []);
    return;
  }

  const filtered = state.evaluations.filter((item) => {
    if (!withinDateRange(item.date || item.createdAt, filters.dateFrom, filters.dateTo)) return false;
    if (filters.search) {
      const haystack = `${item.event} ${item.motion}`.toLowerCase();
      if (!haystack.includes(filters.search)) return false;
    }
    return true;
  });

  const latest = state.evaluations[state.evaluations.length - 1];
  const totals = state.evaluations.map((ev) => ev.total);
  const avgTotal = average(totals).toFixed(1);
  const improvement = totals.length > 1 ? (totals[totals.length - 1] - totals[0]).toFixed(1) : "0.0";

  insights.innerHTML = `
    <h3>Performance Insights</h3>
    <p class="insight"><strong>Current total:</strong> ${latest.total}/300</p>
    <p class="insight"><strong>Average total:</strong> ${avgTotal}/300</p>
    <p class="insight"><strong>Change since first round:</strong> ${improvement}</p>
    <p class="insight"><strong>Latest action:</strong> ${escapeHtml(latest.action)}</p>
  `;

  if (!filtered.length) {
    list.innerHTML = `<p class="empty">No evaluations match the current filters.</p>`;
  } else {
    list.innerHTML = filtered
      .slice()
      .reverse()
      .map(
        (ev) => `
      <article class="item">
        <header>
          <h3>${escapeHtml(ev.event)} - ${ev.total}/300</h3>
          <span class="meta">${formatDate(ev.date)}</span>
        </header>
        <p><strong>Motion:</strong> ${escapeHtml(ev.motion)}</p>
        <p><strong>Matter/Method/Manner:</strong> ${ev.matter}/${ev.method}/${ev.manner}</p>
        <p><strong>Strength:</strong> ${escapeHtml(ev.strength)}</p>
        <p><strong>Weakness:</strong> ${escapeHtml(ev.weakness)}</p>
        <p><strong>Action:</strong> ${escapeHtml(ev.action)}</p>
        <div class="item-actions">
          <button class="btn-danger" data-type="evaluation" data-id="${ev.id}" data-action="delete">Delete</button>
        </div>
      </article>
    `
      )
      .join("");
  }

  drawLineChart(els.evalChart, filtered.map((item) => item.total), 300);
}

function drawLineChart(canvas, points, maxValue = null) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.clientWidth;
  const height = canvas.height;
  if (!width || !height) return;

  canvas.width = width * (window.devicePixelRatio || 1);
  canvas.height = height * (window.devicePixelRatio || 1);
  ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fffdfa";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#d6d0c4";
  ctx.lineWidth = 1;
  const padding = 20;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);
  ctx.stroke();

  if (!points.length) {
    ctx.fillStyle = "#7b7f7c";
    ctx.font = "12px IBM Plex Sans";
    ctx.fillText("No data yet", padding + 10, height / 2);
    return;
  }

  const localMax = maxValue || Math.max(...points);
  const safeMax = localMax <= 0 ? 1 : localMax;
  const stepX = points.length === 1 ? 0 : (width - padding * 2) / (points.length - 1);

  ctx.strokeStyle = "#0b6e4f";
  ctx.lineWidth = 2;
  ctx.beginPath();

  points.forEach((value, index) => {
    const x = padding + index * stepX;
    const y = height - padding - (value / safeMax) * (height - padding * 2);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();

  ctx.fillStyle = "#0b6e4f";
  points.forEach((value, index) => {
    const x = padding + index * stepX;
    const y = height - padding - (value / safeMax) * (height - padding * 2);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

function renderAll() {
  renderDashboard();
  renderResources();
  renderSpeeches();
  renderSkills();
  renderEvaluations();
}

function validateFile(file) {
  if (!(file instanceof File) || file.size === 0) {
    return "Please select a file.";
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return "File is too large. Use a file under 8MB.";
  }
  if (file.type && !ALLOWED_FILE_TYPES.includes(file.type)) {
    return "Unsupported file type.";
  }
  return "";
}

async function saveFileBlob(file, options = {}) {
  const blob = file instanceof Blob ? file : new Blob([file], { type: "application/octet-stream" });
  const id = uid();
  await put("files", {
    id,
    name: options.name || file.name || `file-${id}`,
    type: options.type || blob.type || "application/octet-stream",
    size: blob.size,
    blob,
    createdAt: new Date().toISOString(),
  });
  return id;
}

async function loadFileBlob(fileId) {
  if (!fileId) return null;
  return requestToPromise(tx("files").get(fileId));
}

async function deleteFileBlob(fileId) {
  if (!fileId) return;
  await remove("files", fileId);
}

function setupForms() {
  const resourceForm = document.getElementById("resourceForm");
  const speechForm = document.getElementById("speechForm");
  const skillForm = document.getElementById("skillForm");
  const evalForm = document.getElementById("evalForm");

  resourceForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(resourceForm);
    const file = form.get("file");
    const fileError = validateFile(file);
    if (fileError) {
      showToast(fileError, true);
      return;
    }

    const title = String(form.get("title") || "").trim();
    const duplicate = state.resources.find(
      (item) => item.title.toLowerCase() === title.toLowerCase() && item.fileName === file.name
    );
    if (duplicate) {
      showToast("Duplicate resource detected. Rename or update the existing entry.", true);
      return;
    }

    const fileId = await saveFileBlob(file);
    const record = {
      id: uid(),
      title,
      category: String(form.get("category") || ""),
      fileId,
      fileName: file.name,
      createdAt: new Date().toISOString(),
    };

    await put("resources", record);
    state.resources.push(record);
    resourceForm.reset();
    renderAll();
    showToast("Resource saved.");
  });

  speechForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(speechForm);
    const upload = form.get("speechFile");

    let fileId = "";
    let fileName = "";
    if (upload instanceof File && upload.size) {
      const fileError = validateFile(upload);
      if (fileError) {
        showToast(fileError, true);
        return;
      }
      fileId = await saveFileBlob(upload);
      fileName = upload.name;
    }

    const content = String(form.get("content") || "").trim();
    if (content.length < 40) {
      showToast("Speech text must be at least 40 characters.", true);
      return;
    }

    const record = {
      id: uid(),
      motion: String(form.get("motion") || "").trim(),
      role: String(form.get("role") || ""),
      content,
      notes: String(form.get("notes") || "").trim(),
      fileId,
      fileName,
      createdAt: new Date().toISOString(),
    };

    await put("speeches", record);
    state.speeches.push(record);
    speechForm.reset();
    renderAll();
    showToast("Speech saved.");
  });

  skillForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(skillForm);
    const target = String(form.get("target") || "").trim();
    if (target.length < 20) {
      showToast("Improvement target must be at least 20 characters.", true);
      return;
    }

    const score = Number(form.get("score"));
    if (Number.isNaN(score) || score < 1 || score > 10) {
      showToast("Skill score must be between 1 and 10.", true);
      return;
    }

    const record = {
      id: uid(),
      skill: String(form.get("skill") || ""),
      score,
      target,
      createdAt: new Date().toISOString(),
    };

    await put("skills", record);
    state.skills.push(record);
    skillForm.reset();
    renderAll();
    showToast("Skill entry added.");
  });

  evalForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(evalForm);

    const matter = Number(form.get("matter"));
    const method = Number(form.get("method"));
    const manner = Number(form.get("manner"));
    const longFields = ["strength", "weakness", "action"];

    if ([matter, method, manner].some((n) => Number.isNaN(n) || n < 1 || n > 100)) {
      showToast("Matter, Method, and Manner must be 1-100.", true);
      return;
    }

    for (const field of longFields) {
      const value = String(form.get(field) || "").trim();
      if (value.length < 20) {
        showToast("Reflection fields must be at least 20 characters.", true);
        return;
      }
    }

    const record = {
      id: uid(),
      date: String(form.get("date") || ""),
      event: String(form.get("event") || "").trim(),
      motion: String(form.get("motion") || "").trim(),
      matter,
      method,
      manner,
      total: matter + method + manner,
      strength: String(form.get("strength") || "").trim(),
      weakness: String(form.get("weakness") || "").trim(),
      action: String(form.get("action") || "").trim(),
      createdAt: new Date().toISOString(),
    };

    await put("evaluations", record);
    state.evaluations.push(record);
    evalForm.reset();
    setTodayForEval();
    renderAll();
    showToast("Evaluation saved.");
  });
}

function setupFilters() {
  [
    "resourceSearch",
    "resourceCategoryFilter",
    "resourceSort",
    "driveTreeSort",
    "speechSearch",
    "speechRoleFilter",
    "speechDateFrom",
    "speechDateTo",
    "evalSearch",
    "evalDateFrom",
    "evalDateTo",
  ].forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener("input", renderAll);
    input.addEventListener("change", renderAll);
  });
}

async function downloadFile(fileId, fallbackName = "download") {
  const fileRecord = await loadFileBlob(fileId);
  if (!fileRecord || !fileRecord.blob) {
    showToast("File not found.", true);
    return;
  }

  const url = URL.createObjectURL(fileRecord.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileRecord.name || fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function setupItemActions() {
  document.body.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.action;
    if (!action) return;

    const type = target.dataset.type;
    const id = target.dataset.id;
    if (!type || !id) return;

    const map = {
      resource: "resources",
      speech: "speeches",
      skill: "skills",
      evaluation: "evaluations",
    };

    const key = map[type];
    if (!key) return;

    const index = state[key].findIndex((item) => item.id === id);
    if (index === -1) return;

    const item = state[key][index];

    if (action === "delete") {
      const confirmed = window.confirm("Delete this item? This cannot be undone.");
      if (!confirmed) return;
      await remove(key, id);
      if (item.fileId) await deleteFileBlob(item.fileId);
      state[key].splice(index, 1);
      renderAll();
      showToast("Item deleted.");
      return;
    }

    if (action === "download") {
      await downloadFile(item.fileId, item.fileName || "download");
    }
  });
}

function setTodayForEval() {
  const input = document.querySelector("#evalForm input[name='date']");
  if (input && !input.value) {
    input.value = new Date().toISOString().split("T")[0];
  }
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Could not encode file."));
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64, type = "application/octet-stream") {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type });
}

async function buildBackupPayload() {
  const files = await getAll("files");
  const filesEncoded = [];

  for (const file of files) {
    filesEncoded.push({
      id: file.id,
      name: file.name,
      type: file.type,
      size: file.size,
      createdAt: file.createdAt,
      base64: await blobToBase64(file.blob),
    });
  }

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    resources: state.resources,
    speeches: state.speeches,
    skills: state.skills,
    evaluations: state.evaluations,
    files: filesEncoded,
  };
}

async function replaceAllData(payload) {
  await Promise.all([
    clearStore("resources"),
    clearStore("speeches"),
    clearStore("skills"),
    clearStore("evaluations"),
    clearStore("files"),
  ]);

  const writeOps = [];
  for (const item of payload.resources || []) writeOps.push(put("resources", item));
  for (const item of payload.speeches || []) writeOps.push(put("speeches", item));
  for (const item of payload.skills || []) writeOps.push(put("skills", item));
  for (const item of payload.evaluations || []) writeOps.push(put("evaluations", item));

  for (const file of payload.files || []) {
    writeOps.push(
      put("files", {
        id: file.id,
        name: file.name,
        type: file.type,
        size: file.size,
        createdAt: file.createdAt,
        blob: base64ToBlob(file.base64, file.type),
      })
    );
  }

  await Promise.all(writeOps);
  await setSetting("lastUpdatedAt", payload.updatedAt || new Date().toISOString());
  await loadState();
  renderAll();
}

function setupDataTools() {
  els.exportBtn.addEventListener("click", async () => {
    const payload = await buildBackupPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().replaceAll(":", "-").slice(0, 19);
    link.href = url;
    link.download = `wsdc-backup-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Backup exported.");
  });

  els.importInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const confirmed = window.confirm("Import backup and replace current local data?");
    if (!confirmed) {
      els.importInput.value = "";
      return;
    }

    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (!payload || payload.schemaVersion !== 1) {
        showToast("Invalid backup format.", true);
        return;
      }
      await replaceAllData(payload);
      showToast("Backup imported.");
    } catch {
      showToast("Failed to import backup file.", true);
    } finally {
      els.importInput.value = "";
    }
  });
}

function setDriveStatus(message) {
  if (els.driveStatus) {
    els.driveStatus.textContent = message;
  }
}

function extractDriveFolderId(rawInput) {
  const value = String(rawInput || "").trim();
  if (!value) return "";

  if (!value.includes("http")) {
    const matched = value.match(/[a-zA-Z0-9_-]{10,}/);
    return matched ? matched[0] : "";
  }

  try {
    const url = new URL(value);
    const fromPath = url.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (fromPath?.[1]) return fromPath[1];
    const fromQuery = url.searchParams.get("id");
    if (!fromQuery) return "";
    const matched = fromQuery.match(/[a-zA-Z0-9_-]{10,}/);
    return matched ? matched[0] : "";
  } catch {
    return "";
  }
}

function getDriveClientId() {
  return String(els.driveClientIdInput?.value || "").trim();
}

function isDriveTokenValid() {
  return Boolean(state.drive.token && Date.now() < state.drive.expiresAt - 30_000);
}

function ensureGoogleIdentityReady() {
  return Boolean(window.google?.accounts?.oauth2);
}

function updateDriveControls() {
  if (!els.driveConnectBtn || !els.driveImportBtn) return;
  const busy = state.drive.connecting || state.drive.importing;
  els.driveConnectBtn.disabled = busy;
  els.driveImportBtn.disabled = busy || !isDriveTokenValid();
}

function initDriveTokenClient(clientId) {
  if (!ensureGoogleIdentityReady()) {
    throw new Error("Google Identity SDK not loaded.");
  }

  const currentClientId = state.settings.driveClientId || "";
  if (state.drive.tokenClient && currentClientId === clientId) {
    return state.drive.tokenClient;
  }

  state.drive.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: DRIVE_SCOPE,
    callback: () => {},
    error_callback: () => {},
  });
  return state.drive.tokenClient;
}

async function requestDriveAccessToken({ interactive }) {
  const clientId = getDriveClientId();
  if (!clientId) {
    throw new Error("Google OAuth Client ID is required.");
  }

  const tokenClient = initDriveTokenClient(clientId);

  return new Promise((resolve, reject) => {
    tokenClient.callback = (response) => {
      if (response?.error) {
        reject(new Error(response.error));
        return;
      }
      state.drive.token = response.access_token || "";
      state.drive.expiresAt = Date.now() + Number(response.expires_in || 3000) * 1000;
      resolve(state.drive.token);
    };
    tokenClient.error_callback = (error) => reject(new Error(error?.type || "token_request_failed"));
    tokenClient.requestAccessToken({ prompt: interactive ? "consent" : "" });
  });
}

async function getDriveToken({ interactive }) {
  if (isDriveTokenValid()) return state.drive.token;
  return requestDriveAccessToken({ interactive });
}

async function driveFetch(url, options = {}, retry = true) {
  const token = await getDriveToken({ interactive: !state.drive.token });
  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`,
  };

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401 && retry) {
    await requestDriveAccessToken({ interactive: true });
    return driveFetch(url, options, false);
  }

  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = payload?.error?.message || "";
    } catch {
      detail = await response.text();
    }
    const suffix = detail ? `: ${detail}` : "";
    throw new Error(`Drive API error ${response.status}${suffix}`);
  }

  return response;
}

function getDriveDownloadSpec(file) {
  if (!file.mimeType.startsWith("application/vnd.google-apps.")) {
    return {
      url: `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`,
      name: file.name,
      type: file.mimeType || "application/octet-stream",
    };
  }

  const exportType = GOOGLE_EXPORT_MIME_BY_TYPE[file.mimeType];
  if (!exportType) return null;

  const ext = exportType === "application/pdf" ? ".pdf" : ".csv";
  const safeName = file.name.match(/\.[A-Za-z0-9]{2,8}$/) ? file.name : `${file.name}${ext}`;
  return {
    url: `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=${encodeURIComponent(exportType)}&supportsAllDrives=true`,
    name: safeName,
    type: exportType,
  };
}

async function listDriveItemsInFolder(folderId) {
  let rootFolderName = "";
  try {
    const rootResponse = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType&supportsAllDrives=true`
    );
    const rootData = await rootResponse.json();
    rootFolderName = rootData?.name || "";
  } catch {
    rootFolderName = "";
  }

  const files = [];
  const queue = [{ id: folderId, path: rootFolderName }];
  const visitedFolders = new Set();

  while (queue.length) {
    const currentFolder = queue.shift();
    if (visitedFolders.has(currentFolder.id)) continue;
    visitedFolders.add(currentFolder.id);

    let pageToken = "";
    do {
      const query = encodeURIComponent(`'${currentFolder.id}' in parents and trashed=false`);
      const fields = encodeURIComponent("nextPageToken,files(id,name,mimeType,size,modifiedTime)");
      const page = encodeURIComponent(String(MAX_DRIVE_IMPORT_FILES));
      const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
      const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&pageSize=${page}${tokenParam}&includeItemsFromAllDrives=true&supportsAllDrives=true`;
      const response = await driveFetch(url);
      const payload = await response.json();
      const items = payload.files || [];

      for (const item of items) {
        if (item.mimeType === DRIVE_FOLDER_MIME) {
          const folderPath = currentFolder.path ? `${currentFolder.path}/${item.name}` : item.name;
          queue.push({ id: item.id, path: folderPath });
          continue;
        }
        files.push({
          ...item,
          drivePath: currentFolder.path,
        });
        if (files.length >= MAX_DRIVE_IMPORT_FILES) {
          return files;
        }
      }

      pageToken = payload.nextPageToken || "";
    } while (pageToken);
  }

  return files;
}

async function importDriveFiles(folderId) {
  const driveFiles = await listDriveItemsInFolder(folderId);
  if (!driveFiles.length) {
    showToast("No files found in that folder.", true);
    return;
  }

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (let index = 0; index < driveFiles.length; index += 1) {
    const driveFile = driveFiles[index];
    setDriveStatus(`Importing ${index + 1}/${driveFiles.length}: ${driveFile.name}`);

    const downloadSpec = getDriveDownloadSpec(driveFile);
    if (!downloadSpec) {
      skipped += 1;
      continue;
    }

    const response = await driveFetch(downloadSpec.url);
    const blob = await response.blob();
    if (blob.size > MAX_FILE_SIZE_BYTES) {
      skipped += 1;
      continue;
    }

    const existing = state.resources.find((item) => item.driveFileId === driveFile.id);
    const samePathAndName = state.resources.find(
      (item) =>
        item.category === "Google Drive" &&
        item.drivePath === driveFile.drivePath &&
        item.fileName === downloadSpec.name
    );

    if (existing) {
      const newFileId = await saveFileBlob(blob, { name: downloadSpec.name, type: downloadSpec.type });
      if (existing.fileId) {
        await deleteFileBlob(existing.fileId);
      }
      existing.fileId = newFileId;
      existing.fileName = downloadSpec.name;
      existing.title = driveFile.name;
      existing.drivePath = driveFile.drivePath;
      existing.driveModifiedTime = driveFile.modifiedTime || "";
      existing.createdAt = new Date().toISOString();
      await put("resources", existing);
      updated += 1;
      continue;
    }

    if (samePathAndName) {
      if (samePathAndName.fileId) {
        await deleteFileBlob(samePathAndName.fileId);
      }
      samePathAndName.fileId = await saveFileBlob(blob, { name: downloadSpec.name, type: downloadSpec.type });
      samePathAndName.driveFileId = driveFile.id;
      samePathAndName.title = driveFile.name;
      samePathAndName.drivePath = driveFile.drivePath;
      samePathAndName.driveModifiedTime = driveFile.modifiedTime || "";
      samePathAndName.createdAt = new Date().toISOString();
      await put("resources", samePathAndName);
      updated += 1;
      continue;
    }

    const fileId = await saveFileBlob(blob, { name: downloadSpec.name, type: downloadSpec.type });
    const record = {
      id: uid(),
      title: driveFile.name,
      category: "Google Drive",
      fileId,
      fileName: downloadSpec.name,
      driveFileId: driveFile.id,
      drivePath: driveFile.drivePath,
      driveModifiedTime: driveFile.modifiedTime || "",
      createdAt: new Date().toISOString(),
    };

    await put("resources", record);
    state.resources.push(record);
    imported += 1;
  }

  renderAll();
  showToast(`Drive import finished: ${imported} imported, ${updated} updated, ${skipped} skipped.`);
}

function setupGoogleDriveImport() {
  if (!els.driveImportForm || !els.driveClientIdInput || !els.driveFolderInput || !els.driveConnectBtn) {
    return;
  }

  els.driveClientIdInput.value = state.settings.driveClientId || "";
  els.driveFolderInput.value = state.settings.driveFolderId || "";
  setDriveStatus(
    state.settings.driveClientId
      ? `Saved Client ID. Click Connect Google. (Import cap: ${MAX_DRIVE_IMPORT_FILES} files/run)`
      : "Not connected."
  );
  updateDriveControls();

  els.driveClientIdInput.addEventListener("input", () => {
    state.drive.token = "";
    state.drive.expiresAt = 0;
    state.drive.tokenClient = null;
    updateDriveControls();
    setDriveStatus("Not connected.");
  });

  els.driveConnectBtn.addEventListener("click", async () => {
    if (!ensureGoogleIdentityReady()) {
      showToast("Google Identity SDK failed to load. Reload and try again.", true);
      return;
    }

    const clientId = getDriveClientId();
    if (!clientId) {
      showToast("Enter a Google OAuth Client ID first.", true);
      return;
    }

    state.drive.connecting = true;
    updateDriveControls();
    try {
      await setSetting("driveClientId", clientId);
      await requestDriveAccessToken({ interactive: true });
      setDriveStatus(`Connected to Google Drive. (Import cap: ${MAX_DRIVE_IMPORT_FILES} files/run)`);
      showToast("Google Drive connected.");
    } catch (error) {
      console.error(error);
      showToast("Could not connect to Google Drive.", true);
      setDriveStatus("Connection failed.");
    } finally {
      state.drive.connecting = false;
      updateDriveControls();
    }
  });

  els.driveImportForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.drive.importing) return;

    const folderId = extractDriveFolderId(els.driveFolderInput.value);
    const clientId = getDriveClientId();
    if (!clientId) {
      showToast("Google OAuth Client ID is required.", true);
      return;
    }
    if (!folderId) {
      showToast("Enter a valid Drive folder ID or link.", true);
      return;
    }

    state.drive.importing = true;
    updateDriveControls();

    try {
      await setSetting("driveClientId", clientId);
      await setSetting("driveFolderId", folderId);
      await getDriveToken({ interactive: true });
      await importDriveFiles(folderId);
      setDriveStatus("Import complete.");
    } catch (error) {
      console.error(error);
      showToast(`Google Drive import failed: ${error?.message || "Unknown error"}`, true);
      setDriveStatus("Import failed.");
    } finally {
      state.drive.importing = false;
      updateDriveControls();
    }
  });
}

function getCurrentTheme() {
  if (state.theme.key === "custom" && state.theme.custom) {
    return {
      ...state.theme.custom,
      label: "Custom Theme",
      fontHeading: state.theme.custom.fontHeading || state.theme.custom.fontBody || "IBM Plex Sans",
    };
  }
  return THEME_PRESETS[state.theme.key] || THEME_PRESETS.default;
}

function updateThemeStatus() {
  if (!els.themeStatus) return;
  const theme = getCurrentTheme();
  els.themeStatus.textContent = `Theme: ${theme.label}`;
}

function populateThemeInputs(theme) {
  if (!els.themeBgInput) return;
  els.themeBgInput.value = theme.bg;
  els.themePaperInput.value = theme.paper;
  els.themeInkInput.value = theme.ink;
  els.themeAccentInput.value = theme.accent;
  els.themeMutedInput.value = theme.muted;
  els.themeLineInput.value = theme.line;
  if (els.themeFontSelect) {
    const available = ["IBM Plex Sans", "Courier Prime", "Quicksand"];
    els.themeFontSelect.value = available.includes(theme.fontBody) ? theme.fontBody : "IBM Plex Sans";
  }
}

async function saveThemeState() {
  await setSetting("themeKey", state.theme.key);
  await setSetting("themeCustom", state.theme.custom || null);
}

function setupThemes() {
  state.theme.key = state.settings.themeKey || "default";
  state.theme.custom = state.settings.themeCustom || null;

  if (els.themePresetSelect) {
    const isPreset = Boolean(THEME_PRESETS[state.theme.key]);
    els.themePresetSelect.value = state.theme.key === "custom" || isPreset ? state.theme.key : "default";
  }

  const activeTheme = getCurrentTheme();
  applyTheme(activeTheme);
  populateThemeInputs(activeTheme);
  updateThemeStatus();

  els.themePresetForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const key = els.themePresetSelect?.value || "default";
    if (key === "custom" && !state.theme.custom) {
      showToast("No saved custom theme yet. Create one first.", true);
      return;
    }

    const preset = key === "custom" ? getCurrentTheme() : THEME_PRESETS[key] || THEME_PRESETS.default;
    state.theme.key = key;
    if (key !== "custom") {
      state.theme.custom = null;
    }
    await saveThemeState();
    applyTheme(preset);
    populateThemeInputs(preset);
    updateThemeStatus();
    renderAll();
    showToast(`${preset.label} applied.`);
  });

  els.themeCustomForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const customTheme = {
      bg: els.themeBgInput.value,
      paper: els.themePaperInput.value,
      ink: els.themeInkInput.value,
      accent: els.themeAccentInput.value,
      muted: els.themeMutedInput.value,
      line: els.themeLineInput.value,
      fontBody: els.themeFontSelect.value,
      fontHeading: els.themeFontSelect.value,
      label: "Custom Theme",
    };
    state.theme.key = "custom";
    state.theme.custom = customTheme;
    await saveThemeState();
    applyTheme(customTheme);
    if (els.themePresetSelect) {
      els.themePresetSelect.value = "custom";
    }
    updateThemeStatus();
    renderAll();
    showToast("Custom theme applied.");
  });
}

function setupChartResize() {
  window.addEventListener("resize", () => {
    drawLineChart(els.skillChart, state.skills.map((item) => item.score), 10);
    drawLineChart(els.evalChart, state.evaluations.map((item) => item.total), 300);
  });
}

async function init() {
  db = await openDb();
  await loadState();
  handleTabs();
  setupForms();
  setupFilters();
  setupItemActions();
  setupDataTools();
  setupGoogleDriveImport();
  setupThemes();
  setupChartResize();
  setTodayForEval();
  renderAll();
}

init().catch(() => {
  showToast("Failed to initialize app.", true);
});
