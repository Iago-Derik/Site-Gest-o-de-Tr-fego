/**
 * VIDEO HUB PRO 2.0 - Client Application Engine
 */

// --- CONFIGURAÇÃO DO SUPABASE ---
const SUPABASE_URL = "https://olofdrngtjktrvgopyun.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_5J0eCJlr7nPZcvIpopnhyQ_aHdlFfB4";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Intercepta todos os "fetches" para adicionar o Token de Autenticação
const originalFetch = window.fetch;
window.fetch = async function () {
  let [resource, config] = arguments;
  if (typeof resource === 'string' && resource.startsWith('/api/')) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session?.access_token) {
      config = config || {};
      config.headers = config.headers || {};
      config.headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  }
  return originalFetch.apply(this, [resource, config]);
};

// Lógica de Autenticação
async function checkAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  const authScreen = document.getElementById("authScreen");
  
  if (session) {
    authScreen.style.display = "none";
    fetchInitialData(); // Só carrega os dados DEPOIS de logado
  } else {
    authScreen.style.display = "flex";
  }
}

document.getElementById("btnLoginGoogle").addEventListener("click", async () => {
  await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin
    }
  });
});

document.addEventListener("DOMContentLoaded", () => {
  initEventListeners();
  checkAuth();
});
// ---------------------------------

// Application Global State
const state = {
  coursesData: null,
  currentCourse: null,
  currentVideo: null,
  loadedVideoId: null, // Tracks currently loaded video ID to prevent src reloading
  progress: { lastVideoId: null, videos: {} },
  notes: [],
  favorites: [],
  settings: {
    theme: "dark",
    accentColor: "indigo",
    autoPlayNext: true,
    playbackSpeed: parseFloat(localStorage.getItem("videohub_speed")) || 1.0,
    volume: parseFloat(localStorage.getItem("videohub_vol")) || 1.0,
    sidebarCollapsed: false,
  },
  currentFilter: "all",
  homeTopicFilter: "all",
  searchQuery: "",
  theaterMode: false,
  ambientMode: true,
  generatedThumbIds: new Set(),
  settingsRequestId: 0,
  workspace: { clients: [], campaigns: [], documents: [], reports: [] },
  currentClientId: null,
  workSection: "clients",
  metaInsights: null,
  gaInsights: null,
  autoplayTimer: null,
};

// DOM Elements Cache
const el = {
  // Navigation
  btnLogoHome: document.getElementById("btnLogoHome"),
  courseSelectorWrapper: document.getElementById("courseSelectorWrapper"),
  courseSelectorBtn: document.getElementById("courseSelectorBtn"),
  currentCourseLabel: document.getElementById("currentCourseLabel"),
  courseDropdownMenu: document.getElementById("courseDropdownMenu"),
  globalSearchInput: document.getElementById("globalSearchInput"),
  btnClearSearch: document.getElementById("btnClearSearch"),
  headerCourseProgress: document.getElementById("headerCourseProgress"),
  headerProgressPercent: document.getElementById("headerProgressPercent"),
  headerProgressBar: document.getElementById("headerProgressBar"),
  headerProgressCount: document.getElementById("headerProgressCount"),
  navBtnHome: document.getElementById("navBtnHome"),
  navBtnCourses: document.getElementById("navBtnCourses"),
  navBtnPlayer: document.getElementById("navBtnPlayer"),
  navBtnNotes: document.getElementById("navBtnNotes"),
  navBtnFavorites: document.getElementById("navBtnFavorites"),
  navBtnWork: document.getElementById("navBtnWork"),
  btnRescan: document.getElementById("btnRescan"),
  btnSettings: document.getElementById("btnSettings"),
  btnShortcuts: document.getElementById("btnShortcuts"),

  // Views
  viewHome: document.getElementById("viewHome"),
  viewCourses: document.getElementById("viewCourses"),
  viewPlayer: document.getElementById("viewPlayer"),
  viewNotes: document.getElementById("viewNotes"),
  viewFavorites: document.getElementById("viewFavorites"),
  viewWork: document.getElementById("viewWork"),

  // Home View
  continueHeroContainer: document.getElementById("continueHeroContainer"),
  heroCourseModule: document.getElementById("heroCourseModule"),
  heroLessonTitle: document.getElementById("heroLessonTitle"),
  heroLessonSubtitle: document.getElementById("heroLessonSubtitle"),
  heroProgressWrapper: document.getElementById("heroProgressWrapper"),
  heroProgressFill: document.getElementById("heroProgressFill"),
  heroTimeLeft: document.getElementById("heroTimeLeft"),
  heroPercent: document.getElementById("heroPercent"),
  heroActions: document.getElementById("heroActions"),
  btnHeroResume: document.getElementById("btnHeroResume"),
  btnHeroResumeText: document.getElementById("btnHeroResumeText"),
  btnHeroMarkCompleted: document.getElementById("btnHeroMarkCompleted"),
  heroThumbWrapper: document.getElementById("heroThumbWrapper"),
  heroThumbImg: document.getElementById("heroThumbImg"),
  heroDurationTag: document.getElementById("heroDurationTag"),

  statTotalVideos: document.getElementById("statTotalVideos"),
  statCompletedVideos: document.getElementById("statCompletedVideos"),
  statInProgressVideos: document.getElementById("statInProgressVideos"),
  statTotalNotes: document.getElementById("statTotalNotes"),

  homeFilterTabs: document.getElementById("homeFilterTabs"),
  homeVideosGrid: document.getElementById("homeVideosGrid"),
  inProgressCountBadge: document.getElementById("inProgressCountBadge"),
  curriculumTrackContainer: document.getElementById("curriculumTrackContainer"),
  homeTopicsList: document.getElementById("homeTopicsList"),
  btnExpandAllModules: document.getElementById("btnExpandAllModules"),
  btnCollapseAllModules: document.getElementById("btnCollapseAllModules"),

  // All Courses View
  allCoursesContainer: document.getElementById("allCoursesContainer"),

  // Player View
  playerLayout: document.getElementById("playerLayout"),
  btnBackToHome: document.getElementById("btnBackToHome"),
  bcCourse: document.getElementById("bcCourse"),
  bcModule: document.getElementById("bcModule"),
  btnToggleTheater: document.getElementById("btnToggleTheater"),
  btnToggleAmbient: document.getElementById("btnToggleAmbient"),
  videoContainer: document.getElementById("videoContainer"),
  ambilightCanvas: document.getElementById("ambilightCanvas"),
  mainVideoPlayer: document.getElementById("mainVideoPlayer"),
  videoClickSurface: document.getElementById("videoClickSurface"),
  videoActionFeedback: document.getElementById("videoActionFeedback"),
  feedbackIcon: document.getElementById("feedbackIcon"),
  videoPreloadOverlay: document.getElementById("videoPreloadOverlay"),
  preloadThumbImg: document.getElementById("preloadThumbImg"),
  preloadLessonTitle: document.getElementById("preloadLessonTitle"),
  btnBigPlay: document.getElementById("btnBigPlay"),
  autoplayOverlay: document.getElementById("autoplayOverlay"),
  autoplayCountdown: document.getElementById("autoplayCountdown"),
  autoplayNextTitle: document.getElementById("autoplayNextTitle"),
  btnAutoplayNow: document.getElementById("btnAutoplayNow"),
  btnAutoplayCancel: document.getElementById("btnAutoplayCancel"),
  videoControls: document.getElementById("videoControls"),

  // Video Controls
  scrubContainer: document.getElementById("scrubContainer"),
  scrubHoverTime: document.getElementById("scrubHoverTime"),
  scrubLoaded: document.getElementById("scrubLoaded"),
  scrubProgress: document.getElementById("scrubProgress"),
  scrubHandle: document.getElementById("scrubHandle"),
  ctrlPlayPause: document.getElementById("ctrlPlayPause"),
  ctrlRewind10: document.getElementById("ctrlRewind10"),
  ctrlForward10: document.getElementById("ctrlForward10"),
  ctrlMute: document.getElementById("ctrlMute"),
  ctrlVolumeSlider: document.getElementById("ctrlVolumeSlider"),
  timeCurrent: document.getElementById("timeCurrent"),
  timeDuration: document.getElementById("timeDuration"),
  ctrlSpeedBtn: document.getElementById("ctrlSpeedBtn"),
  ctrlSpeedLabel: document.getElementById("ctrlSpeedLabel"),
  speedDropdown: document.getElementById("speedDropdown"),
  ctrlPip: document.getElementById("ctrlPip"),
  ctrlFullscreen: document.getElementById("ctrlFullscreen"),

  // Action Strip
  btnPrevLesson: document.getElementById("btnPrevLesson"),
  btnNextLesson: document.getElementById("btnNextLesson"),
  btnToggleCompleted: document.getElementById("btnToggleCompleted"),
  btnCompletedLabel: document.getElementById("btnCompletedLabel"),
  btnToggleFavorite: document.getElementById("btnToggleFavorite"),
  btnFavoriteLabel: document.getElementById("btnFavoriteLabel"),
  btnQuickNoteTimestamp: document.getElementById("btnQuickNoteTimestamp"),
  quickNoteCurrentTime: document.getElementById("quickNoteCurrentTime"),
  switchAutoPlay: document.getElementById("switchAutoPlay"),

  playerLessonCleanTitle: document.getElementById("playerLessonCleanTitle"),
  playerLessonFileName: document.getElementById("playerLessonFileName"),
  tabNotesCount: document.getElementById("tabNotesCount"),
  noteFormTimestampTag: document.getElementById("noteFormTimestampTag"),
  noteInputText: document.getElementById("noteInputText"),
  btnSaveNote: document.getElementById("btnSaveNote"),
  lessonNotesList: document.getElementById("lessonNotesList"),

  // Sidebar
  playerSidebar: document.getElementById("playerSidebar"),
  sidebarProgressText: document.getElementById("sidebarProgressText"),
  btnCollapseSidebar: document.getElementById("btnCollapseSidebar"),
  sidebarSearchInput: document.getElementById("sidebarSearchInput"),
  sidebarModulesList: document.getElementById("sidebarModulesList"),

  // All Notes & Favorites Views
  globalNotesContainer: document.getElementById("globalNotesContainer"),
  btnExportAllNotes: document.getElementById("btnExportAllNotes"),
  favoritesVideosGrid: document.getElementById("favoritesVideosGrid"),

  // Professional workspace
  workClientList: document.getElementById("workClientList"),
  workClientSearch: document.getElementById("workClientSearch"),
  workDetailPanel: document.getElementById("workDetailPanel"),
  workClientCount: document.getElementById("workClientCount"),
  workKpiClients: document.getElementById("workKpiClients"),
  workKpiCampaigns: document.getElementById("workKpiCampaigns"),
  workKpiSpend: document.getElementById("workKpiSpend"),
  workKpiLeads: document.getElementById("workKpiLeads"),
  btnNewClient: document.getElementById("btnNewClient"),
  btnEmptyNewClient: document.getElementById("btnEmptyNewClient"),
  btnExportWork: document.getElementById("btnExportWork"),
  workTabs: document.getElementById("workTabs"),
  workClientsSection: document.getElementById("workClientsSection"),
  workDocumentsSection: document.getElementById("workDocumentsSection"),
  workReportsSection: document.getElementById("workReportsSection"),
  workDocumentsGrid: document.getElementById("workDocumentsGrid"),
  documentClientFilter: document.getElementById("documentClientFilter"),
  documentSearch: document.getElementById("documentSearch"),
  btnNewDocument: document.getElementById("btnNewDocument"),
  workReportsContent: document.getElementById("workReportsContent"),
  btnNewReport: document.getElementById("btnNewReport"),
  metaImportPanel: document.getElementById("metaImportPanel"),
  metaConnectionStatus: document.getElementById("metaConnectionStatus"),
  metaAccountId: document.getElementById("metaAccountId"),
  metaQueryLevel: document.getElementById("metaQueryLevel"),
  metaDatePreset: document.getElementById("metaDatePreset"),
  btnImportMeta: document.getElementById("btnImportMeta"),
  metaImportStatus: document.getElementById("metaImportStatus"),
  gaPropertyId: document.getElementById("gaPropertyId"),
  gaDatePreset: document.getElementById("gaDatePreset"),
  btnImportGa: document.getElementById("btnImportGa"),
  gaImportStatus: document.getElementById("gaImportStatus"),

  // Modals & Toasts
  modalSettingsBackdrop: document.getElementById("modalSettingsBackdrop"),
  btnCloseSettings: document.getElementById("btnCloseSettings"),
  btnConfirmCloseSettings: document.getElementById("btnConfirmCloseSettings"),
  cfgVideosDir: document.getElementById("cfgVideosDir"),
  btnSaveVideosDir: document.getElementById("btnSaveVideosDir"),
  cfgAbsDirHint: document.getElementById("cfgAbsDirHint"),
  cfgRemoteVideosUrl: document.getElementById("cfgRemoteVideosUrl"),
  btnSaveRemoteVideosUrl: document.getElementById("btnSaveRemoteVideosUrl"),
  accentColorPicker: document.getElementById("accentColorPicker"),
  cfgAutoPlayNext: document.getElementById("cfgAutoPlayNext"),
  btnResetProgress: document.getElementById("btnResetProgress"),
  toastContainer: document.getElementById("toastContainer"),
};

// --------------------------------------------------------------------------
// UTILITIES
// --------------------------------------------------------------------------

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function showToast(message, type = "info", duration = 3000) {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  el.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function escapeHTML(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function captureFirstFrame(video) {
  const currentVideo = state.currentVideo;
  if (
    !currentVideo ||
    state.generatedThumbIds.has(currentVideo.id) ||
    !video.videoWidth
  )
    return;
  state.generatedThumbIds.add(currentVideo.id);

  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const context = canvas.getContext("2d");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  try {
    const response = await fetch("/api/thumbnail/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoId: currentVideo.id,
        imageBase64: canvas.toDataURL("image/jpeg", 0.82),
      }),
    });
    if (!response.ok) throw new Error("Falha ao salvar thumbnail");

    const cacheBust = `?frame=${Date.now()}`;
    document
      .querySelectorAll(`img[src^="${currentVideo.thumbUrl}"]`)
      .forEach((image) => {
        image.src = `${currentVideo.thumbUrl}${cacheBust}`;
      });
  } catch (err) {
    state.generatedThumbIds.delete(currentVideo.id);
    console.warn("Não foi possível salvar o primeiro frame:", err);
  }
}

