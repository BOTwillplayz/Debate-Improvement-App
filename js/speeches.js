import {
  bootstrap,
  getState,
  uid,
  formatDate,
  toast,
  saveFileBlob,
  validateUploadFile,
  createSpeech,
  attachDownloadDeleteHandlers,
} from "./core.js";

function filters() {
  return {
    q: document.getElementById("speechSearch").value.trim().toLowerCase(),
    role: document.getElementById("speechRole").value,
  };
}

function render() {
  const state = getState();
  const list = document.getElementById("speechList");
  const f = filters();

  const items = state.speeches.filter((item) => {
    if (f.role && item.role !== f.role) return false;
    if (f.q && !(`${item.motion} ${item.content} ${item.notes || ""}`).toLowerCase().includes(f.q)) return false;
    return true;
  });

  list.innerHTML = items.length
    ? items
        .map(
          (item) => `
    <article class="item">
      <div class="item-head"><h3>${item.motion}</h3><span class="badge">${item.role}</span></div>
      <p class="meta">${formatDate(item.createdAt)}</p>
      <p>${item.content}</p>
      <p class="meta">${item.notes || "No notes"}</p>
      <div class="button-row">
        ${item.fileId ? `<button class="subtle" data-type="speeches" data-id="${item.id}" data-action="download">Download file</button>` : ""}
        <button class="danger" data-type="speeches" data-id="${item.id}" data-action="delete">Delete</button>
      </div>
    </article>
  `
        )
        .join("")
    : `<p class="empty">No speeches match your filters.</p>`;
}

function bind() {
  const form = document.getElementById("speechForm");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(form);
    const content = String(fd.get("content") || "").trim();
    if (content.length < 40) {
      toast("Speech content must be at least 40 characters.", true);
      return;
    }

    const file = fd.get("file");
    let fileId = "";
    let fileName = "";
    if (file instanceof File && file.size) {
      const err = validateUploadFile(file);
      if (err) {
        toast(err, true);
        return;
      }
      fileId = await saveFileBlob(file, file.name, file.type);
      fileName = file.name;
    }

    await createSpeech({
      id: uid(),
      motion: String(fd.get("motion") || "").trim(),
      role: String(fd.get("role") || "").trim(),
      content,
      notes: String(fd.get("notes") || "").trim(),
      fileId,
      fileName,
      createdAt: new Date().toISOString(),
    });

    form.reset();
    render();
    toast("Speech saved.");
  });

  ["speechSearch", "speechRole"].forEach((id) => {
    document.getElementById(id).addEventListener("input", render);
    document.getElementById(id).addEventListener("change", render);
  });
}

await bootstrap("speeches.html");
attachDownloadDeleteHandlers("speeches", render);
bind();
render();
