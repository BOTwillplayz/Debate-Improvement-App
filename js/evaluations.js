import {
  bootstrap,
  getState,
  uid,
  toast,
  average,
  createEvaluation,
  removeEvaluation,
  formatDate,
  drawLineChart,
} from "./core.js";

function filters() {
  return {
    search: document.getElementById("evalSearch").value.trim().toLowerCase(),
  };
}

function getCategoryScores(item) {
  const content = item.content ?? item.matter ?? 0;
  const style = item.style ?? item.method ?? 0;
  const strategy = item.strategy ?? item.manner ?? 0;
  return { content, style, strategy };
}

function render() {
  const state = getState();
  const list = document.getElementById("evalList");
  const insight = document.getElementById("evalInsight");
  const canvas = document.getElementById("evalChart");
  const f = filters();

  const filtered = state.evaluations.filter((item) => {
    if (!f.search) return true;
    return `${item.event} ${item.motion}`.toLowerCase().includes(f.search);
  });

  if (!state.evaluations.length) {
    insight.innerHTML = `<p class="empty">No rounds logged yet.</p>`;
    list.innerHTML = "";
    drawLineChart(canvas, []);
    return;
  }

  const totals = state.evaluations.map((item) => item.total);
  const change = totals.length > 1 ? totals[0] - totals[totals.length - 1] : 0;

  insight.innerHTML = `
    <p><strong>Average total:</strong> ${average(totals).toFixed(1)}/300</p>
    <p><strong>Best total:</strong> ${Math.max(...totals)}/300</p>
    <p><strong>Change since earliest log:</strong> ${change >= 0 ? "+" : ""}${change}</p>
  `;

  list.innerHTML = filtered.length
    ? filtered
        .map(
          (item) => `
      <article class="item">
        <div class="item-head"><h3>${item.event} · ${item.total}/300</h3><span class="meta">${formatDate(item.date)}</span></div>
        <p class="meta">${item.motion}</p>
        <p>C/S/S: ${getCategoryScores(item).content}/${getCategoryScores(item).style}/${getCategoryScores(item).strategy}</p>
        <p><strong>Strength:</strong> ${item.strength}</p>
        <p><strong>Weakness:</strong> ${item.weakness}</p>
        <p><strong>Action:</strong> ${item.action}</p>
        <div class="button-row"><button class="danger" data-id="${item.id}" data-action="delete">Delete</button></div>
      </article>
    `
        )
        .join("")
    : `<p class="empty">No matching rounds.</p>`;

  drawLineChart(canvas, state.evaluations.slice().reverse().map((item) => item.total), 300);
}

function bind() {
  const form = document.getElementById("evalForm");
  form.date.value = new Date().toISOString().split("T")[0];

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(form);

    const contentSubs = [
      Number(fd.get("contentAnalysis")),
      Number(fd.get("contentEvidence")),
      Number(fd.get("contentClash")),
    ];
    const styleSubs = [
      Number(fd.get("styleClarity")),
      Number(fd.get("stylePersuasion")),
      Number(fd.get("styleDelivery")),
    ];
    const strategySubs = [
      Number(fd.get("strategyFraming")),
      Number(fd.get("strategyWeighing")),
      Number(fd.get("strategyTime")),
    ];

    const allSubs = [...contentSubs, ...styleSubs, ...strategySubs];
    if (allSubs.some((n) => !Number.isFinite(n) || n < 1 || n > 10)) {
      toast("All subcategory scores must be between 1 and 10.", true);
      return;
    }

    const content = Math.round(average(contentSubs) * 10);
    const style = Math.round(average(styleSubs) * 10);
    const strategy = Math.round(average(strategySubs) * 10);

    const longFields = ["strength", "weakness", "action"];
    if (longFields.some((key) => String(fd.get(key) || "").trim().length < 20)) {
      toast("Reflection fields need at least 20 characters each.", true);
      return;
    }

    await createEvaluation({
      id: uid(),
      date: String(fd.get("date") || ""),
      event: String(fd.get("event") || "").trim(),
      motion: String(fd.get("motion") || "").trim(),
      content,
      style,
      strategy,
      subcategories: {
        content: {
          analysis: contentSubs[0],
          evidence: contentSubs[1],
          clash: contentSubs[2],
        },
        style: {
          clarity: styleSubs[0],
          persuasion: styleSubs[1],
          delivery: styleSubs[2],
        },
        strategy: {
          framing: strategySubs[0],
          weighing: strategySubs[1],
          timeManagement: strategySubs[2],
        },
      },
      total: content + style + strategy,
      strength: String(fd.get("strength") || "").trim(),
      weakness: String(fd.get("weakness") || "").trim(),
      action: String(fd.get("action") || "").trim(),
      createdAt: new Date().toISOString(),
    });

    form.reset();
    form.date.value = new Date().toISOString().split("T")[0];
    render();
    toast("Evaluation saved.");
  });

  document.getElementById("evalSearch").addEventListener("input", render);

  document.body.addEventListener("click", async (event) => {
    const btn = event.target;
    if (!(btn instanceof HTMLElement)) return;
    if (btn.dataset.action !== "delete" || !btn.dataset.id) return;
    if (!window.confirm("Delete this evaluation?")) return;
    await removeEvaluation(btn.dataset.id);
    render();
    toast("Deleted.");
  });

  window.addEventListener("resize", render);
}

await bootstrap("evaluations.html");
bind();
render();
