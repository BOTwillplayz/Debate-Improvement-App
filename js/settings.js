import {
  bootstrap,
  getThemePresets,
  getThemeSettings,
  saveThemePreset,
  saveCustomTheme,
  exportBackup,
  importBackup,
  toast,
  applySavedAppearance,
} from "./core.js";

function setInputs(theme) {
  document.getElementById("bgColor").value = theme.bg;
  document.getElementById("surfaceColor").value = theme.surface;
  document.getElementById("textColor").value = theme.text;
  document.getElementById("accentColor").value = theme.accent;
  document.getElementById("mutedColor").value = theme.muted;
  document.getElementById("borderColor").value = theme.border;
  document.getElementById("radius").value = String(theme.radius);
  document.getElementById("width").value = String(theme.maxw);
  document.getElementById("space").value = String(theme.space);
  document.getElementById("bodyFont").value = theme.bodyFont;
  document.getElementById("headingFont").value = theme.headingFont;
}

function bindThemeEditor() {
  const presets = getThemePresets();
  const presetSelect = document.getElementById("themePreset");

  presetSelect.innerHTML = Object.entries(presets)
    .map(([key, value]) => `<option value="${key}">${value.label}</option>`)
    .join("");
  presetSelect.insertAdjacentHTML("beforeend", `<option value="custom">Custom</option>`);

  const current = getThemeSettings();
  presetSelect.value = current.preset;
  setInputs(current.active);

  document.getElementById("presetForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const key = presetSelect.value;
    const latest = getThemeSettings();
    if (key === "custom" && !latest.custom) {
      toast("No saved custom theme yet. Create one below.", true);
      return;
    }
    await saveThemePreset(key);
    const after = getThemeSettings();
    setInputs(after.active);
    toast("Preset applied.");
  });

  document.getElementById("customThemeForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const custom = {
      label: "Custom",
      bg: document.getElementById("bgColor").value,
      surface: document.getElementById("surfaceColor").value,
      surfaceSoft: document.getElementById("surfaceColor").value,
      text: document.getElementById("textColor").value,
      accent: document.getElementById("accentColor").value,
      muted: document.getElementById("mutedColor").value,
      border: document.getElementById("borderColor").value,
      radius: Number(document.getElementById("radius").value || 14),
      maxw: Number(document.getElementById("width").value || 1120),
      space: Number(document.getElementById("space").value || 1),
      bodyFont: document.getElementById("bodyFont").value,
      headingFont: document.getElementById("headingFont").value,
    };
    await saveCustomTheme(custom);
    presetSelect.value = "custom";
    toast("Custom theme saved and applied.");
  });

  ["bgColor", "surfaceColor", "textColor", "accentColor", "mutedColor", "borderColor", "radius", "width", "space", "bodyFont", "headingFont"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => {
      const live = {
        label: "Preview",
        bg: document.getElementById("bgColor").value,
        surface: document.getElementById("surfaceColor").value,
        surfaceSoft: document.getElementById("surfaceColor").value,
        text: document.getElementById("textColor").value,
        accent: document.getElementById("accentColor").value,
        muted: document.getElementById("mutedColor").value,
        border: document.getElementById("borderColor").value,
        radius: Number(document.getElementById("radius").value || 14),
        maxw: Number(document.getElementById("width").value || 1120),
        space: Number(document.getElementById("space").value || 1),
        bodyFont: document.getElementById("bodyFont").value,
        headingFont: document.getElementById("headingFont").value,
      };
      document.documentElement.style.setProperty("--bg", live.bg);
      document.documentElement.style.setProperty("--surface", live.surface);
      document.documentElement.style.setProperty("--surface-soft", live.surfaceSoft);
      document.documentElement.style.setProperty("--text", live.text);
      document.documentElement.style.setProperty("--muted", live.muted);
      document.documentElement.style.setProperty("--accent", live.accent);
      document.documentElement.style.setProperty("--border", live.border);
      document.documentElement.style.setProperty("--radius", `${live.radius}px`);
      document.documentElement.style.setProperty("--maxw", `${live.maxw}px`);
      document.documentElement.style.setProperty("--space", String(live.space));
      document.documentElement.style.setProperty("--font-body", `\"${live.bodyFont}\", system-ui, sans-serif`);
      document.documentElement.style.setProperty("--font-heading", `\"${live.headingFont}\", \"${live.bodyFont}\", system-ui, sans-serif`);
    });
  });

  document.getElementById("resetPreview").addEventListener("click", () => {
    applySavedAppearance();
    const after = getThemeSettings();
    setInputs(after.active);
  });
}

function bindDataTools() {
  document.getElementById("exportBtn").addEventListener("click", async () => {
    const payload = await exportBackup();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replaceAll(":", "-").slice(0, 19);
    a.href = url;
    a.download = `debate-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Backup exported.");
  });

  document.getElementById("importInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!window.confirm("Import backup and replace current local data?")) {
      event.target.value = "";
      return;
    }
    try {
      const payload = JSON.parse(await file.text());
      await importBackup(payload);
      toast("Backup imported. Reloading current page style/data.");
      window.location.reload();
    } catch (error) {
      toast(`Import failed: ${error.message}`, true);
    } finally {
      event.target.value = "";
    }
  });
}

await bootstrap("settings.html");
bindThemeEditor();
bindDataTools();