// Visual feedback on screen when clicking video to play/pause
function showActionFeedback(isPlay) {
  const iconSvg = isPlay
    ? `<svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`
    : `<svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;

  el.feedbackIcon.innerHTML = iconSvg;
  el.videoActionFeedback.classList.add("show");
  clearTimeout(el.feedbackTimeout);
  el.feedbackTimeout = setTimeout(() => {
    el.videoActionFeedback.classList.remove("show");
  }, 400);
}

// --------------------------------------------------------------------------
// API COMMUNICATIONS
// --------------------------------------------------------------------------

async function fetchInitialData() {
  try {
    const [
      videosRes,
      progressRes,
      notesRes,
      favsRes,
      settingsRes,
      configRes,
      workspaceRes,
    ] = await Promise.all([
      fetch("/api/videos").then((r) => r.json()),
      fetch("/api/progress").then((r) => r.json()),
      fetch("/api/notes").then((r) => r.json()),
      fetch("/api/favorites").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/config").then((r) => r.json()),
      fetch("/api/workspace").then((r) => r.json()),
    ]);

    state.coursesData = videosRes;
    state.progress = progressRes;
    state.notes = notesRes;
    state.favorites = favsRes;
    state.settings = { ...state.settings, ...settingsRes };
    state.workspace = workspaceRes || {
      clients: [],
      campaigns: [],
      documents: [],
      reports: [],
    };
    state.workspace.reports ||= [];

    // Restore saved speed
    const savedSpeed = localStorage.getItem("videohub_speed");
    if (savedSpeed) state.settings.playbackSpeed = parseFloat(savedSpeed);

    if (configRes && configRes.videosDir) {
      el.cfgVideosDir.value = configRes.videosDir;
      el.cfgAbsDirHint.textContent = `Caminho: ${configRes.videosAbsDir || configRes.videosDir}`;
    }
    if (configRes && typeof configRes.remoteVideosUrl === "string") {
      el.cfgRemoteVideosUrl.value = configRes.remoteVideosUrl;
    }

    applySettings(state.settings);

    // Initial course selection
    if (state.coursesData.courses && state.coursesData.courses.length > 0) {
      state.currentCourse = state.coursesData.courses[0];
    }

    renderAll();

    if (state.coursesData.videosDirExists === false) {
      showToast(
        `Atenção: A pasta '${state.coursesData.videosDir}' não foi localizada neste computador.`,
        "warning",
        6000,
      );
    }
  } catch (err) {
    console.error("Erro ao carregar dados:", err);
    showToast("Erro ao conectar ao servidor local", "danger");
  }
}

async function saveProgress(videoId, currentTime, duration, completed = null) {
  try {
    const payload = { videoId, currentTime, duration };
    if (completed !== null) payload.completed = completed;

    const res = await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (result.success) {
      if (!state.progress.videos) state.progress.videos = {};
      state.progress.videos[videoId] = result.progress;
      state.progress.lastVideoId = videoId;
      updateCourseProgressStats();
    }
  } catch (err) {
    console.error("Erro ao salvar progresso:", err);
  }
}

async function toggleFavoriteAPI(videoId) {
  try {
    const res = await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId }),
    });
    const result = await res.json();
    if (result.success) {
      state.favorites = result.favorites;
      return result.isFavorite;
    }
  } catch (err) {
    console.error("Erro ao favoritar:", err);
  }
  return false;
}

async function saveNoteAPI(videoId, timestamp, text) {
  try {
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId, timestamp, text }),
    });
    const newNote = await res.json();
    state.notes.push(newNote);
    return newNote;
  } catch (err) {
    console.error("Erro ao salvar nota:", err);
  }
  return null;
}

async function deleteNoteAPI(noteId) {
  try {
    const res = await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
    const result = await res.json();
    if (result.success) {
      state.notes = state.notes.filter((n) => n.id !== noteId);
      return true;
    }
  } catch (err) {
    console.error("Erro ao deletar nota:", err);
  }
  return false;
}

async function saveSettingsAPI(newSettings) {
  const requestId = ++state.settingsRequestId;
  try {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newSettings),
    });
    const result = await res.json();
    if (result.success && requestId === state.settingsRequestId) {
      state.settings = result.settings;
      applySettings(state.settings);
    }
  } catch (err) {
    console.error("Erro ao salvar configurações:", err);
  }
}

function applySettings(s) {
  if (s.accentColor) {
    document.documentElement.setAttribute("data-accent", s.accentColor);
    document.querySelectorAll(".accent-swatch").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.color === s.accentColor);
    });
  }
  if (typeof s.autoPlayNext === "boolean") {
    el.switchAutoPlay.checked = s.autoPlayNext;
    el.cfgAutoPlayNext.checked = s.autoPlayNext;
  }
  if (s.playbackSpeed) {
    setPlaybackSpeed(s.playbackSpeed, false);
  }
  if (s.volume !== undefined) {
    el.mainVideoPlayer.volume = s.volume;
    el.ctrlVolumeSlider.value = s.volume;
  }
}

// --------------------------------------------------------------------------
// RENDERING
// --------------------------------------------------------------------------

function renderAll() {
  renderCourseDropdown();
  updateHeaderProgress();
  renderHomeHero();
  renderStatsGrid();
  renderHomeVideosGrid();
  renderHomeTopics();
  renderCurriculumTrack();
  renderAllCoursesView();
  renderWorkView();
  if (state.currentVideo) {
    renderPlayerDetails(state.currentVideo);
  }
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

async function saveWorkspaceRecord(type, payload) {
  const response = await fetch("/api/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, payload }),
  });
  const result = await response.json();
  if (!response.ok || !result.success)
    throw new Error(result.error || "Falha ao salvar registro");
  state.workspace = result.workspace;
  return result.record;
}

function selectedWorkClient() {
  return (
    state.workspace.clients.find(
      (client) => client.id === state.currentClientId,
    ) || null
  );
}

function renderWorkView() {
  [
    el.workClientsSection,
    el.workDocumentsSection,
    el.workReportsSection,
  ].forEach((panel) => {
    if (panel)
      panel.hidden =
        panel.id !==
        `work${state.workSection[0].toUpperCase()}${state.workSection.slice(1)}Section`;
  });
  el.workTabs
    ?.querySelectorAll(".work-tab")
    .forEach((tab) =>
      tab.classList.toggle(
        "active",
        tab.dataset.workSection === state.workSection,
      ),
    );
  if (state.workSection === "documents") return renderWorkDocuments();
  if (state.workSection === "reports") return renderWorkReports();
  return renderWorkClientsView();
}

function renderWorkClientsView() {
  if (!el.workClientList) return;
  const clients = state.workspace.clients || [];
  const query = (el.workClientSearch?.value || "").toLowerCase().trim();
  const visibleClients = clients.filter((client) =>
    `${client.name} ${client.business} ${client.city}`
      .toLowerCase()
      .includes(query),
  );
  const campaigns = state.workspace.campaigns || [];
  const spend = campaigns.reduce(
    (sum, campaign) => sum + Number(campaign.spend || 0),
    0,
  );
  const leads = campaigns.reduce(
    (sum, campaign) => sum + Number(campaign.leads || 0),
    0,
  );

  el.workClientCount.textContent = clients.length;
  el.workKpiClients.textContent = clients.length;
  el.workKpiCampaigns.textContent = campaigns.length;
  el.workKpiSpend.textContent = formatCurrency(spend);
  el.workKpiLeads.textContent = leads;
  el.workClientList.innerHTML = "";

  if (!visibleClients.length) {
    el.workClientList.innerHTML = `<div class="work-list-empty">Nenhum cliente cadastrado.</div>`;
  }
  visibleClients.forEach((client) => {
    const campaignsCount = campaigns.filter(
      (item) => item.clientId === client.id,
    ).length;
    const item = document.createElement("button");
    item.className = `work-client-item ${client.id === state.currentClientId ? "active" : ""}`;
    item.innerHTML = `<span class="work-client-avatar">${escapeHTML((client.name || "?").slice(0, 1).toUpperCase())}</span><span class="work-client-copy"><strong>${escapeHTML(client.name)}</strong><small>${escapeHTML(client.business || "Negócio ainda não descrito")}</small></span><em>${campaignsCount}</em>`;
    item.addEventListener("click", () => {
      state.currentClientId = client.id;
      renderWorkView();
    });
    el.workClientList.appendChild(item);
  });

  const client = selectedWorkClient();
  if (!client) {
    el.workDetailPanel.innerHTML = `<div class="work-empty-state"><span class="work-empty-icon">+</span><h2>Selecione um cliente</h2><p>Crie seu primeiro cadastro para reunir briefing, campanhas, métricas e materiais.</p><button class="btn btn-primary" id="btnEmptyNewClient">Cadastrar cliente</button></div>`;
    el.workDetailPanel
      .querySelector("button")
      .addEventListener("click", () => openClientEditor());
    return;
  }
  renderWorkClientDetail(client);
}

function renderWorkDocuments() {
  const clients = state.workspace.clients || [];
  const query = (el.documentSearch?.value || "").toLowerCase().trim();
  const clientId = el.documentClientFilter?.value || "all";
  el.documentClientFilter.innerHTML = `<option value="all">Todos os clientes</option>${clients.map((client) => `<option value="${escapeHTML(client.id)}">${escapeHTML(client.name)}</option>`).join("")}`;
  el.documentClientFilter.value = clientId;
  const docs = (state.workspace.documents || []).filter((doc) => {
    const client = clients.find((item) => item.id === doc.clientId);
    return (
      (clientId === "all" || doc.clientId === clientId) &&
      `${doc.name} ${doc.kind} ${client?.name || ""}`
        .toLowerCase()
        .includes(query)
    );
  });
  el.workDocumentsGrid.innerHTML = docs.length
    ? docs
        .map((doc) => {
          const client = clients.find((item) => item.id === doc.clientId);
          return `<article class="work-document-card"><div class="document-card-icon">DOC</div><div><span class="eyebrow-label">${escapeHTML(doc.kind || "MATERIAL")}</span><h3>${escapeHTML(doc.name)}</h3><p>Cliente: <strong>${escapeHTML(client?.name || "Não associado")}</strong></p><small>${escapeHTML(doc.status || "Rascunho")}</small></div><a class="btn btn-ghost btn-sm" href="${escapeHTML(doc.url || "#")}" target="_blank" rel="noreferrer">Abrir</a></article>`;
        })
        .join("")
    : `<div class="work-empty-state compact"><span class="work-empty-icon">DOC</span><h2>Nenhum documento encontrado</h2><p>Adicione uma proposta, briefing, apresentação ou relatório e associe-o a um cliente.</p></div>`;
}

function renderWorkReports() {
  const reports = state.workspace.reports || [];
  if (!reports.length) {
    el.workReportsContent.innerHTML = `${state.metaInsights ? renderMetaDashboard(state.metaInsights) : ""}${state.gaInsights ? renderGaDashboard(state.gaInsights) : ""}<div class="work-empty-state compact"><span class="work-empty-icon">+</span><h2>Nenhum dashboard salvo</h2><p>Crie um relatório para visualizar os dados de um cliente por período e objetivo.</p><button class="btn btn-primary" id="btnEmptyNewReport">Criar relatório</button></div>`;
    el.workReportsContent
      .querySelector("button")
      .addEventListener("click", openReportEditor);
    return;
  }
  el.workReportsContent.innerHTML = `${state.metaInsights ? renderMetaDashboard(state.metaInsights) : ""}${state.gaInsights ? renderGaDashboard(state.gaInsights) : ""}<div class="work-report-list">${reports
    .map((report) => {
      const client = state.workspace.clients.find(
        (item) => item.id === report.clientId,
      );
      const campaigns = state.workspace.campaigns.filter(
        (item) => item.clientId === report.clientId,
      );
      const spend = campaigns.reduce(
        (sum, item) => sum + Number(item.spend || 0),
        0,
      );
      const leads = campaigns.reduce(
        (sum, item) => sum + Number(item.leads || 0),
        0,
      );
      const conversions = campaigns.reduce(
        (sum, item) => sum + Number(item.conversions || 0),
        0,
      );
      const clicks = campaigns.reduce(
        (sum, item) => sum + Number(item.clicks || 0),
        0,
      );
      const impressions = campaigns.reduce(
        (sum, item) => sum + Number(item.impressions || 0),
        0,
      );
      const ctr = impressions
        ? ((clicks / impressions) * 100).toFixed(2)
        : "0.00";
      const cpl = leads ? spend / leads : 0;
      return `<article class="work-report-card"><div class="work-report-heading"><div><span class="eyebrow-label">${escapeHTML(report.type || "PERFORMANCE")}</span><h2>${escapeHTML(report.name)}</h2><p>${escapeHTML(client?.name || "Cliente removido")} · ${escapeHTML(report.period || "Período não definido")}</p></div><button class="btn btn-secondary btn-sm" data-report-edit="${report.id}">Editar dados</button></div><div class="report-metric-grid"><div><span>Investimento</span><strong>${formatCurrency(spend)}</strong></div><div><span>Impressões</span><strong>${impressions.toLocaleString("pt-BR")}</strong></div><div><span>Cliques</span><strong>${clicks.toLocaleString("pt-BR")}</strong></div><div><span>CTR</span><strong>${ctr}%</strong></div><div><span>Leads</span><strong>${leads}</strong></div><div><span>Custo por lead</span><strong>${formatCurrency(cpl)}</strong></div><div><span>Conversões</span><strong>${conversions}</strong></div><div><span>ROAS / retorno</span><strong>${escapeHTML(report.returnValue || "Não informado")}</strong></div></div><div class="report-bar"><span>Distribuição de leads</span><div><i style="width:${Math.min(100, leads ? Math.max(8, (leads / Math.max(leads, conversions || 1)) * 100) : 8)}%"></i></div></div><p class="work-report-notes">${escapeHTML(report.notes || "Adicione observações e recomendações ao editar este relatório.")}</p></article>`;
    })
    .join("")}</div>`;
  el.workReportsContent
    .querySelectorAll("[data-report-edit]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        openReportEditor(
          reports.find((item) => item.id === button.dataset.reportEdit),
        ),
      ),
    );
}

