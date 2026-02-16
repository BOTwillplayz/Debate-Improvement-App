import {
  bootstrap,
  getState,
  uid,
  toast,
  average,
  createSkill,
  removeSkill,
  drawLineChart,
  formatDate,
} from "./core.js";

function render() {
  const state = getState();
  const summary = document.getElementById("skillSummary");
  const list = document.getElementById("skillList");
  const canvas = document.getElementById("skillChart");

  if (!state.skills.length) {
    summary.innerHTML = `<p class="empty">No skill logs yet.</p>`;
    list.innerHTML = "";
    drawLineChart(canvas, []);
    return;
  }

  const bySkill = {};
  state.skills.forEach((entry) => {
    if (!bySkill[entry.skill]) bySkill[entry.skill] = [];
    bySkill[entry.skill].push(entry.score);
  });

  const ranked = Object.entries(bySkill)
    .map(([skill, scores]) => ({ skill, avg: average(scores) }))
    .sort((a, b) => a.avg - b.avg);

  summary.innerHTML = `
    <p><strong>Lowest average:</strong> ${ranked[0].skill} (${ranked[0].avg.toFixed(1)}/10)</p>
    <p><strong>Last 5 average:</strong> ${average(state.skills.slice(0, 5).map((item) => item.score)).toFixed(1)}/10</p>
  `;

  list.innerHTML = state.skills
    .map(
      (item) => `
      <article class="item">
        <div class="item-head"><h3>${item.skill} · ${item.score}/10</h3><span class="meta">${formatDate(item.createdAt)}</span></div>
        <p>${item.target}</p>
        <div class="button-row"><button class="danger" data-id="${item.id}" data-action="delete">Delete</button></div>
      </article>
    `
    )
    .join("");

  drawLineChart(canvas, state.skills.slice().reverse().map((item) => item.score), 10);
}

function bind() {
  const form = document.getElementById("skillForm");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(form);
    const target = String(fd.get("target") || "").trim();
    const score = Number(fd.get("score"));

    if (target.length < 20) {
      toast("Target should be at least 20 characters.", true);
      return;
    }
    if (!Number.isFinite(score) || score < 1 || score > 10) {
      toast("Score must be between 1 and 10.", true);
      return;
    }

    await createSkill({
      id: uid(),
      skill: String(fd.get("skill") || ""),
      score,
      target,
      createdAt: new Date().toISOString(),
    });

    form.reset();
    render();
    toast("Skill logged.");
  });

  document.body.addEventListener("click", async (event) => {
    const btn = event.target;
    if (!(btn instanceof HTMLElement)) return;
    if (btn.dataset.action !== "delete" || !btn.dataset.id) return;
    if (!window.confirm("Delete this skill entry?")) return;
    await removeSkill(btn.dataset.id);
    render();
    toast("Deleted.");
  });

  window.addEventListener("resize", render);
}

await bootstrap("skills.html");
bind();
render();
