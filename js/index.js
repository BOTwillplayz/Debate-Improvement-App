import { bootstrap, getState, formatDate, average } from "./core.js";

function renderDashboard() {
  const state = getState();
  const stats = document.getElementById("stats");
  const recent = document.getElementById("recent");

  const evalTotals = state.evaluations.map((entry) => entry.total);
  const best = evalTotals.length ? Math.max(...evalTotals) : 0;

  stats.innerHTML = `
    <article class="stat"><p>Resources</p><strong>${state.resources.length}</strong></article>
    <article class="stat"><p>Speeches</p><strong>${state.speeches.length}</strong></article>
    <article class="stat"><p>Skills Logged</p><strong>${state.skills.length}</strong></article>
    <article class="stat"><p>Best Eval</p><strong>${best || "-"}</strong></article>
  `;

  const recentRows = [
    ...state.evaluations.slice(0, 3).map((item) => `
      <article class="item">
        <div class="item-head"><h3>${item.event}</h3><span class="badge">${item.total}/300</span></div>
        <p class="meta">${formatDate(item.date)} · ${item.motion}</p>
      </article>
    `),
  ];

  if (!recentRows.length) {
    recent.innerHTML = `<p class="empty">No rounds logged yet. Start in Evaluations.</p>`;
    return;
  }
  recent.innerHTML = recentRows.join("");

  const insight = document.getElementById("insight");
  const lastFive = state.skills.slice(0, 5).map((item) => item.score);
  insight.textContent = lastFive.length
    ? `Recent skill average: ${average(lastFive).toFixed(1)}/10. Keep entries consistent to see trends.`
    : "Add skill entries to unlock trend guidance.";
}

await bootstrap("index.html");
renderDashboard();