function renderMetaDashboard(payload) {
  const rows = payload.data || [];
  const total = rows.reduce(
    (summary, row) => {
      summary.spend += Number(row.spend || 0);
      summary.impressions += Number(row.impressions || 0);
      summary.reach += Number(row.reach || 0);
      summary.clicks += Number(row.clicks || 0);

      if (row.actions && Array.isArray(row.actions)) {
        row.actions.forEach((a) => {
          if (
            a.action_type === "purchase" ||
            a.action_type === "omni_purchase"
          ) {
            summary.purchases += Number(a.value || 0);
          } else if (
            a.action_type === "lead" ||
            a.action_type === "offsite_conversion.fb_pixel_lead"
          ) {
            summary.leads += Number(a.value || 0);
          } else if (
            a.action_type === "onsite_conversion.messaging_conversation_started_7d"
          ) {
            summary.messaging += Number(a.value || 0);
          }
        });
      }

      if (row.action_values && Array.isArray(row.action_values)) {
        row.action_values.forEach((av) => {
          if (
            av.action_type === "purchase" ||
            av.action_type === "omni_purchase"
          ) {
            summary.purchaseValue += Number(av.value || 0);
          }
        });
      }

      return summary;
    },
    {
      spend: 0,
      impressions: 0,
      reach: 0,
      clicks: 0,
      purchases: 0,
      leads: 0,
      messaging: 0,
      purchaseValue: 0,
    },
  );

  const ctr = total.impressions
    ? ((total.clicks / total.impressions) * 100).toFixed(2)
    : "0.00";
  const cpm = total.impressions
    ? ((total.spend / total.impressions) * 1000).toFixed(2)
    : "0.00";
  const cpc = total.clicks ? (total.spend / total.clicks).toFixed(2) : "0.00";
  const roas = total.spend
    ? (total.purchaseValue / total.spend).toFixed(2)
    : "0.00";
  const cpl = total.leads ? (total.spend / total.leads).toFixed(2) : "0.00";

  const maxSpend = Math.max(...rows.map((r) => Number(r.spend || 0)), 1);

  const levelName =
    payload.level === "ad"
      ? "Anúncio"
      : payload.level === "adset"
        ? "Conjunto de Anúncios"
        : "Campanha";

  const campaignRows = rows
    .map((row) => {
      const name =
        row.campaign_name || row.adset_name || row.ad_name || "Sem nome";
      const spend = Number(row.spend || 0);
      const imp = Number(row.impressions || 0);
      const clk = Number(row.clicks || 0);
      const rowCtr = imp ? ((clk / imp) * 100).toFixed(2) : "0.00";
      const barWidth = Math.min(100, Math.max(5, (spend / maxSpend) * 100));

      return `
        <div class="dash-row-item">
          <div class="dash-row-header">
            <strong>${escapeHTML(name)}</strong>
            <span>${formatCurrency(spend)}</span>
          </div>
          <div class="dash-row-bar-track">
            <div class="dash-row-bar-fill" style="width: ${barWidth}%"></div>
          </div>
          <div class="dash-row-meta">
            <span>Impressões: <b>${imp.toLocaleString("pt-BR")}</b></span>
            <span>Cliques: <b>${clk.toLocaleString("pt-BR")}</b></span>
            <span>CTR: <b>${rowCtr}%</b></span>
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <article class="meta-dashboard-card full-dashboard">
      <div class="work-report-heading">
        <div>
          <span class="eyebrow-label">DASHBOARD DE PERFORMANCE · META ADS</span>
          <h2>Visão Geral do Meta Ads - Conta ${escapeHTML(payload.accountId)}</h2>
          <p>Nível: ${escapeHTML(levelName)} · Período: ${escapeHTML(payload.datePreset)} · Gerado em ${new Date().toLocaleString("pt-BR")}</p>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="window.print()">Imprimir / PDF</button>
      </div>

      <!-- KPI Grid -->
      <div class="report-metric-grid">
        <div class="kpi-card highlight-purple">
          <span>Investimento Total</span>
          <strong>${formatCurrency(total.spend)}</strong>
        </div>
        <div class="kpi-card">
          <span>Impressões</span>
          <strong>${total.impressions.toLocaleString("pt-BR")}</strong>
        </div>
        <div class="kpi-card">
          <span>Alcance</span>
          <strong>${total.reach.toLocaleString("pt-BR")}</strong>
        </div>
        <div class="kpi-card">
          <span>Cliques no Anúncio</span>
          <strong>${total.clicks.toLocaleString("pt-BR")}</strong>
        </div>
        <div class="kpi-card highlight-green">
          <span>CTR (Taxa de Cliques)</span>
          <strong>${ctr}%</strong>
        </div>
        <div class="kpi-card">
          <span>CPM Médio</span>
          <strong>${formatCurrency(cpm)}</strong>
        </div>
        <div class="kpi-card">
          <span>CPC Médio</span>
          <strong>${formatCurrency(cpc)}</strong>
        </div>
        <div class="kpi-card highlight-amber">
          <span>ROAS Estimado</span>
          <strong>${roas}x</strong>
        </div>
        <div class="kpi-card">
          <span>Leads Gerados</span>
          <strong>${total.leads}</strong>
        </div>
        <div class="kpi-card">
          <span>Custo por Lead (CPL)</span>
          <strong>${formatCurrency(cpl)}</strong>
        </div>
        <div class="kpi-card">
          <span>Conversas Iniciadas</span>
          <strong>${total.messaging}</strong>
        </div>
        <div class="kpi-card">
          <span>Valor em Compras</span>
          <strong>${formatCurrency(total.purchaseValue)}</strong>
        </div>
      </div>

      <!-- Detail list -->
      <div class="meta-campaign-list">
        <h3>Desempenho Visual por ${escapeHTML(levelName)}</h3>
        <div class="dash-rows-container">
          ${campaignRows || `<p class="work-muted">Nenhum dado retornado para este nível/período.</p>`}
        </div>
      </div>
    </article>
  `;
}

function renderGaDashboard(payload) {
  const rows = payload.data || [];

  let totalSessions = 0;
  let totalConversions = 0;
  let totalUsers = 0;
  let newUsers = 0;
  let activeUsers = 0;
  let pageViews = 0;
  let engagementSum = 0;
  let bounceSum = 0;

  const channelMap = new Map();

  rows.forEach((row) => {
    const sessions = Number(row.sessions || 0);
    const convs = Number(row.conversions || 0);
    const channel = row.sessionDefaultChannelGroup || "Direct / Outros";

    totalSessions += sessions;
    totalConversions += convs;
    totalUsers += Number(row.totalUsers || 0);
    newUsers += Number(row.newUsers || 0);
    activeUsers += Number(row.activeUsers || 0);
    pageViews += Number(row.screenPageViews || 0);
    engagementSum += Number(row.engagementRate || 0);
    bounceSum += Number(row.bounceRate || 0);

    if (!channelMap.has(channel)) {
      channelMap.set(channel, { sessions: 0, conversions: 0 });
    }
    const curr = channelMap.get(channel);
    curr.sessions += sessions;
    curr.conversions += convs;
  });

  const rowCount = Math.max(rows.length, 1);
  const avgEngagement = (engagementSum / rowCount) * 100;
  const avgBounce = (bounceSum / rowCount) * 100;
  const conversionRate = totalSessions
    ? ((totalConversions / totalSessions) * 100).toFixed(2)
    : "0.00";

  const maxChannelSessions = Math.max(
    ...Array.from(channelMap.values()).map((v) => v.sessions),
    1,
  );

  const channelList = Array.from(channelMap.entries())
    .map(([channel, metrics]) => {
      const barWidth = Math.min(
        100,
        Math.max(5, (metrics.sessions / maxChannelSessions) * 100),
      );
      return `
      <div class="dash-row-item">
        <div class="dash-row-header">
          <strong>${escapeHTML(channel)}</strong>
          <span><b>${metrics.sessions.toLocaleString("pt-BR")}</b> sessões</span>
        </div>
        <div class="dash-row-bar-track">
          <div class="dash-row-bar-fill ga-bar" style="width: ${barWidth}%"></div>
        </div>
        <div class="dash-row-meta">
          <span>Conversões: <b>${metrics.conversions.toLocaleString("pt-BR")}</b></span>
          <span>Taxa de Conversão: <b>${metrics.sessions ? ((metrics.conversions / metrics.sessions) * 100).toFixed(2) : "0.00"}%</b></span>
        </div>
      </div>
    `;
    })
    .join("");

  return `
    <article class="ga-dashboard-card full-dashboard">
      <div class="work-report-heading">
        <div>
          <span class="eyebrow-label">DASHBOARD DE TRÁFEGO · GOOGLE ANALYTICS 4</span>
          <h2>Visão Geral do GA4 - Propriedade ${escapeHTML(payload.propertyId)}</h2>
          <p>Fuso: ${escapeHTML(payload.timezone || "América/São_Paulo")} · Período: ${escapeHTML(payload.datePreset)} · Gerado em ${new Date().toLocaleString("pt-BR")}</p>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="window.print()">Imprimir / PDF</button>
      </div>

      <!-- KPI Grid -->
      <div class="report-metric-grid">
        <div class="kpi-card highlight-purple">
          <span>Total de Sessões</span>
          <strong>${totalSessions.toLocaleString("pt-BR")}</strong>
        </div>
        <div class="kpi-card highlight-green">
          <span>Conversões Totais</span>
          <strong>${totalConversions.toLocaleString("pt-BR")}</strong>
        </div>
        <div class="kpi-card highlight-amber">
          <span>Taxa de Conversão</span>
          <strong>${conversionRate}%</strong>
        </div>
        <div class="kpi-card">
          <span>Usuários Totais</span>
          <strong>${totalUsers.toLocaleString("pt-BR")}</strong>
        </div>
        <div class="kpi-card">
          <span>Novos Usuários</span>
          <strong>${newUsers.toLocaleString("pt-BR")}</strong>
        </div>
        <div class="kpi-card">
          <span>Usuários Ativos</span>
          <strong>${activeUsers.toLocaleString("pt-BR")}</strong>
        </div>
        <div class="kpi-card">
          <span>Visualizações de Página</span>
          <strong>${pageViews.toLocaleString("pt-BR")}</strong>
        </div>
        <div class="kpi-card">
          <span>Taxa de Engajamento</span>
          <strong>${avgEngagement.toFixed(1)}%</strong>
        </div>
      </div>

      <!-- Channel Breakdown -->
      <div class="meta-campaign-list">
        <h3>Distribuição de Sessões e Conversões por Canal (Channel Group)</h3>
        <div class="dash-rows-container">
          ${channelList || `<p class="work-muted">Nenhum dado retornado do GA4 para o período selecionado.</p>`}
        </div>
      </div>
    </article>
  `;
}

async function importGaInsights() {
  const propertyId = el.gaPropertyId.value.trim();
  const datePreset = el.gaDatePreset.value;
  if (!/^\d+$/.test(propertyId) && !/^properties\/\d+$/.test(propertyId)) {
    el.gaImportStatus.textContent =
      "Informe o ID numérico da propriedade ou properties/<ID>.";
    el.gaImportStatus.className = "meta-import-status error";
    return;
  }
  el.btnImportGa.disabled = true;
  el.gaImportStatus.textContent = "Buscando dados no Google Analytics 4...";
  el.gaImportStatus.className = "meta-import-status";
  try {
    const response = await fetch(
      `/api/ga4/insights?propertyId=${encodeURIComponent(propertyId)}&datePreset=${encodeURIComponent(datePreset)}`,
    );
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        `${result.error || "Não foi possível buscar os dados do GA4"} (HTTP ${response.status})`,
      );
    state.gaInsights = result;
    el.gaImportStatus.textContent = `${result.data?.length || 0} canal(is) importado(s).`;
    el.gaImportStatus.className = "meta-import-status success";
    renderWorkReports();
  } catch (error) {
    el.gaImportStatus.textContent = error.message;
    el.gaImportStatus.className = "meta-import-status error";
  } finally {
    el.btnImportGa.disabled = false;
  }
}

async function refreshMetaConnectionStatus() {
  if (!el.metaConnectionStatus) return;
  try {
    const response = await fetch("/api/meta/status");
    const status = await response.json();
    if (status.connectedViaOAuth) {
      el.metaConnectionStatus.innerHTML = `<span class="meta-status-ok">✅ Conectado ao Meta</span> · expira em ${status.daysUntilExpiry} dia(s) (renovação automática) · <a href="/auth/meta/login">Reconectar</a>`;
      el.metaConnectionStatus.className = "meta-import-status success";
    } else if (status.oauthConfigured) {
      el.metaConnectionStatus.innerHTML = `Nenhuma conta conectada ainda · <a href="/auth/meta/login">Conectar com Meta</a>`;
      el.metaConnectionStatus.className = "meta-import-status";
    } else if (status.configured) {
      el.metaConnectionStatus.textContent =
        "Usando token fixo do .env (sem renovação automática).";
      el.metaConnectionStatus.className = "meta-import-status";
    } else {
      el.metaConnectionStatus.textContent =
        "Meta Ads não configurado no backend.";
      el.metaConnectionStatus.className = "meta-import-status error";
    }
  } catch {
    el.metaConnectionStatus.textContent = "";
  }
}

async function importMetaInsights() {
  const accountId = el.metaAccountId.value.trim();
  const datePreset = el.metaDatePreset.value;
  const level = el.metaQueryLevel?.value || "campaign";
  if (!/^act_\d+$/.test(accountId)) {
    el.metaImportStatus.textContent = "Informe um ID no formato act_<ID>.";
    el.metaImportStatus.className = "meta-import-status error";
    return;
  }
  el.btnImportMeta.disabled = true;
  el.metaImportStatus.textContent = "Gerando dashboard do Meta Ads...";
  el.metaImportStatus.className = "meta-import-status";
  try {
    const response = await fetch(
      `/api/meta/insights?accountId=${encodeURIComponent(accountId)}&datePreset=${encodeURIComponent(datePreset)}&level=${encodeURIComponent(level)}`,
    );
    const result = await response.json();
    if (!response.ok) {
      const details =
        result.details?.error_user_msg || result.details?.error_user_title;
      throw new Error(
        `${result.error || "Não foi possível gerar o dashboard"}${details ? `: ${details}` : ""} (HTTP ${response.status})`,
      );
    }
    state.metaInsights = { ...result, accountId, datePreset, level };
    el.metaImportStatus.textContent = `Dashboard do Meta Ads gerado com sucesso! (${result.data?.length || 0} registros encontrados)`;
    el.metaImportStatus.className = "meta-import-status success";
    renderWorkReports();
  } catch (error) {
    el.metaImportStatus.textContent = error.message;
    el.metaImportStatus.className = "meta-import-status error";
  } finally {
    el.btnImportMeta.disabled = false;
  }
}

function openReportEditor(report = null) {
  const clients = state.workspace.clients || [];
  if (!clients.length) {
    showToast("Cadastre um cliente antes de criar um relatório", "warning");
    state.workSection = "clients";
    renderWorkView();
    return;
  }
  const record = report || {
    name: "",
    clientId: clients[0].id,
    type: "Performance de campanhas",
    period: "",
    returnValue: "",
    notes: "",
  };
  el.workReportsContent.innerHTML = `<form class="work-form report-editor" id="reportForm"><div class="work-detail-heading"><div><span class="eyebrow-label">${report ? "EDITAR DASHBOARD" : "NOVO DASHBOARD"}</span><h2>Relatório personalizado</h2></div><button type="button" class="btn btn-ghost btn-sm" id="btnCancelReport">Cancelar</button></div><div class="work-form-grid"><label>Nome do relatório<input name="name" required value="${escapeHTML(record.name)}" placeholder="Ex.: Resultado de setembro"></label><label>Cliente<select name="clientId">${clients.map((client) => `<option value="${escapeHTML(client.id)}">${escapeHTML(client.name)}</option>`).join("")}</select></label><label>Tipo<select name="type"><option>Performance de campanhas</option><option>Leads e conversões</option><option>Tráfego e reconhecimento</option><option>Relatório executivo</option></select></label><label>Período<input name="period" value="${escapeHTML(record.period)}" placeholder="Ex.: Setembro de 2026"></label><label>Retorno / receita<input name="returnValue" value="${escapeHTML(record.returnValue)}" placeholder="Ex.: R$ 3.200 ou ROAS 4,2"></label><label class="full">Observações e recomendações<textarea name="notes" rows="5" placeholder="O que funcionou, próximos testes e decisões para o próximo período...">${escapeHTML(record.notes)}</textarea></label></div><div class="work-form-actions"><button class="btn btn-primary">Salvar dashboard</button></div></form>`;
  const form = el.workReportsContent.querySelector("form");
  form.clientId.value = record.clientId;
  form.type.value = record.type;
  form
    .querySelector("#btnCancelReport")
    .addEventListener("click", renderWorkReports);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    if (report) payload.id = report.id;
    try {
      await saveWorkspaceRecord("report", payload);
      renderWorkReports();
      showToast("Dashboard salvo localmente", "success");
    } catch (error) {
      showToast(error.message, "danger");
    }
  });
}

