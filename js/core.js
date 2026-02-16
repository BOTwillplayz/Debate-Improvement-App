const DB_NAME = "wsdc-redesign-db";
const DB_VERSION = 1;
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
const DRIVE_PAGE_SIZE = 1000;

const GOOGLE_EXPORT_MIME_BY_TYPE = {
  "application/vnd.google-apps.document": "application/pdf",
  "application/vnd.google-apps.presentation": "application/pdf",
  "application/vnd.google-apps.spreadsheet": "text/csv",
};

const THEME_PRESETS = {
  default: {
    label: "Modern Mint",
    bg: "#f2f4f8",
    surface: "#ffffff",
    surfaceSoft: "#f8fafc",
    text: "#111827",
    muted: "#5b6475",
    accent: "#0f766e",
    border: "#d8deea",
    radius: 14,
    maxw: 1120,
    space: 1,
    bodyFont: "Manrope",
    headingFont: "Space Grotesk",
  },
  bwTypewriter: {
    label: "Black & White Typewriter",
    bg: "#0d0d0d",
    surface: "#161616",
    surfaceSoft: "#1f1f1f",
    text: "#f5f5f5",
    muted: "#c9c9c9",
    accent: "#ffffff",
    border: "#4b4b4b",
    radius: 10,
    maxw: 1040,
    space: 1,
    bodyFont: "Courier Prime",
    headingFont: "Courier Prime",
  },
  purpleQuicksand: {
    label: "Purple Quicksand",
    bg: "#120f1a",
    surface: "#1d1730",
    surfaceSoft: "#241c3b",
    text: "#faf8ff",
    muted: "#d2c4f5",
    accent: "#9d5cff",
    border: "#4f3e78",
    radius: 15,
    maxw: 1160,
    space: 1,
    bodyFont: "Quicksand",
    headingFont: "Quicksand",
  },
};

const NAV_ITEMS = [
  ["index.html", "Dashboard"],
  ["resources.html", "Resources"],
  ["speeches.html", "Speeches"],
  ["skills.html", "Skills"],
  ["evaluations.html", "Evaluations"],
  ["settings.html", "Settings"],
];

const state = {
  db: null,
  resources: [],
  speeches: [],
  skills: [],
  evaluations: [],
  settings: {},
  drive: {
    token: "",
    expiresAt: 0,
    tokenClient: null,
  },
};

function tx(storeName, mode = "readonly") {
  return state.db.transaction(storeName, mode).objectStore(storeName);
}

function reqPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString();
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, item) => sum + item, 0) / values.length;
}

function toast(message, isError = false) {
  const host = document.getElementById("toastHost");
  if (!host) return;
  const div = document.createElement("div");
  div.className = `toast${isError ? " error" : ""}`;
  div.textContent = message;
  host.appendChild(div);
  setTimeout(() => div.remove(), 3200);
}

