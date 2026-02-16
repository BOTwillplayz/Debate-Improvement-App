import {
  bootstrap,
  getState,
  uid,
  formatDate,
  toast,
  validateUploadFile,
  saveFileBlob,
  createResource,
  connectDrive,
  importDriveFolder,
  attachDownloadDeleteHandlers,
} from "./core.js";

function getFilters() {
  return {
    search: document.getElementById("resourceSearch").value.trim().toLowerCase(),
    category: document.getElementById("resourceCategory").value,
    sort: document.getElementById("resourceSort").value,
    driveSort: document.getElementById("driveSort").value,
  };
}

function sortResources(items, sort) {
  if (sort === "oldest") return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (sort === "titleAsc") return items.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === "titleDesc") return items.sort((a, b) => b.title.localeCompare(a.title));
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function sortDriveFiles(items, mode) {
  if (mode === "pathAsc") return items.sort((a, b) => (a.drivePath || "").localeCompare(b.drivePath || "") || a.fileName.localeCompare(b.fileName));
  if (mode === "pathDesc") return items.sort((a, b) => (b.drivePath || "").localeCompare(a.drivePath || "") || a.fileName.localeCompare(b.fileName));
  if (mode === "modNewest") return items.sort((a, b) => (Date.parse(b.driveModifiedTime || "") || 0) - (Date.parse(a.driveModifiedTime || "") || 0));
  if (mode === "modOldest") return items.sort((a, b) => (Date.parse(a.driveModifiedTime || "") || 0) - (Date.parse(b.driveModifiedTime || "") || 0));
  if (mode === "nameDesc") return items.sort((a, b) => b.fileName.localeCompare(a.fileName));
  return items.sort((a, b) => a.fileName.localeCompare(b.fileName));
}

function addNode(root, segments, file) {
  if (!segments.length) {
    root.files.push(file);
    return;
  }
  const [head, ...rest] = segments;
  if (!root.children[head]) root.children[head] = { name: head, children: {}, files: [] };
  addNode(root.children[head], rest, file);
}

function renderNode(node) {
  const folders = Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name));
  const folderHtml = folders
    .map((folder) => `<details open><summary>${folder.name}</summary>${renderNode(folder)}</details>`)
    .join("");
  const fileHtml = node.files
    .map(
      (file) => `<div class="tree-file"><span>${file.fileName}</span><button class="subtle" data-type="resources" data-id="${file.id}" data-action="download">Open</button></div>`
    )
    .join("");
  return `${folderHtml}${fileHtml}`;
}

function render() {
  const state = getState();
  const list = document.getElementById("resourceList");
  const tree = document.getElementById("driveTree");
  const filters = getFilters();

  const nonDrive = state.resources.filter((item) => item.source !== "drive");
  const drive = state.resources.filter((item) => item.source === "drive");

  const visible = sortResources(
    nonDrive.filter((item) => {
      if (filters.category && item.category !== filters.category) return false;
      if (filters.search && !(`${item.title} ${item.fileName || ""}`).toLowerCase().includes(filters.search)) return false;
      return true;
    }),
    filters.sort
  );

  list.innerHTML = visible.length
    ? visible
        .map(
          (item) => `
      <article class="item">
        <div class="item-head"><h3>${item.title}</h3><span class="badge">${item.category}</span></div>
        <p class="meta">${formatDate(item.createdAt)} · ${item.fileName || "No file"}</p>
        <div class="button-row">
          ${item.fileId ? `<button class="subtle" data-type="resources" data-id="${item.id}" data-action="download">Download</button>` : ""}
          <button class="danger" data-type="resources" data-id="${item.id}" data-action="delete">Delete</button>
        </div>
      </article>
    `
        )
        .join("")
    : `<p class="empty">No matching local resources.</p>`;

  const driveSorted = sortDriveFiles(
    drive.map((item) => ({ ...item, fileName: item.fileName || item.title })),
    filters.driveSort
  );

  if (!driveSorted.length) {
    tree.innerHTML = `<p class="empty">No Drive files imported yet.</p>`;
    return;
  }

  const root = { children: {}, files: [] };
  driveSorted.forEach((file) => {
    const segments = (file.drivePath || "").split("/").filter(Boolean);
    addNode(root, segments, file);
  });
  tree.innerHTML = renderNode(root);
}

function bindForms() {
  const uploadForm = document.getElementById("resourceForm");
  uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(uploadForm);
    const file = form.get("file");
    const error = validateUploadFile(file);
    if (error) {
      toast(error, true);
      return;
    }

    const title = String(form.get("title") || "").trim();
    const category = String(form.get("category") || "Other");
    const state = getState();
    const duplicate = state.resources.find(
      (item) => item.source !== "drive" && item.title.toLowerCase() === title.toLowerCase() && item.fileName === file.name
    );
    if (duplicate) {
      toast("Duplicate resource already exists.", true);
      return;
    }

    const fileId = await saveFileBlob(file, file.name, file.type);
    await createResource({
      id: uid(),
      source: "local",
      title,
      category,
      fileId,
      fileName: file.name,
      createdAt: new Date().toISOString(),
    });

    uploadForm.reset();
    render();
    toast("Resource saved.");
  });

  const driveForm = document.getElementById("driveForm");
  const driveStatus = document.getElementById("driveStatus");
  const connectBtn = document.getElementById("driveConnectBtn");

  connectBtn.addEventListener("click", async () => {
    const clientId = String(document.getElementById("driveClientId").value || "").trim();
    if (!clientId) {
      toast("Enter your Google OAuth Client ID.", true);
      return;
    }
    try {
      await connectDrive(clientId);
      driveStatus.textContent = "Connected. You can import now.";
      toast("Google Drive connected.");
    } catch (error) {
      toast(`Drive connection failed: ${error.message}`, true);
      driveStatus.textContent = "Connection failed.";
    }
  });

  driveForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const clientId = String(document.getElementById("driveClientId").value || "").trim();
    const folder = String(document.getElementById("driveFolder").value || "").trim();
    if (!clientId || !folder) {
      toast("Client ID and folder link/ID are required.", true);
      return;
    }

    try {
      driveStatus.textContent = "Importing...";
      const result = await importDriveFolder({
        clientId,
        folderInput: folder,
        onProgress: (count) => {
          driveStatus.textContent = `Scanning/importing... ${count} files found`;
        },
      });
      driveStatus.textContent = `Done: ${result.imported} new, ${result.updated} updated, ${result.skipped} skipped`;
      toast("Drive import complete.");
      render();
    } catch (error) {
      driveStatus.textContent = "Import failed.";
      toast(`Drive import failed: ${error.message}`, true);
    }
  });

  ["resourceSearch", "resourceCategory", "resourceSort", "driveSort"].forEach((id) => {
    document.getElementById(id).addEventListener("input", render);
    document.getElementById(id).addEventListener("change", render);
  });
}

await bootstrap("resources.html");
attachDownloadDeleteHandlers("resources", render);
bindForms();
render();