function openClientEditor(client = null) {
  const record = client || {
    name: "",
    business: "",
    contact: "",
    website: "",
    city: "",
    audience: "",
    businessDetails: "",
    goals: "",
    studyTags: "",
  };
  el.workDetailPanel.innerHTML = `<form class="work-form" id="clientForm"><div class="work-detail-heading"><div><span class="eyebrow-label">${client ? "EDITAR CLIENTE" : "NOVO CADASTRO"}</span><h2>${client ? escapeHTML(client.name) : "Novo cliente"}</h2></div><button type="button" class="btn btn-ghost btn-sm" id="btnCancelClient">Cancelar</button></div><div class="work-form-grid"><label>Nome do cliente<input name="name" required value="${escapeHTML(record.name)}"></label><label>Negócio / marca<input name="business" value="${escapeHTML(record.business)}"></label><label>Contato<input name="contact" value="${escapeHTML(record.contact)}"></label><label>Site / Instagram<input name="website" value="${escapeHTML(record.website)}"></label><label>Cidade / região<input name="city" value="${escapeHTML(record.city)}"></label><label>Objetivo principal<select name="primaryGoal"><option value="whatsapp">Conversas no WhatsApp</option><option value="site">Acessos e vendas no site</option><option value="instagram">Seguidores e interação</option><option value="leads">Geração de leads</option></select></label><label class="full">Público-alvo<textarea name="audience" rows="3">${escapeHTML(record.audience)}</textarea></label><label class="full">Detalhes do negócio<textarea name="businessDetails" rows="4">${escapeHTML(record.businessDetails)}</textarea></label><label class="full">Metas e resultado esperado<textarea name="goals" rows="3">${escapeHTML(record.goals)}</textarea></label><label class="full">Tags de estudo <small>Ex.: Meta Ads, remarketing, criativos</small><input name="studyTags" value="${escapeHTML(record.studyTags)}"></label></div><div class="work-form-actions"><button class="btn btn-primary" type="submit">Salvar cliente</button></div></form>`;
  const form = el.workDetailPanel.querySelector("form");
  form.primaryGoal.value = record.primaryGoal || "whatsapp";
  el.workDetailPanel
    .querySelector("#btnCancelClient")
    .addEventListener("click", () => renderWorkView());
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    if (client) payload.id = client.id;
    try {
      const saved = await saveWorkspaceRecord("client", payload);
      state.currentClientId = saved.id;
      renderWorkView();
      showToast("Cliente salvo localmente", "success");
    } catch (error) {
      showToast(error.message, "danger");
    }
  });
}

function renderWorkClientDetail(client) {
  const campaigns = state.workspace.campaigns.filter(
    (item) => item.clientId === client.id,
  );
  const documents = state.workspace.documents.filter(
    (item) => item.clientId === client.id,
  );
  const relatedNotes = state.notes
    .filter((note) => {
      const haystack =
        `${client.studyTags} ${client.businessDetails} ${client.goals}`.toLowerCase();
      return haystack
        .split(/[,; ]+/)
        .filter(Boolean)
        .some((term) => note.text.toLowerCase().includes(term));
    })
    .slice(0, 5);
  el.workDetailPanel.innerHTML = `<div class="work-detail-heading"><div><span class="eyebrow-label">CLIENTE</span><h2>${escapeHTML(client.name)}</h2><p>${escapeHTML(client.business || "Negócio")}${client.city ? ` · ${escapeHTML(client.city)}` : ""}</p></div><div class="work-detail-actions"><button class="btn btn-secondary btn-sm" id="btnEditClient">Editar</button><button class="btn btn-primary btn-sm" id="btnAddCampaign">+ Campanha</button></div></div><div class="work-info-strip"><div><span>Objetivo</span><strong>${escapeHTML(client.primaryGoal || "Não definido")}</strong></div><div><span>Contato</span><strong>${escapeHTML(client.contact || "Não informado")}</strong></div><div><span>Site / Instagram</span><strong>${escapeHTML(client.website || "Não informado")}</strong></div></div><div class="work-detail-grid"><section class="work-subpanel"><div class="work-subpanel-heading"><h3>Briefing do negócio</h3></div><dl class="work-briefing"><dt>Público-alvo</dt><dd>${escapeHTML(client.audience || "Ainda não preenchido")}</dd><dt>Detalhes</dt><dd>${escapeHTML(client.businessDetails || "Ainda não preenchido")}</dd><dt>Metas</dt><dd>${escapeHTML(client.goals || "Ainda não preenchido")}</dd></dl></section><section class="work-subpanel"><div class="work-subpanel-heading"><h3>Campanhas</h3><span>${campaigns.length}</span></div><div id="workCampaignList">${campaigns.length ? campaigns.map(renderCampaignItem).join("") : `<p class="work-muted">Nenhuma campanha cadastrada.</p>`}</div></section><section class="work-subpanel"><div class="work-subpanel-heading"><h3>Apresentações e documentos</h3><button class="btn btn-ghost btn-sm" id="btnAddDocument">+ Adicionar</button></div><div id="workDocumentList">${documents.length ? documents.map(renderDocumentItem).join("") : `<p class="work-muted">Adicione briefing, proposta ou relatório.</p>`}</div></section><section class="work-subpanel"><div class="work-subpanel-heading"><h3>Estudos relacionados</h3><span>${relatedNotes.length}</span></div>${relatedNotes.length ? relatedNotes.map((note) => `<div class="work-note"><strong>${escapeHTML(note.text.slice(0, 100))}</strong><small>${escapeHTML(note.timestampFormatted || "Anotação de aula")}</small></div>`).join("") : `<p class="work-muted">Adicione tags de estudo ao cliente para encontrar recomendações nas suas anotações.</p>`}</section></div>`;
  const structured = document.createElement("section");
  structured.className = "work-subpanel work-structured-summary";
  structured.innerHTML = `<div class="work-subpanel-heading"><h3>Planejamento de público, objetivos e verba</h3></div><dl class="work-briefing"><dt>Públicos-alvo</dt><dd>${(client.audiences || []).map((item) => `${item.primary ? "Principal: " : ""}${item.ageMin}-${item.ageMax} anos · ${escapeHTML(item.gender)} · ${escapeHTML(item.segmentation || "Sem segmentação")}`).join("<br>") || escapeHTML(client.audience || "Ainda não preenchido")}</dd><dt>Objetivos</dt><dd>${(client.objectives || []).map((item) => `${item.primary ? "Principal: " : ""}${escapeHTML(item.name)}`).join("<br>") || escapeHTML(client.primaryGoal || "Ainda não definido")}</dd><dt>Site</dt><dd>${escapeHTML(client.website || "Não informado")}</dd><dt>Instagram</dt><dd>${escapeHTML(client.instagram || "Não informado")}</dd><dt>Orçamentos mensais</dt><dd>${(client.budgets || []).map((item) => `${escapeHTML(item.month || "Mês não definido")}: ${formatCurrency(item.amount)}`).join("<br>") || "Ainda não definido"}</dd></dl>`;
  el.workDetailPanel.querySelector(".work-detail-grid").prepend(structured);
  el.workDetailPanel
    .querySelector("#btnEditClient")
    .addEventListener("click", () => openClientEditor(client));
  el.workDetailPanel
    .querySelector("#btnAddCampaign")
    .addEventListener("click", () => openCampaignEditor(client));
  el.workDetailPanel
    .querySelector("#btnAddDocument")
    .addEventListener("click", () => openDocumentEditor(client));
}

function openClientEditor(client = null) {
  const record = client || {
    name: "",
    business: "",
    contact: "",
    website: "",
    instagram: "",
    city: "",
    businessDetails: "",
    goals: "",
    studyTags: "",
    audiences: [
      {
        ageMin: 18,
        ageMax: 65,
        gender: "Todos",
        segmentation: "",
        primary: true,
      },
    ],
    objectives: [{ name: "Conversas no WhatsApp", primary: true }],
    budgets: [{ month: new Date().toISOString().slice(0, 7), amount: 0 }],
  };
  const audiences = record.audiences?.length
    ? record.audiences
    : [
        {
          ageMin: 18,
          ageMax: 65,
          gender: "Todos",
          segmentation: record.audience || "",
          primary: true,
        },
      ];
  const objectives = record.objectives?.length
    ? record.objectives
    : [{ name: record.primaryGoal || "Conversas no WhatsApp", primary: true }];
  const budgets = record.budgets?.length
    ? record.budgets
    : [
        {
          month: new Date().toISOString().slice(0, 7),
          amount: record.monthlyBudget || 0,
        },
      ];
  el.workDetailPanel.innerHTML = `<form class="work-form" id="clientForm"><div class="work-detail-heading"><div><span class="eyebrow-label">${client ? "EDITAR CLIENTE" : "NOVO CADASTRO"}</span><h2>${client ? escapeHTML(client.name) : "Novo cliente"}</h2></div><button type="button" class="btn btn-ghost btn-sm" id="btnCancelClient">Cancelar</button></div><div class="work-form-grid"><label>Nome do cliente<input name="name" required value="${escapeHTML(record.name)}"></label><label>Negócio / marca<input name="business" value="${escapeHTML(record.business)}"></label><label>Contato<input name="contact" value="${escapeHTML(record.contact)}"></label><label>Site<input name="website" value="${escapeHTML(record.website)}"></label><label>Instagram<input name="instagram" value="${escapeHTML(record.instagram)}"></label><label>Cidade / região<input name="city" value="${escapeHTML(record.city)}"></label><label class="full">Detalhes do negócio<textarea name="businessDetails" rows="4">${escapeHTML(record.businessDetails)}</textarea></label><label class="full">Metas e contexto<textarea name="goals" rows="3">${escapeHTML(record.goals)}</textarea></label><label class="full">Tags de estudo <small>Ex.: Meta Ads, remarketing, criativos</small><input name="studyTags" value="${escapeHTML(record.studyTags)}"></label></div><div class="work-form-section"><div class="work-form-section-heading"><div><span class="eyebrow-label">PÚBLICOS-ALVO</span><h3>Personas e segmentações</h3></div><button type="button" class="btn btn-ghost btn-sm" id="btnAddAudience">+ Público</button></div><div id="audienceRows">${audiences.map((audience, index) => `<div class="repeat-row audience-row"><input type="number" min="0" name="audienceAgeMin" value="${audience.ageMin ?? 18}" placeholder="Idade mín."><input type="number" min="0" name="audienceAgeMax" value="${audience.ageMax ?? 65}" placeholder="Idade máx."><select name="audienceGender"><option>Todos</option><option>Mulheres</option><option>Homens</option></select><input name="audienceSegmentation" value="${escapeHTML(audience.segmentation || "")}" placeholder="Segmentações: mães, tricô, crochê..."><label class="repeat-primary"><input type="radio" name="primaryAudience" value="${index}" ${audience.primary ? "checked" : ""}> Principal</label><button type="button" class="repeat-remove" title="Remover">×</button></div>`).join("")}</div></div><div class="work-form-section"><div class="work-form-section-heading"><div><span class="eyebrow-label">OBJETIVOS</span><h3>Resultados esperados</h3></div><button type="button" class="btn btn-ghost btn-sm" id="btnAddObjective">+ Objetivo</button></div><div id="objectiveRows">${objectives.map((objective, index) => `<div class="repeat-row objective-row"><select name="objectiveName"><option>Conversas no WhatsApp</option><option>Acessos e vendas no site</option><option>Seguidores e interação</option><option>Geração de leads</option><option>Vendas no direct</option></select><label class="repeat-primary"><input type="radio" name="primaryObjective" value="${index}" ${objective.primary ? "checked" : ""}> Principal</label><button type="button" class="repeat-remove" title="Remover">×</button></div>`).join("")}</div></div><div class="work-form-section"><div class="work-form-section-heading"><div><span class="eyebrow-label">ORÇAMENTO</span><h3>Verba mensal ajustável</h3></div><button type="button" class="btn btn-ghost btn-sm" id="btnAddBudget">+ Mês</button></div><div id="budgetRows">${budgets.map((budget) => `<div class="repeat-row budget-row"><label>Mês<input type="month" name="budgetMonth" value="${escapeHTML(budget.month || "")}"></label><label>Verba (R$)<input type="number" min="0" step="0.01" name="budgetAmount" value="${Number(budget.amount || 0)}"></label><button type="button" class="repeat-remove" title="Remover">×</button></div>`).join("")}</div></div><div class="work-form-actions"><button class="btn btn-primary" type="submit">Salvar cliente</button></div></form>`;
  const form = el.workDetailPanel.querySelector("form");
  form
    .querySelectorAll(".audience-row")
    .forEach(
      (row, index) =>
        (row.querySelector("select").value =
          audiences[index].gender || "Todos"),
    );
  form
    .querySelectorAll(".objective-row")
    .forEach(
      (row, index) =>
        (row.querySelector("select").value =
          objectives[index].name || "Conversas no WhatsApp"),
    );
  const addRow = (container, html) => {
    container.insertAdjacentHTML("beforeend", html);
  };
  form.querySelector("#btnAddAudience").addEventListener("click", () => {
    const index = form.querySelectorAll(".audience-row").length;
    addRow(
      form.querySelector("#audienceRows"),
      `<div class="repeat-row audience-row"><input type="number" min="0" name="audienceAgeMin" value="18"><input type="number" min="0" name="audienceAgeMax" value="65"><select name="audienceGender"><option>Todos</option><option>Mulheres</option><option>Homens</option></select><input name="audienceSegmentation" placeholder="Segmentações"><label class="repeat-primary"><input type="radio" name="primaryAudience" value="${index}"> Principal</label><button type="button" class="repeat-remove">×</button></div>`,
    );
  });
  form.querySelector("#btnAddObjective").addEventListener("click", () => {
    const index = form.querySelectorAll(".objective-row").length;
    addRow(
      form.querySelector("#objectiveRows"),
      `<div class="repeat-row objective-row"><select name="objectiveName"><option>Conversas no WhatsApp</option><option>Acessos e vendas no site</option><option>Seguidores e interação</option><option>Geração de leads</option><option>Vendas no direct</option></select><label class="repeat-primary"><input type="radio" name="primaryObjective" value="${index}"> Principal</label><button type="button" class="repeat-remove">×</button></div>`,
    );
  });
  form
    .querySelector("#btnAddBudget")
    .addEventListener("click", () =>
      addRow(
        form.querySelector("#budgetRows"),
        `<div class="repeat-row budget-row"><label>Mês<input type="month" name="budgetMonth"></label><label>Verba (R$)<input type="number" min="0" step="0.01" name="budgetAmount" value="0"></label><button type="button" class="repeat-remove">×</button></div>`,
      ),
    );
  form.addEventListener("click", (event) => {
    if (event.target.classList.contains("repeat-remove"))
      event.target.closest(".repeat-row").remove();
  });
  form
    .querySelector("#btnCancelClient")
    .addEventListener("click", renderWorkView);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.id = client?.id;
    payload.audiences = [...form.querySelectorAll(".audience-row")].map(
      (row, index) => ({
        ageMin: Number(row.querySelector('[name="audienceAgeMin"]').value || 0),
        ageMax: Number(row.querySelector('[name="audienceAgeMax"]').value || 0),
        gender: row.querySelector('[name="audienceGender"]').value,
        segmentation: row.querySelector('[name="audienceSegmentation"]').value,
        primary:
          String(index) ===
          form.querySelector('[name="primaryAudience"]:checked')?.value,
      }),
    );
    payload.objectives = [...form.querySelectorAll(".objective-row")].map(
      (row, index) => ({
        name: row.querySelector('[name="objectiveName"]').value,
        primary:
          String(index) ===
          form.querySelector('[name="primaryObjective"]:checked')?.value,
      }),
    );
    payload.budgets = [...form.querySelectorAll(".budget-row")].map((row) => ({
      month: row.querySelector('[name="budgetMonth"]').value,
      amount: Number(row.querySelector('[name="budgetAmount"]').value || 0),
    }));
    try {
      const saved = await saveWorkspaceRecord("client", payload);
      state.currentClientId = saved.id;
      renderWorkView();
      showToast("Cliente salvo localmente", "success");
    } catch (error) {
      showToast(error.message, "danger");
    }
  });
}

function renderCampaignItem(campaign) {
  return `<div class="work-record-row"><div><strong>${escapeHTML(campaign.name)}</strong><small>${escapeHTML(campaign.platform || "Plataforma não definida")} · ${escapeHTML(campaign.status || "Rascunho")}</small></div><div><b>${formatCurrency(campaign.spend)}</b><small>${campaign.leads || 0} leads · ${campaign.conversions || 0} conversões</small></div></div>`;
}
function renderDocumentItem(document) {
  return `<div class="work-record-row"><div><strong>${escapeHTML(document.name)}</strong><small>${escapeHTML(document.kind || "Material")} · ${escapeHTML(document.status || "Rascunho")}</small></div><a href="${escapeHTML(document.url || "#")}" target="_blank" rel="noreferrer">Abrir</a></div>`;
}