function parseFolderId(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (!raw.includes("http")) {
    const match = raw.match(/[a-zA-Z0-9_-]{10,}/);
    return match ? match[0] : "";
  }
  try {
    const url = new URL(raw);
    const pathMatch = url.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (pathMatch?.[1]) return pathMatch[1];
    const id = url.searchParams.get("id") || "";
    const match = id.match(/[a-zA-Z0-9_-]{10,}/);
    return match ? match[0] : "";
  } catch {
    return "";
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      ["resources", "speeches", "skills", "evaluations", "files"].forEach((name) => {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
      });
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAll(storeName) {
  return reqPromise(tx(storeName).getAll());
}

async function put(storeName, value) {
  return reqPromise(tx(storeName, "readwrite").put(value));
}

async function del(storeName, id) {
  return reqPromise(tx(storeName, "readwrite").delete(id));
}

async function clearStore(storeName) {
  return reqPromise(tx(storeName, "readwrite").clear());
}

async function setSetting(key, value) {
  await put("settings", { key, value });
  state.settings[key] = value;
}

export async function bootstrap(activeHref) {
  state.db = await openDb();
  const [resources, speeches, skills, evaluations, settings] = await Promise.all([
    getAll("resources"),
    getAll("speeches"),
    getAll("skills"),
    getAll("evaluations"),
    getAll("settings"),
  ]);

  state.resources = resources.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  state.speeches = speeches.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  state.skills = skills.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  state.evaluations = evaluations.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  state.settings = Object.fromEntries(settings.map((entry) => [entry.key, entry.value]));

  renderNav(activeHref);
  applySavedAppearance();

  return state;
}

function renderNav(activeHref) {
  const nav = document.getElementById("topNav");
  if (!nav) return;
  nav.className = "top-nav";
  nav.innerHTML = NAV_ITEMS.map(([href, label]) => {
    const active = activeHref === href ? "active" : "";
    return `<a href="${href}" class="${active}">${label}</a>`;
  }).join("");
}

function applyThemeVars(theme) {
  const root = document.documentElement;
  root.style.setProperty("--bg", theme.bg);
  root.style.setProperty("--surface", theme.surface);
  root.style.setProperty("--surface-soft", theme.surfaceSoft);
  root.style.setProperty("--text", theme.text);
  root.style.setProperty("--muted", theme.muted);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--border", theme.border);
  root.style.setProperty("--radius", `${theme.radius}px`);
  root.style.setProperty("--maxw", `${theme.maxw}px`);
  root.style.setProperty("--space", String(theme.space));
  root.style.setProperty("--font-body", `\"${theme.bodyFont}\", system-ui, sans-serif`);
  root.style.setProperty("--font-heading", `\"${theme.headingFont}\", \"${theme.bodyFont}\", system-ui, sans-serif`);
}

function getActiveTheme() {
  const key = state.settings.themePreset || "default";
  if (key === "custom" && state.settings.themeCustom) {
    return { ...state.settings.themeCustom, label: "Custom" };
  }
  return THEME_PRESETS[key] || THEME_PRESETS.default;
}

export function applySavedAppearance() {
  applyThemeVars(getActiveTheme());
}

export async function saveThemePreset(presetKey) {
  await setSetting("themePreset", presetKey);
  applySavedAppearance();
}

export async function saveCustomTheme(theme) {
  await setSetting("themePreset", "custom");
  await setSetting("themeCustom", theme);
  applySavedAppearance();
}

export function getThemePresets() {
  return THEME_PRESETS;
}

export function getThemeSettings() {
  return {
    preset: state.settings.themePreset || "default",
    custom: state.settings.themeCustom || null,
    active: getActiveTheme(),
  };
}

export async function saveFileBlob(blob, name, type = "application/octet-stream") {
  const payload = blob instanceof Blob ? blob : new Blob([blob], { type });
  const id = uid();
  await put("files", {
    id,
    name,
    type: type || payload.type,
    size: payload.size,
    blob: payload,
    createdAt: new Date().toISOString(),
  });
  return id;
}

export async function loadFile(fileId) {
  if (!fileId) return null;
  return reqPromise(tx("files").get(fileId));
}

export async function deleteFile(fileId) {
  if (!fileId) return;
  await del("files", fileId);
}

export function validateUploadFile(file) {
  if (!(file instanceof File) || !file.size) return "Select a file first.";
  if (file.size > MAX_FILE_SIZE_BYTES) return "File too large (max 8MB).";
  return "";
}

export async function createResource(record) {
  await put("resources", record);
  state.resources.unshift(record);
}

export async function updateResource(record) {
  await put("resources", record);
  const index = state.resources.findIndex((item) => item.id === record.id);
  if (index !== -1) state.resources[index] = record;
}

export async function removeResource(id) {
  const index = state.resources.findIndex((item) => item.id === id);
  if (index === -1) return;
  const item = state.resources[index];
  await del("resources", id);
  if (item.fileId) await deleteFile(item.fileId);
  state.resources.splice(index, 1);
}

export async function createSpeech(record) {
  await put("speeches", record);
  state.speeches.unshift(record);
}

export async function removeSpeech(id) {
  const index = state.speeches.findIndex((item) => item.id === id);
  if (index === -1) return;
  const item = state.speeches[index];
  await del("speeches", id);
  if (item.fileId) await deleteFile(item.fileId);
  state.speeches.splice(index, 1);
}

export async function createSkill(record) {
  await put("skills", record);
  state.skills.unshift(record);
}

export async function removeSkill(id) {
  await del("skills", id);
  state.skills = state.skills.filter((item) => item.id !== id);
}

export async function createEvaluation(record) {
  await put("evaluations", record);
  state.evaluations.unshift(record);
}

export async function removeEvaluation(id) {
  await del("evaluations", id);
  state.evaluations = state.evaluations.filter((item) => item.id !== id);
}

export function getState() {
  return state;
}

export async function downloadStoredFile(fileId, fallback = "download") {
  const stored = await loadFile(fileId);
  if (!stored?.blob) {
    toast("File not found.", true);
    return;
  }
  const url = URL.createObjectURL(stored.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = stored.name || fallback;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function attachDownloadDeleteHandlers(type, onDeleteDone) {
  document.body.addEventListener("click", async (event) => {
    const button = event.target;
    if (!(button instanceof HTMLElement)) return;
    const action = button.dataset.action;
    if (!action || button.dataset.type !== type) return;
    const id = button.dataset.id;
    if (!id) return;

    if (action === "download") {
      const list = state[type];
      const item = list.find((entry) => entry.id === id);
      if (item) await downloadStoredFile(item.fileId, item.fileName || "download");
    }

    if (action === "delete") {
      if (!window.confirm("Delete this item?")) return;
      if (type === "resources") await removeResource(id);
      if (type === "speeches") await removeSpeech(id);
      if (type === "skills") await removeSkill(id);
      if (type === "evaluations") await removeEvaluation(id);
      if (onDeleteDone) onDeleteDone();
      toast("Deleted.");
    }
  });
}

function ensureGsi() {
  return Boolean(window.google?.accounts?.oauth2);
}

function ensureTokenClient(clientId) {
  if (!ensureGsi()) throw new Error("Google Identity script not loaded.");
  if (state.drive.tokenClient && state.drive.clientId === clientId) return state.drive.tokenClient;
  state.drive.clientId = clientId;
  state.drive.tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: DRIVE_SCOPE,
    callback: () => {},
    error_callback: () => {},
  });
  return state.drive.tokenClient;
}

async function requestToken(clientId, interactive) {
  const tokenClient = ensureTokenClient(clientId);
  return new Promise((resolve, reject) => {
    tokenClient.callback = (response) => {
      if (response?.error) {
        reject(new Error(response.error));
        return;
      }
      state.drive.token = response.access_token || "";
      state.drive.expiresAt = Date.now() + Number(response.expires_in || 3600) * 1000;
      resolve(state.drive.token);
    };
    tokenClient.error_callback = (error) => reject(new Error(error?.type || "token_error"));
    tokenClient.requestAccessToken({ prompt: interactive ? "consent" : "" });
  });
}

async function driveToken(clientId) {
  if (state.drive.token && Date.now() < state.drive.expiresAt - 20_000) return state.drive.token;
  return requestToken(clientId, true);
}

async function driveFetch(url, clientId, retry = true) {
  const token = await driveToken(clientId);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (response.status === 401 && retry) {
    await requestToken(clientId, true);
    return driveFetch(url, clientId, false);
  }

  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = payload?.error?.message || "";
    } catch {
      detail = await response.text();
    }
    throw new Error(`Drive API ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  return response;
}

function driveDownloadSpec(file) {
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
  return {
    url: `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=${encodeURIComponent(exportType)}&supportsAllDrives=true`,
    name: file.name.endsWith(ext) ? file.name : `${file.name}${ext}`,
    type: exportType,
  };
}

async function fetchDriveTree(clientId, folderId, onProgress) {
  let rootName = "";
  try {
    const root = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name&supportsAllDrives=true`,
      clientId
    );
    rootName = (await root.json()).name || "";
  } catch {
    rootName = "";
  }

  const output = [];
  const queue = [{ id: folderId, path: rootName }];
  const seen = new Set();

  while (queue.length) {
    const current = queue.shift();
    if (seen.has(current.id)) continue;
    seen.add(current.id);

    let pageToken = "";
    do {
      const query = encodeURIComponent(`'${current.id}' in parents and trashed=false`);
      const fields = encodeURIComponent("nextPageToken,files(id,name,mimeType,modifiedTime)");
      const page = encodeURIComponent(String(DRIVE_PAGE_SIZE));
      const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
      const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&pageSize=${page}${tokenParam}&includeItemsFromAllDrives=true&supportsAllDrives=true`;
      const res = await driveFetch(url, clientId);
      const data = await res.json();
      const files = data.files || [];

      for (const item of files) {
        if (item.mimeType === DRIVE_FOLDER_MIME) {
          const path = current.path ? `${current.path}/${item.name}` : item.name;
          queue.push({ id: item.id, path });
          continue;
        }
        output.push({ ...item, drivePath: current.path || "" });
        if (onProgress) onProgress(output.length);
      }

      pageToken = data.nextPageToken || "";
    } while (pageToken);
  }

  return output;
}

export async function connectDrive(clientId) {
  if (!clientId) throw new Error("Google OAuth Client ID is required.");
  await requestToken(clientId, true);
  await setSetting("driveClientId", clientId);
}

export async function importDriveFolder({ clientId, folderInput, onProgress }) {
  const folderId = parseFolderId(folderInput);
  if (!folderId) throw new Error("Enter a valid Google Drive folder URL or ID.");
  if (!clientId) throw new Error("Google OAuth Client ID is required.");

  await setSetting("driveFolderInput", folderInput);
  await setSetting("driveClientId", clientId);

  const files = await fetchDriveTree(clientId, folderId, onProgress);

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const driveFile of files) {
    const spec = driveDownloadSpec(driveFile);
    if (!spec) {
      skipped += 1;
      continue;
    }

    const response = await driveFetch(spec.url, clientId);
    const blob = await response.blob();
    if (blob.size > MAX_FILE_SIZE_BYTES) {
      skipped += 1;
      continue;
    }

    const byDriveId = state.resources.find((item) => item.driveFileId === driveFile.id);
    const byPathName = state.resources.find(
      (item) => item.source === "drive" && item.drivePath === driveFile.drivePath && item.fileName === spec.name
    );

    if (byDriveId || byPathName) {
      const existing = byDriveId || byPathName;
      if (existing.fileId) await deleteFile(existing.fileId);
      existing.fileId = await saveFileBlob(blob, spec.name, spec.type);
      existing.title = driveFile.name;
      existing.fileName = spec.name;
      existing.drivePath = driveFile.drivePath;
      existing.driveFileId = driveFile.id;
      existing.driveModifiedTime = driveFile.modifiedTime || "";
      existing.updatedAt = new Date().toISOString();
      await updateResource(existing);
      updated += 1;
      continue;
    }

    const fileId = await saveFileBlob(blob, spec.name, spec.type);
    await createResource({
      id: uid(),
      title: driveFile.name,
      category: "Google Drive",
      source: "drive",
      fileId,
      fileName: spec.name,
      drivePath: driveFile.drivePath,
      driveFileId: driveFile.id,
      driveModifiedTime: driveFile.modifiedTime || "",
      createdAt: new Date().toISOString(),
    });
    imported += 1;
  }

  return { imported, updated, skipped, total: files.length };
}

export async function exportBackup() {
  const files = await getAll("files");
  const encoded = [];
  for (const file of files) {
    const data = await blobToBase64(file.blob);
    encoded.push({ ...file, base64: data, blob: undefined });
  }
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    resources: state.resources,
    speeches: state.speeches,
    skills: state.skills,
    evaluations: state.evaluations,
    settings: state.settings,
    files: encoded,
  };
}

export async function importBackup(payload) {
  if (!payload || payload.schemaVersion !== 1) throw new Error("Invalid backup file.");
  await Promise.all([
    clearStore("resources"),
    clearStore("speeches"),
    clearStore("skills"),
    clearStore("evaluations"),
    clearStore("files"),
    clearStore("settings"),
  ]);

  const writes = [];
  for (const item of payload.resources || []) writes.push(put("resources", item));
  for (const item of payload.speeches || []) writes.push(put("speeches", item));
  for (const item of payload.skills || []) writes.push(put("skills", item));
  for (const item of payload.evaluations || []) writes.push(put("evaluations", item));
  for (const item of Object.entries(payload.settings || {})) writes.push(put("settings", { key: item[0], value: item[1] }));
  for (const item of payload.files || []) {
    writes.push(
      put("files", {
        id: item.id,
        name: item.name,
        type: item.type,
        size: item.size,
        createdAt: item.createdAt,
        blob: base64ToBlob(item.base64, item.type),
      })
    );
  }

  await Promise.all(writes);
  await bootstrap(window.location.pathname.split("/").pop() || "index.html");
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.split(",")[1] || "");
    };
    reader.onerror = () => reject(new Error("Cannot encode blob"));
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64, type) {
  const bytes = atob(base64 || "");
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: type || "application/octet-stream" });
}

export function drawLineChart(canvas, values, maxValue = null) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.clientWidth;
  const height = canvas.clientHeight || 180;
  const dpr = window.devicePixelRatio || 1;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const pad = 20;
  ctx.strokeStyle = "rgba(120,130,150,.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, pad);
  ctx.lineTo(pad, height - pad);
  ctx.lineTo(width - pad, height - pad);
  ctx.stroke();

  if (!values.length) {
    ctx.fillStyle = "#6b7280";
    ctx.font = "12px sans-serif";
    ctx.fillText("No data yet", pad + 8, height / 2);
    return;
  }

  const top = maxValue || Math.max(...values);
  const safeTop = top > 0 ? top : 1;
  const step = values.length === 1 ? 0 : (width - pad * 2) / (values.length - 1);

  ctx.strokeStyle = "#0f766e";
  ctx.lineWidth = 2;
  ctx.beginPath();

  values.forEach((value, index) => {
    const x = pad + step * index;
    const y = height - pad - (value / safeTop) * (height - pad * 2);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();
}

export { uid, formatDate, average, toast, parseFolderId };
