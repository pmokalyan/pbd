
/* Program Status — Roadmap (Local Single-User SPA)
 * Storage: localStorage
 * Export: PNG (html2canvas) / PDF (jsPDF)
 */

(() => {
  "use strict";

  /**********************
   * Utility / Storage
   **********************/
  const LS_KEY = "roadmap_local_v1";
  const genId = () => Math.random().toString(36).slice(2, 9);
  const nowISO = () => new Date().toISOString();

  const STATUS = ["not_started", "in_progress", "completed", "blocked"];
  const STATUS_LABEL = {
    not_started: "Not Started •",
    in_progress: "In Progress ➜",
    completed: "Completed ✓",
    blocked: "Blocked ✗",
  };

  const $ = (sel, el = document) => el.querySelector(sel);

  function defaultData() {
    return {
      meta: { createdAt: nowISO(), updatedAt: nowISO(), title: "Program Status — Roadmap" },
      phases: [
        { id: genId(), title: "Phase 1", steps: [] },
        { id: genId(), title: "Phase 2", steps: [] },
        { id: genId(), title: "Phase 3", steps: [] },
        { id: genId(), title: "Phase 4", steps: [] },
      ],
      activePhaseId: null
    };
  }

  function loadData() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return defaultData();
      const parsed = JSON.parse(raw);
      if (!parsed.phases || !Array.isArray(parsed.phases)) return defaultData();
      return parsed;
    } catch {
      return defaultData();
    }
  }

  let data = loadData();
  if (!data.activePhaseId && data.phases[0]) data.activePhaseId = data.phases[0].id;

  function saveData() {
    data.meta.updatedAt = nowISO();
    localStorage.setItem(LS_KEY, JSON.stringify(data));
    render(); // keep UI in sync
  }

  function resetData() {
    if (!confirm("This will clear your local data. Continue?")) return;
    localStorage.removeItem(LS_KEY);
    data = defaultData();
    render();
  }

  /**********************
   * Status aggregation
   **********************/
  function aggregateFromTasks(tasks) {
    if (!tasks || tasks.length === 0) return { status: "not_started", pct: 0 };
    const counts = { not_started: 0, in_progress: 0, completed: 0, blocked: 0 };
    tasks.forEach(t => counts[t.status] = (counts[t.status] || 0) + 1);

    let status = "not_started";
    if (counts.blocked > 0) status = "blocked";
    else if (counts.completed === tasks.length) status = "completed";
    else if (counts.in_progress > 0 || (counts.completed > 0 && counts.completed < tasks.length)) status = "in_progress";

    const pct = Math.round((counts.completed / tasks.length) * 100);
    return { status, pct };
  }

  function aggregateStep(step) {
    return aggregateFromTasks(step.tasks || []);
  }

  function aggregatePhase(phase) {
    if (!phase.steps || phase.steps.length === 0) return { status: "not_started", pct: 0 };
    const stepAggs = phase.steps.map(aggregateStep);
    const pct = Math.round(stepAggs.reduce((a, s) => a + s.pct, 0) / stepAggs.length);

    const anyBlocked = stepAggs.some(s => s.status === "blocked");
    const allCompleted = stepAggs.every(s => s.status === "completed");
    const anyInProgress = stepAggs.some(s => s.status === "in_progress");

    let status = "not_started";
    if (anyBlocked) status = "blocked";
    else if (allCompleted) status = "completed";
    else if (anyInProgress) status = "in_progress";
    return { status, pct };
  }

  /**********************
   * Rendering
   **********************/
  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function getEditMode() {
    return localStorage.getItem(LS_KEY + "_edit") === "true";
  }
  function setEditMode(v) {
    localStorage.setItem(LS_KEY + "_edit", v ? "true" : "false");
  }

  function renderPhasesSidebar() {
    const sb = $("#phasesSidebar");
    sb.innerHTML = `<h3>Phases</h3>`;

    data.phases.forEach(phase => {
      const agg = aggregatePhase(phase);
      const active = data.activePhaseId === phase.id ? "active" : "";
      const el = document.createElement("div");
      el.className = `phase-item ${active}`;
      el.innerHTML = `
        <div class="phase-top">
          <div class="phase-title">${escapeHtml(phase.title)}</div>
          <div class="status-badge ${agg.status}">${STATUS_LABEL[agg.status]}</div>
        </div>
        <div class="progressbar" aria-label="progress ${agg.pct}%"><span style="width:${agg.pct}%"></span></div>
      `;
      el.addEventListener("click", () => {
        data.activePhaseId = phase.id;
        render();
      });
      sb.appendChild(el);
    });

    if (getEditMode()) {
      const add = document.createElement("div");
      add.className = "phase-item";
      add.innerHTML = `<button class="btn" style="width:100%;">+ Add Phase</button>`;
      add.querySelector("button").addEventListener("click", () => {
        const title = prompt("New phase title:", `Phase ${data.phases.length + 1}`);
        if (!title) return;
        data.phases.push({ id: genId(), title: title.trim(), steps: [] });
        data.activePhaseId = data.phases[data.phases.length - 1].id;
        saveData();
      });
      sb.appendChild(add);
    }
  }

  function renderTaskRow(step, task) {
    const row = document.createElement("div");
    row.className = "task";
    row.dataset.taskId = task.id;
    row.innerHTML = `
      <div class="slot">
        <button class="iconbtn" title="Delete task" data-action="delete      <input class="title" type="text" value="${escapeAttr(task.title)}" ${getEditMode() ? "" : "readonly"} />
      </div>
      <div class="slot chips">
        ${STATUS.map(s => `
          <span class="chip ${s} ${task.status === s ? "active" : ""}" data-status="${s}">
            ${STATUS_LABEL[s]}
          </span>
        `).join("")}
      </div>
    `;

    const titleInput = row.querySelector(".title");
    titleInput.addEventListener("change", () => {
      if (!getEditMode()) return;
      task.title = titleInput.value.trim();
      task.updatedAt = nowISO();
      saveData();
    });

    row.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (btn?.dataset.action === "delete-task") {
        if (!getEditMode()) return;
        if (!confirm("Delete this task?")) return;
        step.tasks = (step.tasks || []).filter(t => t !== task);
        saveData();
        return;
      }
      const chip = e.target.closest(".chip");
      if (chip) {
        // Allow status change even in view mode (convenient)
        task.status = chip.dataset.status;
        task.updatedAt = nowISO();
        saveData();
      }
    });

    return row;
  }

  function renderMainPanel() {
    const panel = $("#mainPanel");
    const active = data.phases.find(p => p.id === data.activePhaseId) || data.phases[0];
    if (!active) {
      panel.innerHTML = `<div class="muted">No phases yet. Click <b>Edit</b> and add your first phase.</div>`;
      return;
    }
    const agg = aggregatePhase(active);

    const frag = document.createDocumentFragment();
    const header = document.createElement("div");
    header.className = "phase-headline";
    header.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <h2 style="margin:0;">${escapeHtml(active.title)}</h2>
        <span class="status-badge ${agg.status}">${STATUS_LABEL[agg.status]}</span>
      </div>
      <div class="right">
        <div class="muted">${active.steps.length} steps • ${agg.pct}% complete</div>
        ${getEditMode() ? `
          <button class="btn" id="renamePhaseBtn">Rename</button>
          <button class="btn" id="deletePhaseBtn">Delete</button>
        ` : ""}
      </div>
    `;
    frag.appendChild(header);

    const stepsContainer = document.createElement("div");
    stepsContainer.id = "stepsContainer";

    active.steps.forEach((step) => {
      const sa = aggregateStep(step);
      const stepEl = document.createElement("div");
      stepEl.className = "step";
      stepEl.innerHTML = `
        <div class="step-top">
          <div class="step-title">${escapeHtml(step.title)}</div>
          <div class="step-meta">
            <span class="step-status-chip ${sa.status}">${STATUS_LABEL[sa.status]}</span>
            <span class="muted">${sa.pct}%</span>
            ${getEditMode() ? `
              <button class="iconbtn" title="Rename step" data-action="rename-stepelete step" data     </div>
        </div>
        <div class="divider"></div>
        <div class="tasklist"></div>
        ${getEditMode() ? `<div style="margin-top:8px;"><button class="btn</button></div>` : ""}
      `;

      const tl = stepEl.querySelector(".tasklist");
      (step.tasks || []).forEach(task => {
        tl.appendChild(renderTaskRow(step, task));
      });

      stepEl.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;
        const action = btn.dataset.action;
        if (action === "rename-step") {
          const name = prompt("Rename step:", step.title);
          if (!name) return;
          step.title = name.trim();
          saveData();
        } else if (action === "delete-step") {
          if (!confirm("Delete this step and its tasks?")) return;
          active.steps = active.steps.filter(s => s !== step);
          saveData();
        } else if (action === "add-task") {
          const tTitle = prompt("Task title:", "New task");
          if (!tTitle) return;
          step.tasks = step.tasks || [];
          step.tasks.push({ id: genId(), title: tTitle.trim(), status: "not_started", updatedAt: nowISO() });
          saveData();
        }
      });

      stepsContainer.appendChild(stepEl);
    });

    if (getEditMode()) {
      const addStepBox = document.createElement("div");
      addStepBox.style = "margin: 10px 6px;";
      addStepBox.innerHTML = `<button class="btn">+ Add Step</button>`;
      addStepBox.querySelector("button").addEventListener("click", () => {
        const title = prompt("New step title:", `Step ${active.steps.length + 1}`);
        if (!title) return;
        active.steps.push({ id: genId(), title: title.trim(), tasks: [] });
        saveData();
      });
      stepsContainer.appendChild(addStepBox);
    }

    frag.appendChild(stepsContainer);
    panel.innerHTML = "";
    panel.appendChild(frag);

    if (getEditMode()) {
      $("#renamePhaseBtn")?.addEventListener("click", () => {
        const name = prompt("Rename phase:", active.title);
        if (!name) return;
        active.title = name.trim(); saveData();
      });
      $("#deletePhaseBtn")?.addEventListener("click", () => {
        if (!confirm("Delete this phase and everything inside it?")) return;
        data.phases = data.phases.filter(p => p !== active);
        data.activePhaseId = data.phases[0]?.id || null;
        saveData();
      });
    }
  }

  function render() {
    document.body.setAttribute("data-edit", getEditMode() ? "true" : "false");
    renderPhasesSidebar();
    renderMainPanel();
  }

  /**********************
   * Export (PNG / PDF)
   **********************/
  async function exportPNG() {
    const node = document.getElementById("exportTarget");
    if (!window.html2canvas) {
      alert("html2canvas not loaded. Check your internet or CDN.");
      return;
    }
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: getComputedStyle(document.body).backgroundColor });
    const dataUrl = canvas.toDataURL("image/png");
    downloadDataUrl(dataUrl, `roadmap_${new Date().toISOString().slice(0, 10)}.png`);
  }

  async function exportPDF() {
    const node = document.getElementById("exportTarget");
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert("jsPDF not loaded. Check your internet or CDN.");
      return;
    }
    const { jsPDF } = window.jspdf;
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#0b1220" });
    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF("p", "pt", "letter");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 24;
    const usableWidth = pageWidth - 2 * margin;

    const imgWidth = usableWidth;
    const imgHeight = canvas.height * (imgWidth / canvas.width);

    if (imgHeight <= pageHeight - 2 * margin) {
      pdf.addImage(imgData, "PNG", margin, margin, imgWidth, imgHeight);
    } else {
      // Multi-page slice
      let remainingHeight = imgHeight;
      let sY = 0;
      const pageUsableHeight = pageHeight - 2 * margin;
      const ratio = imgWidth / canvas.width;
      const sliceHeightPx = Math.floor(pageUsableHeight / ratio);

      while (remainingHeight > 0) {
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = Math.min(sliceHeightPx, canvas.height - sY);
        const ctx = sliceCanvas.getContext("2d");
        ctx.drawImage(canvas, 0, sY, canvas.width, sliceCanvas.height, 0, 0, canvas.width, sliceCanvas.height);
        const sliceData = sliceCanvas.toDataURL("image/png");
        const sliceHeightPt = sliceCanvas.height * ratio;

        pdf.addImage(sliceData, "PNG", margin, margin, imgWidth, sliceHeightPt);

        sY += sliceCanvas.height;
        remainingHeight -= pageUsableHeight;
        if (remainingHeight > 0) pdf.addPage();
      }
    }

    pdf.save(`roadmap_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  function downloadDataUrl(dataUrl, filename) {
    const a = document.createElement("a");
    a.href = dataUrl; a.download = filename; a.click();
  }

  /**********************
   * Import / Export JSON
   **********************/
  function exportJSON() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `roadmap_data_${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  }

  function importJSON() {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "application/json";
    input.onchange = () => {
      const file = input.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = JSON.parse(reader.result);
          if (!imported.phases || !Array.isArray(imported.phases)) throw new Error("Invalid file");
          data = imported;
          if (!data.activePhaseId && data.phases[0]) data.activePhaseId = data.phases[0].id;
          saveData();
        } catch {
          alert("Invalid JSON file.");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  /**********************
   * Init / Events
   **********************/
  function init() {
    // Buttons
    const toggle = $("#toggleEdit");
    toggle.addEventListener("click", () => {
      const newMode = !getEditMode();
      setEditMode(newMode);
      toggle.textContent = newMode ? "Done" : "Edit";
      render();
    });
    toggle.textContent = getEditMode() ? "Done" : "Edit";

    $("#exportPNG").addEventListener("click", exportPNG);
    $("#exportPDF").addEventListener("click", exportPDF);
    $("#exportJSON").addEventListener("click", exportJSON);
    $("#importJSON").addEventListener("click", importJSON);
    $("#resetData").addEventListener("click", resetData);

    // Theme
    const themePicker = $("#themePicker");
    const savedTheme = localStorage.getItem(LS_KEY + "_theme") || "azure";
    document.body.setAttribute("data-theme", savedTheme);
    themePicker.value = savedTheme;
    themePicker.addEventListener("change", () => {
      document.body.setAttribute("data-theme", themePicker.value);
      localStorage.setItem(LS_KEY + "_theme", themePicker.value);
    });

    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