function openCampaignEditor(client) {
  el.workDetailPanel.innerHTML = `<form class="work-form compact" id="campaignForm"><div class="work-detail-heading"><div><span class="eyebrow-label">NOVA CAMPANHA</span><h2>${escapeHTML(client.name)}</h2></div><button type="button" class="btn btn-ghost btn-sm" id="btnCancelCampaign">Cancelar</button></div><div class="work-form-grid"><label>Nome da campanha<input name="name" required placeholder="Ex.: Venda de kit amigurumi"></label><label>Plataforma<select name="platform"><option>Meta Ads</option><option>Google Ads</option><option>TikTok Ads</option><option>Orgânico</option></select></label><label>Status<select name="status"><option>Planejamento</option><option>Ativa</option><option>Pausada</option><option>Encerrada</option></select></label><label>Período<input name="period" placeholder="Ex.: 01/09 a 30/09"></label><label>Investimento (R$)<input name="spend" type="number" min="0" step="0.01" value="0"></label><label>Impressões<input name="impressions" type="number" min="0" value="0"></label><label>Cliques<input name="clicks" type="number" min="0" value="0"></label><label>Leads / contatos<input name="leads" type="number" min="0" value="0"></label><label>Conversões<input name="conversions" type="number" min="0" value="0"></label><label>Custo por resultado<input name="costPerResult" type="number" min="0" step="0.01" value="0"></label><label class="full">Observações<textarea name="notes" rows="3"></textarea></label></div><div class="work-form-actions"><button class="btn btn-primary">Salvar campanha</button></div></form>`;
  const form = el.workDetailPanel.querySelector("form");
  el.workDetailPanel
    .querySelector("#btnCancelCampaign")
    .addEventListener("click", () => renderWorkView());
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.clientId = client.id;
    [
      "spend",
      "impressions",
      "clicks",
      "leads",
      "conversions",
      "costPerResult",
    ].forEach((key) => (payload[key] = Number(payload[key] || 0)));
    try {
      await saveWorkspaceRecord("campaign", payload);
      renderWorkView();
      showToast("Campanha salva", "success");
    } catch (error) {
      showToast(error.message, "danger");
    }
  });
}

function openDocumentEditor(client) {
  el.workDetailPanel.innerHTML = `<form class="work-form compact" id="documentForm"><div class="work-detail-heading"><div><span class="eyebrow-label">MATERIAL DO CLIENTE</span><h2>Nova apresentação ou documento</h2></div><button type="button" class="btn btn-ghost btn-sm" id="btnCancelDocument">Cancelar</button></div><div class="work-form-grid"><label>Nome do material<input name="name" required placeholder="Ex.: Proposta comercial setembro"></label><label>Tipo<select name="kind"><option>Briefing</option><option>Proposta comercial</option><option>Relatório</option><option>Apresentação</option><option>Contrato</option></select></label><label>Status<select name="status"><option>Rascunho</option><option>Enviado</option><option>Aprovado</option></select></label><label>Link ou caminho local<input name="url" placeholder="C:\\Documentos\\proposta.pptx"></label><label class="full">Conteúdo / roteiro<textarea name="content" rows="6" placeholder="Título, problema, estratégia, investimento e próximos passos..."></textarea></label></div><div class="work-form-actions"><button class="btn btn-secondary" type="button" id="btnPresentationPreview">Gerar prévia HTML</button><button class="btn btn-primary">Salvar material</button></div></form>`;
  const form = el.workDetailPanel.querySelector("form");
  el.workDetailPanel
    .querySelector("#btnCancelDocument")
    .addEventListener("click", () => renderWorkView());
  el.workDetailPanel
    .querySelector("#btnPresentationPreview")
    .addEventListener("click", () => {
      const title = form.name.value || "Apresentação";
      const content = form.content.value || "Roteiro ainda não preenchido.";
      const preview = `<html><body style="font-family:Arial;padding:48px"><h1>${escapeHTML(title)}</h1><p>${escapeHTML(content).replace(/\n/g, "<br>")}</p></body></html>`;
      const blob = new Blob([preview], { type: "text/html" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.html`;
      link.click();
      URL.revokeObjectURL(link.href);
      showToast(
        "Prévia exportada; use Imprimir > Salvar como PDF ou importe o roteiro no PowerPoint",
        "info",
        6000,
      );
    });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.clientId = client.id;
    try {
      await saveWorkspaceRecord("document", payload);
      renderWorkView();
      showToast("Material salvo", "success");
    } catch (error) {
      showToast(error.message, "danger");
    }
  });
}

// 1. Course Dropdown in Header
function openDocumentEditor(client = null) {
  const clients = state.workspace.clients || [];
  if (!clients.length) {
    showToast("Cadastre um cliente antes de adicionar um documento", "warning");
    state.workSection = "clients";
    renderWorkView();
    return;
  }
  const selectedId = client?.id || state.currentClientId || clients[0].id;
  const target =
    state.workSection === "documents"
      ? el.workDocumentsGrid
      : el.workDetailPanel;
  target.innerHTML = `<form class="work-form compact" id="documentForm"><div class="work-detail-heading"><div><span class="eyebrow-label">ARQUIVO PROFISSIONAL</span><h2>Novo documento</h2></div><button type="button" class="btn btn-ghost btn-sm" id="btnCancelDocument">Cancelar</button></div><div class="work-form-grid"><label>Cliente relacionado<select name="clientId">${clients.map((item) => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)}</option>`).join("")}</select></label><label>Nome do material<input name="name" required placeholder="Ex.: Proposta comercial setembro"></label><label>Tipo<select name="kind"><option>Briefing</option><option>Proposta comercial</option><option>Relatório</option><option>Apresentação</option><option>Contrato</option></select></label><label>Status<select name="status"><option>Rascunho</option><option>Enviado</option><option>Aprovado</option></select></label><label class="full">Link ou caminho local<input name="url" placeholder="C:\\Documentos\\proposta.pptx"></label><label class="full">Conteúdo / roteiro<textarea name="content" rows="6" placeholder="Título, problema, estratégia, investimento e próximos passos..."></textarea></label></div><div class="work-form-actions"><button class="btn btn-secondary" type="button" id="btnPresentationPreview">Gerar prévia HTML</button><button class="btn btn-primary">Salvar documento</button></div></form>`;
  const form = target.querySelector("form");
  form.clientId.value = selectedId;
  form.querySelector("#btnCancelDocument").addEventListener("click", () => {
    state.workSection = "documents";
    renderWorkView();
  });
  form
    .querySelector("#btnPresentationPreview")
    .addEventListener("click", () => {
      const title = form.name.value || "Apresentação";
      const content = form.content.value || "Roteiro ainda não preenchido.";
      const blob = new Blob(
        [
          `<html><body style="font-family:Arial;padding:48px"><h1>${escapeHTML(title)}</h1><p>${escapeHTML(content).replace(/\n/g, "<br>")}</p></body></html>`,
        ],
        { type: "text/html" },
      );
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.html`;
      link.click();
      URL.revokeObjectURL(link.href);
    });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      await saveWorkspaceRecord("document", payload);
      state.workSection = "documents";
      renderWorkView();
      showToast("Documento salvo", "success");
    } catch (error) {
      showToast(error.message, "danger");
    }
  });
}

function renderCourseDropdown() {
  const courses = state.coursesData?.courses || [];
  if (!courses.length) {
    el.currentCourseLabel.textContent = "Nenhum curso na pasta";
    el.courseDropdownMenu.innerHTML =
      '<div style="padding:10px; color:#94a3b8; font-size:12px;">Nenhum vídeo localizado no caminho configurado.</div>';
    return;
  }

  const activeC = state.currentCourse || courses[0];
  el.currentCourseLabel.textContent = activeC.cleanTitle || activeC.title;

  el.courseDropdownMenu.innerHTML = "";
  courses.forEach((c) => {
    const item = document.createElement("div");
    item.className = `course-option-item ${c.id === activeC.id ? "active" : ""}`;
    item.innerHTML = `
      <span>${c.cleanTitle || c.title}</span>
      <span style="font-size:11px; opacity:0.7;">${c.completedVideos}/${c.totalVideos}</span>
    `;
    item.addEventListener("click", () => {
      state.currentCourse = c;
      el.currentCourseLabel.textContent = c.cleanTitle || c.title;
      el.courseSelectorWrapper.classList.remove("open");
      renderAll();
    });
    el.courseDropdownMenu.appendChild(item);
  });
}

// 2. Header Overall Progress
function updateHeaderProgress() {
  if (!state.currentCourse) return;
  const total = state.currentCourse.totalVideos || 0;
  const completed = state.currentCourse.completedVideos || 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  el.headerProgressPercent.textContent = `${pct}%`;
  el.headerProgressBar.style.width = `${pct}%`;
  el.headerProgressCount.textContent = `${completed}/${total} aulas`;
}

// 3. Home Hero - Continue Watching
function renderHomeHero() {
  const allVideos = getAllCurrentCourseVideos();
  if (!allVideos.length) {
    el.heroLessonTitle.textContent = "Nenhuma aula localizada";
    el.heroLessonSubtitle.textContent = `Verifique se o caminho '${el.cfgVideosDir.value}' está correto ou adicione seus vídeos na pasta.`;
    el.heroProgressWrapper.style.display = "none";
    el.btnHeroResume.style.display = "none";
    el.btnHeroMarkCompleted.style.display = "none";
    el.heroThumbWrapper.style.display = "none";
    return;
  }

  let targetVideo = null;
  const lastId = state.progress.lastVideoId;
  if (lastId) {
    targetVideo = allVideos.find((v) => v.id === lastId);
  }

  if (!targetVideo) {
    targetVideo = allVideos.find((v) => {
      const p = state.progress.videos?.[v.id];
      return p && !p.completed && p.currentTime > 0;
    });
  }

  if (!targetVideo) {
    targetVideo = allVideos.find((v) => !v.isCompleted) || allVideos[0];
  }

  const p = state.progress.videos?.[targetVideo.id] || targetVideo.progress;
  const pct = p ? p.percentage : 0;
  const currTime = p ? p.currentTime : 0;

  el.heroCourseModule.textContent = `${targetVideo.cleanCourse} • ${targetVideo.cleanModule}`;
  el.heroLessonTitle.textContent = targetVideo.cleanTitle;
  el.heroLessonSubtitle.textContent =
    currTime > 0
      ? `Você parou em ${formatTime(currTime)}. Clique no botão abaixo para continuar.`
      : `Pronto para começar esta aula do módulo ${targetVideo.cleanModule}.`;

  el.heroProgressWrapper.style.display = "block";
  el.heroProgressFill.style.width = `${pct}%`;
  el.heroPercent.textContent = `${pct}% concluído`;
  el.heroTimeLeft.textContent =
    currTime > 0 ? `Parou em: ${formatTime(currTime)}` : "Não iniciada";

  el.btnHeroResume.style.display = "inline-flex";
  el.btnHeroResumeText.textContent =
    currTime > 0 ? `Continuar (${formatTime(currTime)})` : "Iniciar Aula";
  el.btnHeroMarkCompleted.style.display = "inline-flex";

  el.heroThumbWrapper.style.display = "block";
  el.heroThumbImg.src = targetVideo.thumbUrl;

  el.btnHeroResume.onclick = () => playVideo(targetVideo);
  el.heroThumbWrapper.onclick = () => playVideo(targetVideo);
  el.btnHeroMarkCompleted.onclick = async () => {
    const isComp = !!state.progress.videos?.[targetVideo.id]?.completed;
    await saveProgress(
      targetVideo.id,
      targetVideo.progress.currentTime || 0,
      targetVideo.progress.duration || 100,
      !isComp,
    );
    showToast(
      !isComp ? "Aula marcada como concluída!" : "Desmarcada",
      "success",
    );
    renderHomeHero();
    renderStatsGrid();
    renderHomeVideosGrid();
    renderCurriculumTrack();
  };
}

// 4. Stats Grid
function renderStatsGrid() {
  const allVideos = getAllCurrentCourseVideos();
  let completed = 0;
  let inProgress = 0;

  allVideos.forEach((v) => {
    const p = state.progress.videos?.[v.id];
    if (p && p.completed) completed++;
    else if (p && p.currentTime > 0) inProgress++;
  });

  el.statTotalVideos.textContent = allVideos.length;
  el.statCompletedVideos.textContent = completed;
  el.statInProgressVideos.textContent = inProgress;
  el.statTotalNotes.textContent = state.notes.length;
}

// 5. Home Videos Grid
function renderHomeVideosGrid() {
  const allVideos = getAllCurrentCourseVideos();
  let filtered = allVideos;

  if (state.homeTopicFilter !== "all") {
    filtered = filtered.filter(
      (v) =>
        v.module === state.homeTopicFilter ||
        v.cleanModule === state.homeTopicFilter,
    );
  }

  if (state.currentFilter === "in_progress") {
    filtered = allVideos.filter((v) => {
      const p = state.progress.videos?.[v.id];
      return p && !p.completed && p.currentTime > 0;
    });
  } else if (state.currentFilter === "completed") {
    filtered = allVideos.filter((v) => {
      const p = state.progress.videos?.[v.id];
      return p && p.completed;
    });
  } else if (state.currentFilter === "unwatched") {
    filtered = allVideos.filter((v) => {
      const p = state.progress.videos?.[v.id];
      return !p || (!p.completed && p.currentTime === 0);
    });
  } else if (state.currentFilter === "favorites") {
    filtered = allVideos.filter((v) => state.favorites.includes(v.id));
  }

  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase().trim();
    filtered = filtered.filter((v) => {
      const titleMatch =
        v.cleanTitle.toLowerCase().includes(q) ||
        v.rawTitle.toLowerCase().includes(q);
      const modMatch = v.cleanModule.toLowerCase().includes(q);
      const notesMatch = state.notes.some(
        (n) => n.videoId === v.id && n.text.toLowerCase().includes(q),
      );
      return titleMatch || modMatch || notesMatch;
    });
  }

  el.inProgressCountBadge.textContent = filtered.length;
  el.homeVideosGrid.innerHTML = "";

  if (!filtered.length) {
    el.homeVideosGrid.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-lg);">
        <p style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">Nenhuma aula encontrada</p>
        <p style="font-size: 13px;">Tente ajustar o filtro selecionado ou verificar o caminho das pastas de vídeos.</p>
      </div>
    `;
    return;
  }

  filtered.forEach((video) => {
    const card = createVideoCardElement(video);
    el.homeVideosGrid.appendChild(card);
  });
}

function renderHomeTopics() {
  if (!el.homeTopicsList) return;
  const modules = state.currentCourse?.modules || [];
  el.homeTopicsList.innerHTML = "";

  const topics = [
    {
      id: "all",
      title: "Todos os temas",
      count: state.currentCourse?.totalVideos || 0,
    },
    ...modules.map((module) => ({
      id: module.title || module.id,
      title: module.cleanTitle || module.title,
      count: module.totalVideos || module.videos?.length || 0,
    })),
  ];

  topics.forEach((topic) => {
    const button = document.createElement("button");
    button.className = `home-topic-btn ${state.homeTopicFilter === topic.id ? "active" : ""}`;
    button.innerHTML = `<span>${escapeHTML(topic.title)}</span><small>${topic.count}</small>`;
    button.addEventListener("click", () => {
      state.homeTopicFilter = topic.id;
      renderHomeTopics();
      renderHomeVideosGrid();
    });
    el.homeTopicsList.appendChild(button);
  });
}

function createVideoCardElement(video) {
  const card = document.createElement("div");
  card.className = "video-card";

  const p = state.progress.videos?.[video.id] ||
    video.progress || { currentTime: 0, percentage: 0, completed: false };
  const isCompleted = !!p.completed;
  const isFav = state.favorites.includes(video.id);
  const videoNotes = state.notes.filter((n) => n.videoId === video.id);

  card.innerHTML = `
    <div class="card-thumb-container">
      <img class="card-thumb-img" src="${video.thumbUrl}" alt="${video.cleanTitle}" loading="lazy" />
      ${
        isCompleted
          ? `
        <div class="card-completed-badge">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Concluída</span>
        </div>`
          : ""
      }
      
      <button class="card-fav-btn ${isFav ? "active" : ""}" title="${isFav ? "Remover dos favoritos" : "Adicionar aos favoritos"}">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="${isFav ? "#f59e0b" : "none"}" stroke="currentColor" stroke-width="2">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
        </svg>
      </button>

      <div class="card-play-hover-overlay">
        <div class="card-play-icon">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        </div>
      </div>

      ${
        p.currentTime > 0 && !isCompleted
          ? `
        <span class="card-duration-badge">${formatTime(p.currentTime)}</span>
        <div class="card-progress-strip">
          <div class="card-progress-fill" style="width: ${p.percentage}%"></div>
        </div>
      `
          : ""
      }
    </div>

    <div class="card-body">
      <span class="card-module-tag">${video.cleanModule}</span>
      <h3 class="card-clean-title" title="${video.cleanTitle}">${video.cleanTitle}</h3>
      <div class="card-meta-footer">
        <span>${isCompleted ? "✓ Assistida" : p.currentTime > 0 ? `${p.percentage}% assistido` : "Não assistida"}</span>
        ${
          videoNotes.length > 0
            ? `
          <span class="card-notes-indicator" title="${videoNotes.length} anotações">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            </svg>
            ${videoNotes.length}
          </span>
        `
            : ""
        }
      </div>
    </div>
  `;

  const favBtn = card.querySelector(".card-fav-btn");
  favBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const favNow = await toggleFavoriteAPI(video.id);
    favBtn.classList.toggle("active", favNow);
    favBtn
      .querySelector("svg")
      .setAttribute("fill", favNow ? "#f59e0b" : "none");
    showToast(
      favNow ? "Adicionado aos favoritos" : "Removido dos favoritos",
      "info",
    );
  });

  card.addEventListener("click", () => {
    playVideo(video);
  });

  return card;
}

// 6. Curriculum Track (Unrestricted height so ALL lessons are scrollable and visible)
function renderCurriculumTrack() {
  if (!state.currentCourse) return;
  const modules = state.currentCourse.modules || [];
  el.curriculumTrackContainer.innerHTML = "";

  modules.forEach((mod, modIdx) => {
    const card = document.createElement("div");
    card.className = `module-accordion-card ${modIdx === 0 ? "open" : ""}`;

    let modCompleted = 0;
    mod.videos.forEach((v) => {
      if (state.progress.videos?.[v.id]?.completed) modCompleted++;
    });
    const modTotal = mod.videos.length;
    const modPct =
      modTotal > 0 ? Math.round((modCompleted / modTotal) * 100) : 0;

    card.innerHTML = `
      <div class="module-accordion-header">
        <div class="module-header-left">
          <svg class="module-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
          <span class="module-number-pill">MÓDULO ${modIdx + 1}</span>
          <h3 class="module-name-title">${mod.cleanTitle}</h3>
        </div>
        <div class="module-header-right">
          <div class="module-progress-pill">
            <span>${modCompleted}/${modTotal} concluídas</span>
            <div class="module-progress-bar-mini">
              <div class="module-progress-fill-mini" style="width: ${modPct}%"></div>
            </div>
            <span>${modPct}%</span>
          </div>
        </div>
      </div>
      <div class="module-lessons-container"></div>
    `;

    const header = card.querySelector(".module-accordion-header");
    header.addEventListener("click", () => {
      card.classList.toggle("open");
    });

    const lessonsContainer = card.querySelector(".module-lessons-container");
    mod.videos.forEach((video, lessonIdx) => {
      const item = document.createElement("div");
      const isCompleted = !!state.progress.videos?.[video.id]?.completed;
      const isFav = state.favorites.includes(video.id);
      const isCurrent =
        state.currentVideo && state.currentVideo.id === video.id;

      item.className = `lesson-list-item ${isCurrent ? "active-playing" : ""}`;
      item.innerHTML = `
        <div class="item-left">
          <div class="item-status-check ${isCompleted ? "completed" : ""}" title="${isCompleted ? "Concluída" : "Marcar como concluída"}">
            ${
              isCompleted
                ? `
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            `
                : ""
            }
          </div>
          <span style="font-size:12px; font-weight:700; color:var(--text-muted); width:24px;">${lessonIdx + 1}.</span>
          <span class="item-clean-title" title="${video.cleanTitle}">${video.cleanTitle}</span>
        </div>
        <div class="item-right">
          ${isFav ? `<svg viewBox="0 0 24 24" width="14" height="14" fill="#f59e0b" stroke="#f59e0b"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>` : ""}
          <span class="item-time-badge">${video.progress.currentTime > 0 ? formatTime(video.progress.currentTime) : "Assistir"}</span>
        </div>
      `;

      const checkBtn = item.querySelector(".item-status-check");
      checkBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const nextCompleted = !isCompleted;
        await saveProgress(
          video.id,
          video.progress.currentTime || 0,
          video.progress.duration || 100,
          nextCompleted,
        );
        showToast(nextCompleted ? "Aula concluída!" : "Desmarcada", "success");
        updateHeaderProgress();
        renderCurriculumTrack();
        renderStatsGrid();
      });

      item.addEventListener("click", () => {
        playVideo(video);
      });

      lessonsContainer.appendChild(item);
    });

    el.curriculumTrackContainer.appendChild(card);
  });
}

// 7. ABA DE TODOS OS CURSOS (Exibindo todos os cursos e módulos como o usuário pediu)
function renderAllCoursesView() {
  const courses = state.coursesData?.courses || [];
  el.allCoursesContainer.innerHTML = "";

  if (!courses.length) {
    el.allCoursesContainer.innerHTML = `
      <div style="padding:40px; text-align:center; color:var(--text-muted); background:var(--bg-card); border-radius:var(--radius-lg);">
        <p style="font-size:16px; font-weight:600; margin-bottom:8px;">Nenhum curso encontrado no caminho configurado</p>
        <p style="font-size:13px;">Caminho atual: <code>${el.cfgVideosDir.value}</code></p>
      </div>
    `;
    return;
  }

  courses.forEach((course) => {
    const card = document.createElement("div");
    card.className = "course-catalog-card";

    const modules = course.modules || [];
    let completedLessons = 0;
    modules.forEach((m) => {
      m.videos.forEach((v) => {
        if (state.progress.videos?.[v.id]?.completed) completedLessons++;
      });
    });
    const totalLessons = course.totalVideos || 0;
    const coursePct =
      totalLessons > 0
        ? Math.round((completedLessons / totalLessons) * 100)
        : 0;

    card.innerHTML = `
      <div class="course-catalog-header">
        <div class="course-catalog-title-area">
          <span class="course-catalog-tag">CURSO DISPONÍVEL</span>
          <h2 class="course-catalog-title">TÍTULO: ${course.cleanTitle || course.title}</h2>
        </div>
        <div class="course-catalog-stats">
          <div class="catalog-stat-pill">
            <span class="catalog-stat-label">Módulos</span>
            <span class="catalog-stat-val">${modules.length}</span>
          </div>
          <div class="catalog-stat-pill">
            <span class="catalog-stat-label">Aulas</span>
            <span class="catalog-stat-val">${completedLessons}/${totalLessons}</span>
          </div>
          <div class="catalog-stat-pill">
            <span class="catalog-stat-label">Concluído</span>
            <span class="catalog-stat-val" style="color:var(--accent-primary);">${coursePct}%</span>
          </div>
          <button class="btn btn-primary btn-sm btn-select-course">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <span>Acessar Curso</span>
          </button>
        </div>
      </div>

      <div style="margin-bottom:14px;">
        <h3 style="font-size:16px; font-weight:700; color:var(--text-secondary);">Módulos do Curso:</h3>
      </div>

      <div class="module-catalog-grid"></div>
    `;

    card.querySelector(".btn-select-course").onclick = () => {
      state.currentCourse = course;
      renderAll();
      switchView("viewHome");
      showToast(`Curso selecionado: ${course.cleanTitle}`, "info");
    };

    const modulesGrid = card.querySelector(".module-catalog-grid");
    modules.forEach((mod, mIdx) => {
      const modCard = document.createElement("div");
      modCard.className = "module-catalog-card";

      let modComp = 0;
      mod.videos.forEach((v) => {
        if (state.progress.videos?.[v.id]?.completed) modComp++;
      });
      const modTotal = mod.videos.length;
      const modPct = modTotal > 0 ? Math.round((modComp / modTotal) * 100) : 0;

      let lessonsHTML = "";
      mod.videos.forEach((v, vIdx) => {
        const isComp = !!state.progress.videos?.[v.id]?.completed;
        lessonsHTML += `
          <div class="lesson-preview-item" data-videoid="${v.id}">
            <span>${vIdx + 1}. ${v.cleanTitle}</span>
            <span style="font-size:11px; font-weight:700; color:${isComp ? "var(--accent-success)" : "var(--text-muted)"}; flex-shrink:0; margin-left:8px;">
              ${isComp ? "✓ Concluída" : "Assistir"}
            </span>
          </div>
        `;
      });

      modCard.innerHTML = `
        <div class="module-card-top">
          <span class="module-number-pill">MÓDULO ${mIdx + 1}</span>
          <span style="font-size:12px; font-weight:600; color:var(--text-secondary);">${modComp}/${modTotal} aulas</span>
        </div>
        <h3 class="module-catalog-name">${mod.cleanTitle}</h3>
        
        <div class="module-catalog-progress">
          <div class="module-progress-bar-wide">
            <div style="height:100%; width:${modPct}%; background:var(--accent-success); border-radius:4px;"></div>
          </div>
          <span style="font-size:11px; font-weight:700; color:var(--text-muted);">${modPct}%</span>
        </div>

        <div class="module-lessons-preview-list">
          ${lessonsHTML}
        </div>

        <button class="btn btn-secondary btn-sm module-card-btn">
          <span>Abrir Módulo (${mod.videos.length} aulas)</span>
        </button>
      `;

      modCard.querySelectorAll(".lesson-preview-item").forEach((lItem) => {
        lItem.onclick = () => {
          const vId = lItem.dataset.videoid;
          const targetV = mod.videos.find((v) => v.id === vId);
          if (targetV) {
            state.currentCourse = course;
            playVideo(targetV);
          }
        };
      });

      modCard.querySelector(".module-card-btn").onclick = () => {
        state.currentCourse = course;
        const targetV =
          mod.videos.find((v) => !state.progress.videos?.[v.id]?.completed) ||
          mod.videos[0];
        if (targetV) playVideo(targetV);
      };

      modulesGrid.appendChild(modCard);
    });

    el.allCoursesContainer.appendChild(card);
  });
}

// 8. Player Details & Sidebar
function renderPlayerDetails(video) {
  state.currentVideo = video;
  el.playerLessonCleanTitle.textContent = video.cleanTitle;
  el.playerLessonFileName.textContent = video.id;
  el.bcCourse.textContent = video.cleanCourse;
  el.bcModule.textContent = video.cleanModule;

  const p = state.progress.videos?.[video.id] || video.progress;
  const isCompleted = !!(p && p.completed);
  el.btnToggleCompleted.classList.toggle("completed-active", isCompleted);
  el.btnCompletedLabel.textContent = isCompleted
    ? "✓ Concluída"
    : "Marcar como Concluída";

  const isFav = state.favorites.includes(video.id);
  el.btnToggleFavorite.classList.toggle("active", isFav);
  el.btnFavoriteLabel.textContent = isFav ? "Favoritado" : "Favoritar";
  el.btnToggleFavorite
    .querySelector(".fav-icon")
    .setAttribute("fill", isFav ? "#f59e0b" : "none");

  el.preloadThumbImg.src = video.thumbUrl;
  el.preloadLessonTitle.textContent = video.cleanTitle;

  // STRICT CHECK: Only load new src if it is a genuinely different video
  if (state.loadedVideoId !== video.id) {
    state.loadedVideoId = video.id;
    el.videoPreloadOverlay.style.display = "flex";
    el.mainVideoPlayer.src = video.videoUrl;

    // Apply speed and volume
    el.mainVideoPlayer.defaultPlaybackRate =
      state.settings.playbackSpeed || 1.0;
    el.mainVideoPlayer.playbackRate = state.settings.playbackSpeed || 1.0;
    el.mainVideoPlayer.volume = state.settings.volume ?? 1.0;
  }

  renderLessonNotesList(video.id);
  renderPlayerSidebar();
}

function renderPlayerSidebar() {
  if (!state.currentCourse) return;
  const modules = state.currentCourse.modules || [];
  el.sidebarModulesList.innerHTML = "";

  const total = state.currentCourse.totalVideos || 0;
  let comp = 0;
  const allV = getAllCurrentCourseVideos();
  allV.forEach((v) => {
    if (state.progress.videos?.[v.id]?.completed) comp++;
  });
  el.sidebarProgressText.textContent = `${comp} de ${total} aulas concluídas (${total > 0 ? Math.round((comp / total) * 100) : 0}%)`;

  const searchQ = (el.sidebarSearchInput.value || "").toLowerCase().trim();

  modules.forEach((mod, mIdx) => {
    let modVideos = mod.videos;
    if (searchQ) {
      modVideos = modVideos.filter((v) =>
        v.cleanTitle.toLowerCase().includes(searchQ),
      );
    }

    if (!modVideos.length && searchQ) return;

    const modCard = document.createElement("div");
    const hasCurrent = mod.videos.some(
      (v) => state.currentVideo && v.id === state.currentVideo.id,
    );
    modCard.className = `module-accordion-card ${hasCurrent || mIdx === 0 ? "open" : ""}`;

    modCard.innerHTML = `
      <div class="module-accordion-header" style="padding:12px 14px;">
        <div class="module-header-left" style="gap:8px;">
          <svg class="module-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
          <span style="font-size:13px; font-weight:700;">${mod.cleanTitle}</span>
        </div>
        <span style="font-size:11px; color:var(--text-muted);">${mod.videos.length} aulas</span>
      </div>
      <div class="module-lessons-container" style="padding: 6px 8px;"></div>
    `;

    const header = modCard.querySelector(".module-accordion-header");
    header.onclick = () => modCard.classList.toggle("open");

    const listCont = modCard.querySelector(".module-lessons-container");
    modVideos.forEach((v) => {
      const item = document.createElement("div");
      const isCurrent = state.currentVideo && state.currentVideo.id === v.id;
      const isCompleted = !!state.progress.videos?.[v.id]?.completed;

      item.className = `lesson-list-item ${isCurrent ? "active-playing" : ""}`;
      item.setAttribute("data-videoid", v.id);
      item.style.padding = "8px 10px";
      item.innerHTML = `
        <div class="item-left" style="gap:10px;">
          <div class="item-status-check ${isCompleted ? "completed" : ""}" style="width:16px; height:16px;">
            ${isCompleted ? `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>` : ""}
          </div>
          <span class="item-clean-title" style="font-size:14px;">${v.cleanTitle}</span>
        </div>
      `;

      item.onclick = () => playVideo(v);
      listCont.appendChild(item);

      if (isCurrent) {
        setTimeout(() => {
          item.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 100);
      }
    });

    el.sidebarModulesList.appendChild(modCard);
  });
}

// 9. Lesson Notes
function renderLessonNotesList(videoId) {
  const notes = state.notes.filter((n) => n.videoId === videoId);
  notes.sort((a, b) => a.timestamp - b.timestamp);

  el.tabNotesCount.textContent = notes.length;
  el.lessonNotesList.innerHTML = "";

  if (!notes.length) {
    el.lessonNotesList.innerHTML = `
      <div style="padding:20px; text-align:center; color:var(--text-muted); font-size:13px;">
        Nenhuma anotação nesta aula ainda. Adicione uma anotação com timestamp acima!
      </div>
    `;
    return;
  }

  notes.forEach((note) => {
    const noteEl = document.createElement("div");
    noteEl.className = "note-card-item";
    noteEl.innerHTML = `
      <div class="note-item-left">
        <button class="note-timestamp-btn" title="Pular vídeo para este momento">
          <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <span>${note.timestampFormatted || formatTime(note.timestamp)}</span>
        </button>
        <div class="note-text-content">${escapeHTML(note.text)}</div>
      </div>
      <div class="note-item-actions">
        <button class="note-btn-action delete-btn" title="Excluir nota">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;

    noteEl.querySelector(".note-timestamp-btn").onclick = () => {
      el.mainVideoPlayer.currentTime = note.timestamp;
      el.mainVideoPlayer.play();
      showToast(`Pulou para ${note.timestampFormatted}`, "info");
    };

    noteEl.querySelector(".delete-btn").onclick = async () => {
      if (confirm("Deseja realmente excluir esta anotação?")) {
        await deleteNoteAPI(note.id);
        renderLessonNotesList(videoId);
        showToast("Anotação excluída", "info");
      }
    };

    el.lessonNotesList.appendChild(noteEl);
  });
}

// 10. All Notes View
function renderAllNotesView() {
  const allVideos = getAllCurrentCourseVideos();
  const videoMap = new Map();
  allVideos.forEach((v) => videoMap.set(v.id, v));

  el.globalNotesContainer.innerHTML = "";
  if (!state.notes.length) {
    el.globalNotesContainer.innerHTML = `
      <div style="padding:40px; text-align:center; color:var(--text-muted); background:var(--bg-card); border-radius:var(--radius-lg);">
        <p style="font-size:16px; font-weight:600; margin-bottom:8px;">Nenhuma anotação registrada ainda</p>
        <p style="font-size:13px;">Durante a reprodução de qualquer aula, adicione anotações vinculadas ao minuto exato do vídeo.</p>
      </div>
    `;
    return;
  }

  const grouped = {};
  state.notes.forEach((note) => {
    if (!grouped[note.videoId]) grouped[note.videoId] = [];
    grouped[note.videoId].push(note);
  });

  for (const [vId, vNotes] of Object.entries(grouped)) {
    const video = videoMap.get(vId) || {
      id: vId,
      cleanTitle: vId,
      cleanModule: "Geral",
      cleanCourse: "Curso",
    };
    const groupEl = document.createElement("div");
    groupEl.className = "course-notes-group";
    groupEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
        <div>
          <span style="font-size:11px; font-weight:700; color:var(--accent-secondary); text-transform:uppercase;">${video.cleanCourse} • ${video.cleanModule}</span>
          <h3 class="course-notes-title" style="margin:4px 0 0 0; border:none; padding:0;">${video.cleanTitle}</h3>
        </div>
        <button class="btn btn-secondary btn-sm btn-open-lesson">Assistir Aula ▶</button>
      </div>
      <div class="notes-list"></div>
    `;

    groupEl.querySelector(".btn-open-lesson").onclick = () => {
      playVideo(video);
    };

    const nList = groupEl.querySelector(".notes-list");
    vNotes
      .sort((a, b) => a.timestamp - b.timestamp)
      .forEach((note) => {
        const item = document.createElement("div");
        item.className = "note-card-item";
        item.innerHTML = `
        <div class="note-item-left">
          <button class="note-timestamp-btn">
            <span>${note.timestampFormatted || formatTime(note.timestamp)}</span>
          </button>
          <div class="note-text-content">${escapeHTML(note.text)}</div>
        </div>
        <div class="note-item-actions">
          <button class="note-btn-action delete-btn">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;

        item.querySelector(".note-timestamp-btn").onclick = () => {
          playVideo(video, note.timestamp);
        };

        item.querySelector(".delete-btn").onclick = async () => {
          if (confirm("Deseja excluir esta anotação?")) {
            await deleteNoteAPI(note.id);
            renderAllNotesView();
            showToast("Anotação excluída", "info");
          }
        };

        nList.appendChild(item);
      });

    el.globalNotesContainer.appendChild(groupEl);
  }
}

// 11. Favorites View
function renderFavoritesView() {
  const allVideos = getAllCurrentCourseVideos();
  const favVideos = allVideos.filter((v) => state.favorites.includes(v.id));

  el.favoritesVideosGrid.innerHTML = "";
  if (!favVideos.length) {
    el.favoritesVideosGrid.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-lg);">
        <p style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">Nenhuma aula favoritada ainda</p>
        <p style="font-size: 13px;">Clique no ícone de estrela nas aulas para salvá-las aqui e encontrá-las rapidamente.</p>
      </div>
    `;
    return;
  }

  favVideos.forEach((v) => {
    const card = createVideoCardElement(v);
    el.favoritesVideosGrid.appendChild(card);
  });
}

function getAllCurrentCourseVideos() {
  if (!state.currentCourse || !state.currentCourse.modules) return [];
  const list = [];
  state.currentCourse.modules.forEach((m) => {
    m.videos.forEach((v) => list.push(v));
  });
  return list;
}

// --------------------------------------------------------------------------
// PLAYER CORE ENGINE & CONTROLS
// --------------------------------------------------------------------------

function playVideo(video, startTime = null) {
  if (state.autoplayTimer) {
    clearTimeout(state.autoplayTimer);
    state.autoplayTimer = null;
    el.autoplayOverlay.style.display = "none";
  }

  state.currentVideo = video;
  switchView("viewPlayer");
  renderPlayerDetails(video);

  const p = state.progress.videos?.[video.id] || video.progress;
  let resumeTime = 0;
  if (startTime !== null && !isNaN(startTime)) {
    resumeTime = startTime;
  } else if (p && p.currentTime > 0 && !p.completed) {
    resumeTime = p.currentTime;
  }

  const startPlayback = () => {
    el.videoPreloadOverlay.style.display = "none";
    if (resumeTime > 0) {
      el.mainVideoPlayer.currentTime = resumeTime;
    }
    // Re-enforce speed and volume
    el.mainVideoPlayer.defaultPlaybackRate =
      state.settings.playbackSpeed || 1.0;
    el.mainVideoPlayer.playbackRate = state.settings.playbackSpeed || 1.0;
    el.mainVideoPlayer.volume = state.settings.volume ?? 1.0;
    el.mainVideoPlayer.play().catch((e) => console.log("Autoplay prevent:", e));
  };

  el.btnBigPlay.onclick = startPlayback;
  el.preloadThumbImg.onclick = startPlayback;

  startPlayback();
}

function updateCourseProgressStats() {
  updateHeaderProgress();
  renderStatsGrid();
}

// Play/Pause with visual feedback
function togglePlayPause() {
  if (el.mainVideoPlayer.paused) {
    el.mainVideoPlayer
      .play()
      .then(() => {
        showActionFeedback(true);
      })
      .catch(console.error);
  } else {
    el.mainVideoPlayer.pause();
    showActionFeedback(false);
  }
}

// Playback Speed (Strictly persisted across all videos and sessions)
function setPlaybackSpeed(speed, persist = true) {
  const val = parseFloat(speed);
  state.settings.playbackSpeed = val;
  localStorage.setItem("videohub_speed", val.toString());

  el.mainVideoPlayer.defaultPlaybackRate = val;
  el.mainVideoPlayer.playbackRate = val;
  el.ctrlSpeedLabel.textContent = `${val.toFixed(2).replace(".00", "")}x`;

  document.querySelectorAll(".speed-dropdown button").forEach((b) => {
    b.classList.toggle("active", parseFloat(b.dataset.speed) === val);
  });
  if (persist) saveSettingsAPI({ playbackSpeed: val });
}

function seekRelative(seconds) {
  const curr = el.mainVideoPlayer.currentTime;
  const dur = el.mainVideoPlayer.duration || 0;
  el.mainVideoPlayer.currentTime = Math.max(0, Math.min(dur, curr + seconds));
}

function updateAmbilight() {
  if (!state.ambientMode || !el.mainVideoPlayer.readyState) return;
  const canvas = el.ambilightCanvas;
  const ctx = canvas.getContext("2d");
  if (canvas.width !== 64 || canvas.height !== 36) {
    canvas.width = 64;
    canvas.height = 36;
  }
  try {
    ctx.drawImage(el.mainVideoPlayer, 0, 0, 64, 36);
  } catch (e) {}
  if (!el.mainVideoPlayer.paused && !el.mainVideoPlayer.ended) {
    requestAnimationFrame(updateAmbilight);
  }
}

function updateAmbientButton() {
  if (!el.btnToggleAmbient) return;
  el.btnToggleAmbient.classList.toggle("active", state.ambientMode);
  el.btnToggleAmbient.setAttribute("aria-pressed", String(state.ambientMode));
}

function playNextLesson() {
  const allV = getAllCurrentCourseVideos();
  if (!state.currentVideo || !allV.length) return;
  const idx = allV.findIndex((v) => v.id === state.currentVideo.id);
  if (idx !== -1 && idx < allV.length - 1) {
    playVideo(allV[idx + 1]);
    showToast(`Iniciando próxima aula: ${allV[idx + 1].cleanTitle}`, "info");
  } else {
    showToast("Você chegou à última aula deste curso!", "success");
  }
}

function playPrevLesson() {
  const allV = getAllCurrentCourseVideos();
  if (!state.currentVideo || !allV.length) return;
  const idx = allV.findIndex((v) => v.id === state.currentVideo.id);
  if (idx > 0) {
    playVideo(allV[idx - 1]);
  } else {
    showToast("Você já está na primeira aula!", "info");
  }
}

// --------------------------------------------------------------------------
// VIEW SWITCHER
// --------------------------------------------------------------------------

function switchView(viewId) {
  el.navBtnHome.classList.toggle("active", viewId === "viewHome");
  el.navBtnCourses.classList.toggle("active", viewId === "viewCourses");
  el.navBtnPlayer.classList.toggle("active", viewId === "viewPlayer");
  el.navBtnNotes.classList.toggle("active", viewId === "viewNotes");
  el.navBtnFavorites.classList.toggle("active", viewId === "viewFavorites");
  el.navBtnWork.classList.toggle("active", viewId === "viewWork");

  [
    el.viewHome,
    el.viewCourses,
    el.viewPlayer,
    el.viewNotes,
    el.viewFavorites,
    el.viewWork,
  ].forEach((v) => {
    v.classList.toggle("active", v.id === viewId);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });

  if (viewId === "viewNotes") {
    renderAllNotesView();
  } else if (viewId === "viewFavorites") {
    renderFavoritesView();
  } else if (viewId === "viewHome") {
    renderHomeHero();
    renderHomeVideosGrid();
    renderHomeTopics();
    renderCurriculumTrack();
  } else if (viewId === "viewCourses") {
    renderAllCoursesView();
  } else if (viewId === "viewWork") {
    renderWorkView();
  }
}

// --------------------------------------------------------------------------
// EVENT LISTENERS BINDINGS
// --------------------------------------------------------------------------

function initEventListeners() {
  // Navigation
  el.btnLogoHome.addEventListener("click", () => switchView("viewHome"));
  el.navBtnHome.addEventListener("click", () => switchView("viewHome"));
  el.navBtnCourses.addEventListener("click", () => switchView("viewCourses"));
  el.navBtnPlayer.addEventListener("click", () => switchView("viewPlayer"));
  el.navBtnNotes.addEventListener("click", () => switchView("viewNotes"));
  el.navBtnFavorites.addEventListener("click", () =>
    switchView("viewFavorites"),
  );
  el.navBtnWork.addEventListener("click", () => switchView("viewWork"));
  el.btnBackToHome.addEventListener("click", () => switchView("viewHome"));
  el.btnNewClient.addEventListener("click", () => openClientEditor());
  el.btnEmptyNewClient.addEventListener("click", () => openClientEditor());
  el.workClientSearch.addEventListener("input", renderWorkView);
  el.btnExportWork.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state.workspace, null, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "video-hub-workspace.json";
    link.click();
    URL.revokeObjectURL(link.href);
  });
  el.workTabs.addEventListener("click", (event) => {
    const tab = event.target.closest(".work-tab");
    if (!tab) return;
    state.workSection = tab.dataset.workSection;
    renderWorkView();
    if (state.workSection === "reports") refreshMetaConnectionStatus();
  });
  el.documentClientFilter.addEventListener("change", renderWorkDocuments);
  el.documentSearch.addEventListener("input", renderWorkDocuments);
  el.btnNewDocument.addEventListener("click", () => openDocumentEditor());
  el.btnNewReport.addEventListener("click", () => openReportEditor());
  el.btnImportMeta.addEventListener("click", importMetaInsights);
  el.btnImportGa.addEventListener("click", importGaInsights);

  // Course Selector Toggle
  el.courseSelectorBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    el.courseSelectorWrapper.classList.toggle("open");
  });
  document.addEventListener("click", (e) => {
    if (!el.courseSelectorWrapper.contains(e.target)) {
      el.courseSelectorWrapper.classList.remove("open");
    }
  });

  // Global Search
  let searchDebounce = null;
  el.globalSearchInput.addEventListener("input", (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      state.searchQuery = e.target.value;
      el.btnClearSearch.style.display = state.searchQuery ? "block" : "none";
      if (document.querySelector(".view-section.active") !== el.viewHome) {
        switchView("viewHome");
      } else {
        renderHomeVideosGrid();
      }
    }, 200);
  });

  el.btnClearSearch.addEventListener("click", () => {
    el.globalSearchInput.value = "";
    state.searchQuery = "";
    el.btnClearSearch.style.display = "none";
    renderHomeVideosGrid();
  });

  // Home filter tabs
  el.homeFilterTabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".pill-btn");
    if (!btn) return;
    el.homeFilterTabs
      .querySelectorAll(".pill-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.currentFilter = btn.dataset.filter;
    renderHomeVideosGrid();
  });

  // Expand / Collapse all modules
  el.btnExpandAllModules.addEventListener("click", () => {
    document
      .querySelectorAll(".module-accordion-card")
      .forEach((c) => c.classList.add("open"));
  });
  el.btnCollapseAllModules.addEventListener("click", () => {
    document
      .querySelectorAll(".module-accordion-card")
      .forEach((c) => c.classList.remove("open"));
  });

  // Video Events
  const video = el.mainVideoPlayer;

  // DIRECT CLICK SURFACE FOR PLAY/PAUSE
  el.videoClickSurface.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    togglePlayPause();
  });

  el.videoClickSurface.addEventListener("dblclick", (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.ctrlFullscreen.click();
  });

  // Ensure speed is maintained on EVERY playback event
  const ensurePlaybackSpeed = () => {
    const desired = state.settings.playbackSpeed || 1.0;
    if (video.playbackRate !== desired) {
      video.playbackRate = desired;
    }
  };

  video.addEventListener("play", () => {
    el.ctrlPlayPause.querySelector(".icon-play").style.display = "none";
    el.ctrlPlayPause.querySelector(".icon-pause").style.display = "block";
    ensurePlaybackSpeed();
    if (state.ambientMode) {
      el.videoContainer.classList.add("ambient-active");
      requestAnimationFrame(updateAmbilight);
    }
    updateAmbientButton();
  });

  video.addEventListener("playing", ensurePlaybackSpeed);
  video.addEventListener("loadedmetadata", ensurePlaybackSpeed);
  video.addEventListener("loadeddata", () => captureFirstFrame(video));
  video.addEventListener("canplay", ensurePlaybackSpeed);

  video.addEventListener("pause", () => {
    el.ctrlPlayPause.querySelector(".icon-play").style.display = "block";
    el.ctrlPlayPause.querySelector(".icon-pause").style.display = "none";
    el.videoContainer.classList.toggle("ambient-active", state.ambientMode);
    if (state.ambientMode) updateAmbilight();
    if (state.currentVideo) {
      saveProgress(state.currentVideo.id, video.currentTime, video.duration);
    }
  });

  // Throttled Progress Update & Time Display
  let lastSaveTime = 0;
  video.addEventListener("timeupdate", () => {
    const curr = video.currentTime || 0;
    const dur = video.duration || 0;

    el.timeCurrent.textContent = formatTime(curr);
    el.timeDuration.textContent = formatTime(dur);
    el.noteFormTimestampTag.textContent = formatTime(curr);
    el.quickNoteCurrentTime.textContent = formatTime(curr);

    if (dur > 0) {
      const pct = (curr / dur) * 100;
      el.scrubProgress.style.width = `${pct}%`;
      el.scrubHandle.style.left = `${pct}%`;
    }

    const now = Date.now();
    if (now - lastSaveTime > 4000 && state.currentVideo) {
      lastSaveTime = now;
      saveProgress(state.currentVideo.id, curr, dur);
    }
  });

  video.addEventListener("progress", () => {
    if (video.buffered.length > 0 && video.duration > 0) {
      const loaded = video.buffered.end(video.buffered.length - 1);
      const pct = (loaded / video.duration) * 100;
      el.scrubLoaded.style.width = `${pct}%`;
    }
  });

  // Video Ended -> Autoplay
  video.addEventListener("ended", async () => {
    if (state.currentVideo) {
      await saveProgress(
        state.currentVideo.id,
        video.duration,
        video.duration,
        true,
      );
      el.btnToggleCompleted.classList.add("completed-active");
      el.btnCompletedLabel.textContent = "✓ Concluída";
      showToast("Aula concluída! Parabéns!", "success");
      updateCourseProgressStats();

      if (el.switchAutoPlay.checked) {
        triggerAutoplayNext();
      }
    }
  });

  function triggerAutoplayNext() {
    const allV = getAllCurrentCourseVideos();
    const idx = allV.findIndex((v) => v.id === state.currentVideo.id);
    if (idx !== -1 && idx < allV.length - 1) {
      const nextV = allV[idx + 1];
      el.autoplayNextTitle.textContent = nextV.cleanTitle;
      el.autoplayOverlay.style.display = "flex";
      let remaining = 5;
      el.autoplayCountdown.textContent = remaining;

      state.autoplayTimer = setInterval(() => {
        remaining--;
        el.autoplayCountdown.textContent = remaining;
        if (remaining <= 0) {
          clearInterval(state.autoplayTimer);
          state.autoplayTimer = null;
          el.autoplayOverlay.style.display = "none";
          playVideo(nextV);
        }
      }, 1000);

      el.btnAutoplayNow.onclick = () => {
        clearInterval(state.autoplayTimer);
        state.autoplayTimer = null;
        el.autoplayOverlay.style.display = "none";
        playVideo(nextV);
      };
      el.btnAutoplayCancel.onclick = () => {
        clearInterval(state.autoplayTimer);
        state.autoplayTimer = null;
        el.autoplayOverlay.style.display = "none";
      };
    }
  }

  // Controls
  el.ctrlPlayPause.addEventListener("click", togglePlayPause);
  el.ctrlRewind10.addEventListener("click", () => seekRelative(-10));
  el.ctrlForward10.addEventListener("click", () => seekRelative(10));
  el.btnPrevLesson.addEventListener("click", playPrevLesson);
  el.btnNextLesson.addEventListener("click", playNextLesson);

  // Volume
  el.ctrlVolumeSlider.addEventListener("input", (e) => {
    const vol = parseFloat(e.target.value);
    video.volume = vol;
    video.muted = vol === 0;
    state.settings.volume = vol;
    localStorage.setItem("videohub_vol", vol);
    updateVolumeUI(vol);
  });
  el.ctrlMute.addEventListener("click", () => {
    video.muted = !video.muted;
    updateVolumeUI(video.muted ? 0 : video.volume);
  });
  function updateVolumeUI(vol) {
    const isMuted = video.muted || vol === 0;
    el.ctrlMute.querySelector(".icon-vol-high").style.display = isMuted
      ? "none"
      : "block";
    el.ctrlMute.querySelector(".icon-vol-muted").style.display = isMuted
      ? "block"
      : "none";
  }

  // Scrub Bar Seek
  el.scrubContainer.addEventListener("click", (e) => {
    const rect = el.scrubContainer.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    if (video.duration) {
      video.currentTime = pos * video.duration;
    }
  });

  el.scrubContainer.addEventListener("mousemove", (e) => {
    const rect = el.scrubContainer.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (video.duration) {
      el.scrubHoverTime.style.left = `${pos * 100}%`;
      el.scrubHoverTime.textContent = formatTime(pos * video.duration);
    }
  });

  // Speed Selector
  el.ctrlSpeedBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    el.speedDropdown.parentElement.classList.toggle("open");
  });
  document.addEventListener("click", (e) => {
    if (!el.speedDropdown.parentElement.contains(e.target)) {
      el.speedDropdown.parentElement.classList.remove("open");
    }
  });
  el.speedDropdown.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-speed]");
    if (!btn) return;
    const spd = parseFloat(btn.dataset.speed);
    setPlaybackSpeed(spd);
    el.speedDropdown.parentElement.classList.remove("open");
    showToast(`Velocidade fixada em ${spd}x`, "info");
  });

  // Picture in Picture
  el.ctrlPip.addEventListener("click", async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch (err) {
      showToast("Picture-in-Picture não suportado no navegador", "warning");
    }
  });

  // Fullscreen
  el.ctrlFullscreen.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      el.videoContainer.requestFullscreen().catch((err) => console.log(err));
    } else {
      document.exitFullscreen().catch((err) => console.log(err));
    }
  });

  // Theater Mode Toggle
  el.btnToggleTheater.addEventListener("click", () => {
    state.theaterMode = !state.theaterMode;
    el.playerLayout.classList.toggle("theater-mode", state.theaterMode);
  });

  // Ambient Glow Toggle
  el.btnToggleAmbient.addEventListener("click", () => {
    state.ambientMode = !state.ambientMode;
    el.videoContainer.classList.toggle("ambient-active", state.ambientMode);
    if (state.ambientMode) updateAmbilight();
    updateAmbientButton();
    showToast(
      state.ambientMode ? "Glow ambiente ativado" : "Glow desativado",
      "info",
    );
  });

  // STRICT FIX: Mark Completed Toggle DOES NOT pause, stop, or reset video!
  el.btnToggleCompleted.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!state.currentVideo) return;

    const isCompleted =
      el.btnToggleCompleted.classList.contains("completed-active");
    const nextCompleted = !isCompleted;

    const currentTime = video.currentTime;
    const duration = video.duration || 100;

    // Direct memory update so video playback is completely untouched
    if (!state.progress.videos) state.progress.videos = {};
    state.progress.videos[state.currentVideo.id] = {
      currentTime,
      duration,
      percentage: duration > 0 ? Math.round((currentTime / duration) * 100) : 0,
      completed: nextCompleted,
      lastWatchedAt: new Date().toISOString(),
    };

    // Update UI badge & checkmarks
    el.btnToggleCompleted.classList.toggle("completed-active", nextCompleted);
    el.btnCompletedLabel.textContent = nextCompleted
      ? "✓ Concluída"
      : "Marcar como Concluída";
    showToast(
      nextCompleted ? "Aula concluída!" : "Desmarcada como concluída",
      "success",
    );

    // Update sidebar item without re-rendering player
    const sideItem = document.querySelector(
      `.sidebar-modules-list [data-videoid="${state.currentVideo.id}"] .item-status-check`,
    );
    if (sideItem) {
      sideItem.classList.toggle("completed", nextCompleted);
      sideItem.innerHTML = nextCompleted
        ? `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>`
        : "";
    }

    updateHeaderProgress();
    renderStatsGrid();

    await saveProgress(
      state.currentVideo.id,
      currentTime,
      duration,
      nextCompleted,
    );
    renderPlayerSidebar();
    renderHomeTopics();
  });

  // Favorite Toggle
  el.btnToggleFavorite.addEventListener("click", async () => {
    if (!state.currentVideo) return;
    const isFav = await toggleFavoriteAPI(state.currentVideo.id);
    el.btnToggleFavorite.classList.toggle("active", isFav);
    el.btnFavoriteLabel.textContent = isFav ? "Favoritado" : "Favoritar";
    el.btnToggleFavorite
      .querySelector(".fav-icon")
      .setAttribute("fill", isFav ? "#f59e0b" : "none");
    showToast(
      isFav ? "Adicionado aos favoritos" : "Removido dos favoritos",
      "info",
    );
  });

  // Tabs below Video
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".tab-pane")
        .forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      const targetPane = document.getElementById(btn.dataset.tab);
      if (targetPane) targetPane.classList.add("active");
    });
  });

  // Quick Note Button
  el.btnQuickNoteTimestamp.addEventListener("click", () => {
    el.noteFormTimestampTag.textContent = formatTime(video.currentTime);
    document.querySelector('.tab-btn[data-tab="tabNotes"]').click();
    el.noteInputText.focus();
  });

  async function submitNote() {
    if (!state.currentVideo) return;
    const text = el.noteInputText.value.trim();
    if (!text) {
      showToast("Digite algum texto para a anotação", "warning");
      return;
    }
    const ts = video.currentTime || 0;
    const created = await saveNoteAPI(state.currentVideo.id, ts, text);
    if (created) {
      el.noteInputText.value = "";
      renderLessonNotesList(state.currentVideo.id);
      showToast("Anotação salva com sucesso!", "success");
    }
  }

  el.btnSaveNote.addEventListener("click", submitNote);
  el.noteInputText.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submitNote();
    }
  });

  el.btnExportAllNotes.addEventListener("click", () => {
    window.location.href = "/api/notes/export";
  });

  // Sidebar Search
  el.sidebarSearchInput.addEventListener("input", () => {
    renderPlayerSidebar();
  });
  document.querySelectorAll(".sidebar-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document
        .querySelectorAll(".sidebar-pill")
        .forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      const f = pill.dataset.sidefilter;
      document
        .querySelectorAll(".sidebar-modules-list .lesson-list-item")
        .forEach((item) => {
          const isComp = item.querySelector(".item-status-check.completed");
          if (f === "all") item.style.display = "flex";
          else if (f === "completed")
            item.style.display = isComp ? "flex" : "none";
          else if (f === "unwatched")
            item.style.display = !isComp ? "flex" : "none";
        });
    });
  });

  // Settings Modal
  el.btnSettings.addEventListener("click", () => {
    el.modalSettingsBackdrop.classList.add("open");
  });
  el.btnCloseSettings.addEventListener("click", () => {
    el.modalSettingsBackdrop.classList.remove("open");
  });
  el.btnConfirmCloseSettings.addEventListener("click", () => {
    el.modalSettingsBackdrop.classList.remove("open");
  });

  // Save Directory
  el.btnSaveVideosDir.addEventListener("click", async () => {
    const newDir = el.cfgVideosDir.value.trim();
    if (!newDir) return;
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videosDir: newDir }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("Diretório salvo! Reescaneando...", "success");
        await fetchInitialData();
      }
    } catch (e) {
      showToast("Erro ao salvar diretório", "danger");
    }
  });

  // Save Remote Videos URL
  el.btnSaveRemoteVideosUrl?.addEventListener("click", async () => {
    const remoteUrl = el.cfgRemoteVideosUrl.value.trim();
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remoteVideosUrl: remoteUrl }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("URL remota salva com sucesso!", "success");
        await fetchInitialData();
      }
    } catch (e) {
      showToast("Erro ao salvar URL remota", "danger");
    }
  });

  // Rescan button
  el.btnRescan.addEventListener("click", async () => {
    try {
      el.btnRescan.style.transform = "rotate(180deg)";
      showToast("Reescaneando vídeos e gerando miniaturas...", "info");
      const res = await fetch("/api/rescan", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        state.coursesData = data.data;
        renderAll();
        showToast("Biblioteca atualizada com sucesso!", "success");
      }
    } catch (e) {
      showToast("Erro ao reescanear", "danger");
    } finally {
      setTimeout(() => (el.btnRescan.style.transform = ""), 300);
    }
  });

  // Reset Progress
  el.btnResetProgress.addEventListener("click", async () => {
    if (
      confirm(
        "Atenção: Tem certeza que deseja zerar todo o histórico de aulas assistidas?",
      )
    ) {
      state.progress = { lastVideoId: null, videos: {} };
      await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: "__RESET__" }),
      });
      renderAll();
      showToast("Progresso zerado com sucesso!", "info");
    }
  });

  // Theme Accent
  el.accentColorPicker.addEventListener("click", (e) => {
    const btn = e.target.closest(".accent-swatch");
    if (!btn) return;
    const color = btn.dataset.color;
    saveSettingsAPI({ accentColor: color });
    showToast(`Tema atualizado para ${color}`, "info");
  });

  el.cfgAutoPlayNext.addEventListener("change", (e) => {
    saveSettingsAPI({ autoPlayNext: e.target.checked });
  });

  el.btnShortcuts.addEventListener("click", () => {
    document.querySelector('.tab-btn[data-tab="tabShortcuts"]').click();
    switchView("viewPlayer");
    showToast("Visualizando atalhos de teclado", "info");
  });

  // Global Keyboard Shortcuts
  window.addEventListener("keydown", (e) => {
    if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      if (e.key === "Escape") document.activeElement.blur();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      el.globalSearchInput.focus();
      return;
    }

    if (e.key === " " || e.key.toLowerCase() === "k") {
      e.preventDefault();
      togglePlayPause();
    } else if (e.key === "ArrowLeft" || e.key.toLowerCase() === "j") {
      e.preventDefault();
      seekRelative(-10);
    } else if (e.key === "ArrowRight" || e.key.toLowerCase() === "l") {
      e.preventDefault();
      seekRelative(10);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      video.volume = Math.min(1, video.volume + 0.05);
      el.ctrlVolumeSlider.value = video.volume;
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      video.volume = Math.max(0, video.volume - 0.05);
      el.ctrlVolumeSlider.value = video.volume;
    } else if (e.key.toLowerCase() === "m") {
      video.muted = !video.muted;
      updateVolumeUI(video.muted ? 0 : video.volume);
    } else if (e.key.toLowerCase() === "f") {
      el.ctrlFullscreen.click();
    } else if (e.key.toLowerCase() === "p") {
      el.ctrlPip.click();
    } else if (e.key.toLowerCase() === "t") {
      el.btnToggleTheater.click();
    } else if (e.key.toLowerCase() === "n") {
      playNextLesson();
    } else if (e.key.toLowerCase() === "b") {
      playPrevLesson();
    } else if (e.key.toLowerCase() === "c") {
      el.btnToggleCompleted.click();
    } else if (e.key >= "0" && e.key <= "9") {
      if (video.duration) {
        video.currentTime = (parseInt(e.key, 10) / 10) * video.duration;
      }
    }
  });
}
