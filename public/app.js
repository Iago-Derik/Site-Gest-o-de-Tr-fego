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

// Rede de segurança: se a sessão só ficar disponível um instante depois do
// carregamento inicial (ex.: troca do código OAuth ainda em andamento),
// reavalia o acesso assim que o Supabase sinalizar a mudança.
let lastAuthCheckUserId = null;
supabaseClient.auth.onAuthStateChange((event, session) => {
  const userId = session?.user?.id || null;
  if (event === "SIGNED_OUT") {
    lastAuthCheckUserId = null;
    return;
  }
  if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && userId !== lastAuthCheckUserId) {
    lastAuthCheckUserId = userId;
    checkAuth();
  }
});

// Lógica de Autenticação
function showScreen(screenEl) {
  ["authScreen", "accessDeniedScreen"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = el === screenEl ? "flex" : "none";
  });
}

function showAuthError(message) {
  const el = document.getElementById("authErrorMessage");
  if (!el) return;
  if (!message) {
    el.style.display = "none";
    el.textContent = "";
    return;
  }
  el.textContent = message;
  el.style.display = "block";
}

function consumeOAuthErrorFromUrl() {
  const hashParams = new URLSearchParams(
    window.location.hash ? window.location.hash.slice(1) : "",
  );
  const searchParams = new URLSearchParams(window.location.search);
  const error =
    hashParams.get("error_description") ||
    hashParams.get("error") ||
    searchParams.get("error_description") ||
    searchParams.get("error");

  if (error) {
    console.error("Falha no login com Google:", error);
    window.history.replaceState(
      {},
      document.title,
      window.location.pathname,
    );
  }
  return error;
}

async function checkAuth() {
  const authScreen = document.getElementById("authScreen");
  const deniedScreen = document.getElementById("accessDeniedScreen");
  const oauthError = consumeOAuthErrorFromUrl();
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (!session) {
    showAuthError(
      oauthError
        ? "Não foi possível concluir o login com o Google. Tente novamente."
        : null,
    );
    showScreen(authScreen);
    return;
  }

  showAuthError(null);

  try {
    const meRes = await fetch("/api/me");
    const me = await meRes.json();
    if (!me.allowed) {
      const emailLabel = document.getElementById("deniedEmailLabel");
      if (emailLabel) emailLabel.textContent = me.email || session.user?.email || "";
      showScreen(deniedScreen);
      return;
    }
  } catch (err) {
    console.error("Não foi possível verificar a permissão de acesso:", err);
    showScreen(deniedScreen);
    return;
  }

  authScreen.style.display = "none";
  deniedScreen.style.display = "none";
  state.currentUserEmail = session.user?.email || "";
  setupAccountMenu(session.user);
  showPageLoading();
  fetchInitialData(); // Só carrega os dados DEPOIS de logado e autorizado
}

function showPageLoading() {
  const overlay = document.getElementById("pageLoadingOverlay");
  if (!overlay) return;
  overlay.style.display = "flex";
  overlay.classList.remove("fade-out");
}

function hidePageLoading() {
  const overlay = document.getElementById("pageLoadingOverlay");
  if (!overlay) return;
  overlay.classList.add("fade-out");
  setTimeout(() => {
    overlay.style.display = "none";
  }, 400);
}

function setupAccountMenu(user) {
  const email = user?.email || "";
  const initial = email.charAt(0).toUpperCase() || "?";
  const emailLabel = document.getElementById("accountMenuEmail");
  const avatar = document.getElementById("accountAvatarInitial");
  const triggerEmail = document.getElementById("accountTriggerEmail");
  if (emailLabel) emailLabel.textContent = email;
  if (avatar) avatar.textContent = initial;
  if (triggerEmail) triggerEmail.textContent = email.split("@")[0] || "Minha conta";
  if (el.cfgAccountEmail) el.cfgAccountEmail.textContent = email;
  if (el.cfgAccountAvatar) el.cfgAccountAvatar.textContent = initial;
}

async function handleSignOut() {
  await supabaseClient.auth.signOut();
  window.location.reload();
}

async function handleSwitchAccount() {
  await supabaseClient.auth.signOut();
  await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
      queryParams: { prompt: "select_account" },
    },
  });
}

document.getElementById("btnLoginGoogle").addEventListener("click", async () => {
  await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
      queryParams: { prompt: "select_account" },
    },
  });
});

document.getElementById("btnDeniedSignOut")?.addEventListener("click", handleSwitchAccount);

document.addEventListener("DOMContentLoaded", () => {
  initEventListeners();
  checkAuth();

  const accountBtn = document.getElementById("btnAccountMenu");
  const accountMenu = document.getElementById("accountMenuDropdown");
  const accountWrapper = accountBtn?.closest(".account-menu-wrapper");
  accountBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = accountMenu.classList.toggle("open");
    accountWrapper?.classList.toggle("open", isOpen);
  });
  document.addEventListener("click", (event) => {
    if (
      accountMenu &&
      !accountMenu.contains(event.target) &&
      !accountBtn?.contains(event.target)
    ) {
      accountMenu.classList.remove("open");
      accountWrapper?.classList.remove("open");
    }
  });
  document.getElementById("btnSwitchAccount")?.addEventListener("click", handleSwitchAccount);
  document.getElementById("btnSignOut")?.addEventListener("click", handleSignOut);

  // Sidebar: hambúrguer (mobile) abre um drawer; X e clique no fundo fecham.
  const sidebar = document.getElementById("appSidebar");
  const sidebarBackdrop = document.getElementById("sidebarBackdrop");
  const openSidebar = () => {
    sidebar?.classList.add("open");
    sidebarBackdrop?.classList.add("open");
    document.body.classList.add("sidebar-drawer-open");
  };
  const closeSidebar = () => {
    sidebar?.classList.remove("open");
    sidebarBackdrop?.classList.remove("open");
    document.body.classList.remove("sidebar-drawer-open");
  };
  document.getElementById("btnToggleSidebar")?.addEventListener("click", openSidebar);
  document.getElementById("btnCloseSidebar")?.addEventListener("click", closeSidebar);
  sidebarBackdrop?.addEventListener("click", closeSidebar);
  sidebar?.querySelectorAll(".sidebar-nav-item").forEach((item) => {
    item.addEventListener("click", closeSidebar);
  });

  // Recolher o menu lateral (desktop) — mais espaço de tela pra assistir aula,
  // sem precisar de tela cheia. Preferência persistida junto das configurações.
  document.getElementById("btnCollapseMainSidebar")?.addEventListener("click", async () => {
    state.settings.navCollapsed = !state.settings.navCollapsed;
    applyMainSidebarCollapsed(state.settings.navCollapsed);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ navCollapsed: state.settings.navCollapsed }),
      });
    } catch (e) {
      console.warn("Não foi possível salvar a preferência do menu lateral:", e);
    }
  });
});
// ---------------------------------

// Application Global State
const state = {
  coursesData: null,
  currentCourse: null,
  currentUserEmail: null,
  favoritesSection: "lessons",
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
  workKpiClientIds: null, // null = todos os clientes; array = seleção específica
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
  btnMobileSearch: document.getElementById("btnMobileSearch"),
  commandPaletteBackdrop: document.getElementById("commandPaletteBackdrop"),
  commandPaletteInput: document.getElementById("commandPaletteInput"),
  commandPaletteResults: document.getElementById("commandPaletteResults"),
  headerCourseProgress: document.getElementById("headerCourseProgress"),
  headerProgressPercent: document.getElementById("headerProgressPercent"),
  headerProgressBar: document.getElementById("headerProgressBar"),
  headerProgressCount: document.getElementById("headerProgressCount"),
  navBtnHome: document.getElementById("navBtnHome"),
  navBtnCourses: document.getElementById("navBtnCourses"),
  navBtnNotes: document.getElementById("navBtnNotes"),
  navBtnFavorites: document.getElementById("navBtnFavorites"),
  navBtnHistory: document.getElementById("navBtnHistory"),
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
  viewHistory: document.getElementById("viewHistory"),
  historyList: document.getElementById("historyList"),
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

  homeGreetingText: document.getElementById("homeGreetingText"),
  statHoursStudied: document.getElementById("statHoursStudied"),
  statCompletedVideos: document.getElementById("statCompletedVideos"),
  statCoursesInProgress: document.getElementById("statCoursesInProgress"),
  statStreak: document.getElementById("statStreak"),
  myCoursesGrid: document.getElementById("myCoursesGrid"),
  homeRecentRail: document.getElementById("homeRecentRail"),
  shelfHomeFavorites: document.getElementById("shelfHomeFavorites"),
  homeFavoritesRail: document.getElementById("homeFavoritesRail"),

  homeFilterTabs: document.getElementById("homeFilterTabs"),
  homeVideosGrid: document.getElementById("homeVideosGrid"),
  homeShelfTitle: document.getElementById("homeShelfTitle"),
  inProgressCountBadge: document.getElementById("inProgressCountBadge"),
  curriculumTrackContainer: document.getElementById("curriculumTrackContainer"),
  homeTopicsList: document.getElementById("homeTopicsList"),
  btnExpandAllModules: document.getElementById("btnExpandAllModules"),
  btnCollapseAllModules: document.getElementById("btnCollapseAllModules"),

  // Course Detail View
  courseDetailHeader: document.getElementById("courseDetailHeader"),
  courseDetailThumbImg: document.getElementById("courseDetailThumbImg"),
  courseDetailTitle: document.getElementById("courseDetailTitle"),
  courseDetailDesc: document.getElementById("courseDetailDesc"),
  courseDetailProgressFill: document.getElementById("courseDetailProgressFill"),
  courseDetailProgressLabel: document.getElementById("courseDetailProgressLabel"),
  btnCourseDetailContinue: document.getElementById("btnCourseDetailContinue"),
  courseDetailModulesContainer: document.getElementById("courseDetailModulesContainer"),

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
  playerLayout: document.getElementById("playerLayout"),
  playerSidebar: document.getElementById("playerSidebar"),
  sidebarProgressText: document.getElementById("sidebarProgressText"),
  btnCollapseSidebar: document.getElementById("btnCollapseSidebar"),
  sidebarSearchInput: document.getElementById("sidebarSearchInput"),
  sidebarModulesList: document.getElementById("sidebarModulesList"),

  // All Notes & Favorites Views
  globalNotesContainer: document.getElementById("globalNotesContainer"),
  notesSearchInput: document.getElementById("notesSearchInput"),
  btnExportAllNotes: document.getElementById("btnExportAllNotes"),
  favoritesVideosGrid: document.getElementById("favoritesVideosGrid"),
  favoritesTabs: document.getElementById("favoritesTabs"),
  favoritesByCourseContainer: document.getElementById("favoritesByCourseContainer"),
  favoritesNotesList: document.getElementById("favoritesNotesList"),

  // Professional workspace
  workClientList: document.getElementById("workClientList"),
  workClientSearch: document.getElementById("workClientSearch"),
  workDetailPanel: document.getElementById("workDetailPanel"),
  workClientCount: document.getElementById("workClientCount"),
  workKpiClients: document.getElementById("workKpiClients"),
  workKpiDocuments: document.getElementById("workKpiDocuments"),
  workKpiFilter: document.getElementById("workKpiFilter"),
  workKpiFilterBtn: document.getElementById("workKpiFilterBtn"),
  workKpiFilterLabel: document.getElementById("workKpiFilterLabel"),
  workKpiFilterDropdown: document.getElementById("workKpiFilterDropdown"),
  workKpiFilterAll: document.getElementById("workKpiFilterAll"),
  workKpiFilterClientList: document.getElementById("workKpiFilterClientList"),
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
  metaImportPanel: document.getElementById("metaImportPanel"),
  metaConnectionStatus: document.getElementById("metaConnectionStatus"),
  metaAccountId: document.getElementById("metaAccountId"),
  metaQueryLevel: document.getElementById("metaQueryLevel"),
  metaDatePreset: document.getElementById("metaDatePreset"),
  btnImportMeta: document.getElementById("btnImportMeta"),
  metaImportStatus: document.getElementById("metaImportStatus"),
  gaPropertyId: document.getElementById("gaPropertyId"),
  gaDatePreset: document.getElementById("gaDatePreset"),
  gaGroupBy: document.getElementById("gaGroupBy"),
  btnImportGa: document.getElementById("btnImportGa"),
  gaImportStatus: document.getElementById("gaImportStatus"),
  metaMetricPicker: document.getElementById("metaMetricPicker"),
  gaMetricPicker: document.getElementById("gaMetricPicker"),
  metaChartType: document.getElementById("metaChartType"),
  gaChartType: document.getElementById("gaChartType"),
  lookerStudioUrl: document.getElementById("lookerStudioUrl"),
  btnSaveLookerUrl: document.getElementById("btnSaveLookerUrl"),
  lookerEmbedContainer: document.getElementById("lookerEmbedContainer"),

  // Modals & Toasts
  modalSettingsBackdrop: document.getElementById("modalSettingsBackdrop"),
  btnCloseSettings: document.getElementById("btnCloseSettings"),
  btnConfirmCloseSettings: document.getElementById("btnConfirmCloseSettings"),
  cfgAccountAvatar: document.getElementById("cfgAccountAvatar"),
  cfgAccountEmail: document.getElementById("cfgAccountEmail"),
  btnCfgSwitchAccount: document.getElementById("btnCfgSwitchAccount"),
  btnCfgSignOut: document.getElementById("btnCfgSignOut"),
  cfgMetaConnectionStatus: document.getElementById("cfgMetaConnectionStatus"),
  accentColorPicker: document.getElementById("accentColorPicker"),
  cfgAutoPlayNext: document.getElementById("cfgAutoPlayNext"),
  btnResetProgress: document.getElementById("btnResetProgress"),
  toastContainer: document.getElementById("toastContainer"),
};

// Vídeos são servidos direto do R2 (outra origem). Sem crossOrigin, o
// navegador marca o <video> como "tainted" e bloqueia a leitura do canvas
// (toDataURL), o que fazia a captura automática da thumbnail falhar
// silenciosamente e a aula ficar sempre com o fundo azul de fallback.
if (el.mainVideoPlayer) el.mainVideoPlayer.crossOrigin = "anonymous";

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

// Envia o frame capturado (canvas) para o servidor salvar como thumbnail
// no R2 e atualiza qualquer <img> visível na tela na hora, sem esperar reload.
async function uploadCapturedThumb(videoId, thumbUrl, canvas) {
  const response = await fetch("/api/thumbnail/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      videoId,
      imageBase64: canvas.toDataURL("image/jpeg", 0.82),
    }),
  });
  if (!response.ok) throw new Error("Falha ao salvar thumbnail");

  const cacheBust = `?frame=${Date.now()}`;
  document.querySelectorAll(`img[src^="${thumbUrl}"]`).forEach((image) => {
    image.src = `${thumbUrl}${cacheBust}`;
  });
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
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

  try {
    await uploadCapturedThumb(currentVideo.id, currentVideo.thumbUrl, canvas);
  } catch (err) {
    state.generatedThumbIds.delete(currentVideo.id);
    console.warn("Não foi possível salvar o primeiro frame:", err);
  }
}

// --------------------------------------------------------------------------
// AUTOMATIC BACKGROUND THUMBNAIL GENERATION
// --------------------------------------------------------------------------
// Gera a thumbnail (primeiro frame real do vídeo) automaticamente para os
// vídeos que ainda não têm uma salva no R2, sem depender do usuário abrir
// cada aula manualmente. Processa um vídeo por vez, usando um <video> oculto,
// para não competir por banda com o vídeo que o usuário estiver assistindo.
let autoThumbQueueRunning = false;

function createHiddenVideoEl() {
  const hidden = document.createElement("video");
  hidden.crossOrigin = "anonymous";
  hidden.muted = true;
  hidden.playsInline = true;
  hidden.preload = "auto";
  hidden.style.cssText =
    "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;";
  return hidden;
}

function generateThumbInBackground(video) {
  return new Promise((resolve) => {
    const hidden = createHiddenVideoEl();
    let settled = false;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      hidden.pause();
      hidden.removeAttribute("src");
      hidden.load();
      hidden.remove();
      resolve();
    };
    // Não deixa a fila travada caso um vídeo específico nunca carregue.
    const timeout = setTimeout(cleanup, 15000);

    const capture = () => {
      if (settled) return;
      try {
        if (!hidden.videoWidth) return cleanup();
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 360;
        canvas
          .getContext("2d")
          .drawImage(hidden, 0, 0, canvas.width, canvas.height);
        uploadCapturedThumb(video.id, video.thumbUrl, canvas).catch((err) => {
          state.generatedThumbIds.delete(video.id);
          console.warn("Thumbnail automática falhou:", video.id, err);
        });
      } catch (err) {
        state.generatedThumbIds.delete(video.id);
        console.warn("Thumbnail automática falhou:", video.id, err);
      } finally {
        cleanup();
      }
    };

    hidden.addEventListener(
      "loadeddata",
      () => {
        // Um pequeno seek evita pegar um frame preto/vazio logo no tempo 0
        // em alguns codecs, mantendo o espírito de "primeiro frame".
        if (hidden.duration > 0.5) {
          hidden.currentTime = Math.min(0.5, hidden.duration / 4);
          hidden.addEventListener("seeked", capture, { once: true });
        } else {
          capture();
        }
      },
      { once: true },
    );
    hidden.addEventListener("error", cleanup, { once: true });

    document.body.appendChild(hidden);
    hidden.src = video.videoUrl;
  });
}

async function runAutoThumbnailQueue(videos) {
  if (autoThumbQueueRunning) return;
  autoThumbQueueRunning = true;
  try {
    for (const video of videos) {
      if (state.generatedThumbIds.has(video.id)) continue;
      state.generatedThumbIds.add(video.id);
      await generateThumbInBackground(video);
      // Pequena pausa entre vídeos para não pesar na conexão do usuário.
      await new Promise((r) => setTimeout(r, 400));
    }
  } finally {
    autoThumbQueueRunning = false;
  }
}

function scheduleAutoThumbnails() {
  const courses = state.coursesData?.courses || [];
  const pending = [];
  courses.forEach((course) => {
    (course.modules || []).forEach((mod) => {
      (mod.videos || []).forEach((v) => {
        if (v.hasThumb) {
          state.generatedThumbIds.add(v.id);
        } else if (!state.generatedThumbIds.has(v.id)) {
          pending.push(v);
        }
      });
    });
  });
  if (pending.length) runAutoThumbnailQueue(pending);
}

// Visual feedback on screen when clicking video to play/pause
function showActionFeedback(isPlay) {
  const iconSvg = isPlay
    ? `<svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`
    : `<svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;

  el.videoActionFeedback.classList.remove("feedback-left", "feedback-right");
  el.feedbackIcon.innerHTML = iconSvg;
  el.videoActionFeedback.classList.add("show");
  clearTimeout(el.feedbackTimeout);
  el.feedbackTimeout = setTimeout(() => {
    el.videoActionFeedback.classList.remove("show");
  }, 400);
}

// Avança/volta 10s ao dar duplo clique/toque nas laterais do vídeo (estilo
// YouTube). Toques repetidos do mesmo lado dentro de uma janela curta
// acumulam o valor mostrado no feedback (ex.: 10s, depois 20s, 30s...),
// mas cada duplo toque sempre desloca exatamente 10s de verdade.
let seekStreak = { side: null, total: 0, timer: null };
function seekRelative(deltaSeconds, side) {
  const video = el.mainVideoPlayer;
  if (!video.duration) return;
  video.currentTime = Math.min(
    Math.max(0, video.currentTime + deltaSeconds),
    video.duration,
  );
  seekStreak.total =
    seekStreak.side === side ? seekStreak.total + Math.abs(deltaSeconds) : Math.abs(deltaSeconds);
  seekStreak.side = side;
  clearTimeout(seekStreak.timer);
  seekStreak.timer = setTimeout(() => {
    seekStreak = { side: null, total: 0, timer: null };
  }, 700);
  showSeekFeedback(side, seekStreak.total);
  showPlayerControls();
}

// Controles (barra de progresso + botões) do player somem sozinhos depois
// de um tempo curto sem interação, igual a maioria dos players de vídeo.
// Em mouse o :hover do CSS já cobre isso; esta função é o que garante o
// mesmo comportamento em touch (onde não existe :hover confiável) e também
// reaparece os controles a cada toque/clique.
let controlsHideTimer = null;
function showPlayerControls() {
  el.videoContainer.classList.add("controls-visible");
  clearTimeout(controlsHideTimer);
  if (!el.mainVideoPlayer.paused) {
    controlsHideTimer = setTimeout(() => {
      el.videoContainer.classList.remove("controls-visible");
    }, 3000);
  }
}

function showSeekFeedback(side, amountSeconds) {
  const isLeft = side === "left";
  const arrowSvg = isLeft
    ? `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 17 6 12 11 7"></polyline><polyline points="18 17 13 12 18 7"></polyline></svg>`
    : `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline></svg>`;

  el.videoActionFeedback.classList.remove("feedback-left", "feedback-right");
  el.videoActionFeedback.classList.add(isLeft ? "feedback-left" : "feedback-right");
  el.feedbackIcon.innerHTML = `${arrowSvg}<span class="feedback-seek-label">${amountSeconds}s</span>`;
  el.videoActionFeedback.classList.add("show");
  clearTimeout(el.feedbackTimeout);
  el.feedbackTimeout = setTimeout(() => {
    el.videoActionFeedback.classList.remove("show");
  }, 500);
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
    state.workspace = (workspaceRes && workspaceRes.clients) ? workspaceRes : {
      clients: [],
      campaigns: [],
      documents: [],
      reports: [],
    };
    state.workspace.reports = state.workspace.reports || [];

    // Restore saved speed
    const savedSpeed = localStorage.getItem("videohub_speed");
    if (savedSpeed) state.settings.playbackSpeed = parseFloat(savedSpeed);

    applySettings(state.settings);

    // Initial course selection
    if (state.coursesData.courses && state.coursesData.courses.length > 0) {
      state.currentCourse = state.coursesData.courses[0];
    }

    renderAll();

    // Espera a tela terminar de renderizar antes de começar a gerar
    // thumbnails em segundo plano, para não competir com o carregamento inicial.
    setTimeout(scheduleAutoThumbnails, 1500);

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
  } finally {
    hidePageLoading();
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

async function updateNoteAPI(noteId, text) {
  try {
    const res = await fetch(`/api/notes/${noteId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const updated = await res.json();
    const index = state.notes.findIndex((n) => n.id === noteId);
    if (index >= 0) state.notes[index] = updated;
    return updated;
  } catch (err) {
    console.error("Erro ao editar nota:", err);
    return null;
  }
}

// Liga os botões de editar/excluir de um card de anotação (usado tanto na
// lista da aula atual quanto na aba "Anotações"). onChange roda depois de
// salvar/excluir, pra cada tela re-renderizar do seu jeito.
function attachNoteItemActions(noteEl, note, onChange) {
  const editBtn = noteEl.querySelector(".edit-btn");
  const deleteBtn = noteEl.querySelector(".delete-btn");
  const textEl = noteEl.querySelector(".note-text-content");

  editBtn.onclick = () => {
    if (noteEl.querySelector(".note-edit-form")) return;
    const form = document.createElement("div");
    form.className = "note-edit-form";
    form.innerHTML = `
      <textarea class="note-edit-textarea" rows="2">${note.text}</textarea>
      <div class="note-edit-actions">
        <button type="button" class="btn btn-ghost btn-sm note-edit-cancel">Cancelar</button>
        <button type="button" class="btn btn-primary btn-sm note-edit-save">Salvar</button>
      </div>
    `;
    textEl.replaceWith(form);
    const textarea = form.querySelector("textarea");
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    form.querySelector(".note-edit-cancel").onclick = () => form.replaceWith(textEl);
    form.querySelector(".note-edit-save").onclick = async () => {
      const newText = textarea.value.trim();
      if (!newText) {
        showToast("A anotação não pode ficar vazia", "warning");
        return;
      }
      const updated = await updateNoteAPI(note.id, newText);
      if (updated) {
        showToast("Anotação atualizada", "success");
        onChange();
      } else {
        showToast("Não foi possível salvar a anotação", "danger");
      }
    };
  };

  deleteBtn.onclick = async () => {
    if (confirm("Deseja excluir esta anotação?")) {
      await deleteNoteAPI(note.id);
      showToast("Anotação excluída", "info");
      onChange();
    }
  };
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
  applySidebarCollapsed(Boolean(s.sidebarCollapsed));
  applyMainSidebarCollapsed(Boolean(s.navCollapsed));
}

function applySidebarCollapsed(collapsed) {
  el.playerSidebar?.classList.toggle("collapsed", collapsed);
  el.playerLayout?.classList.toggle("sidebar-collapsed", collapsed);
}

function applyMainSidebarCollapsed(collapsed) {
  document.getElementById("appSidebar")?.classList.toggle("collapsed", collapsed);
}

// --------------------------------------------------------------------------
// RENDERING
// --------------------------------------------------------------------------

function renderAll() {
  renderCourseDropdown();
  updateHeaderProgress();
  renderHomeGreeting();
  renderHomeHero();
  renderStatsGrid();
  renderMyCoursesGrid();
  renderHomeRecentRail();
  renderHomeFavoritesRail();
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

async function deleteWorkspaceRecord(type, id) {
  const response = await fetch(`/api/workspace/${type}/${id}`, { method: "DELETE" });
  const result = await response.json();
  if (!response.ok || !result.success)
    throw new Error(result.error || "Falha ao excluir registro");
  state.workspace = result.workspace;
  return result.workspace;
}

function selectedWorkClient() {
  const clients = state.workspace.clients || [];
  const found = clients.find((client) => client.id === state.currentClientId);
  if (found) return found;
  if (clients.length) {
    state.currentClientId = clients[0].id;
    return clients[0];
  }
  return null;
}

// Clientes atualmente incluídos no resumo de KPIs (respeitando a seleção do
// filtro "Mostrando dados de:"). null/vazio/todos selecionados = todos.
function activeKpiClients() {
  const clients = state.workspace.clients || [];
  const selected = state.workKpiClientIds;
  if (selected === null || selected === undefined) return clients;
  const selectedSet = new Set(selected);
  return clients.filter((client) => selectedSet.has(client.id));
}

function renderWorkKpis() {
  const clients = state.workspace.clients || [];
  const activeClients = activeKpiClients();
  const activeIds = new Set(activeClients.map((client) => client.id));
  const documents = (state.workspace.documents || []).filter((doc) =>
    activeIds.has(doc.clientId),
  );

  el.workKpiClients.textContent = activeClients.length;
  el.workKpiDocuments.textContent = documents.length;

  const isAll = activeClients.length === clients.length;
  if (el.workKpiFilterLabel) {
    el.workKpiFilterLabel.textContent = isAll
      ? "Todos os clientes"
      : activeClients.length === 0
        ? "Nenhum cliente selecionado"
        : activeClients.length === 1
          ? activeClients[0].name
          : `${activeClients.length} clientes selecionados`;
  }
  if (el.workKpiFilterAll) {
    el.workKpiFilterAll.checked = isAll;
  }
  if (el.workKpiFilterClientList) {
    el.workKpiFilterClientList.innerHTML = clients
      .map(
        (client) =>
          `<label class="work-kpi-filter-option"><input type="checkbox" data-kpi-client-id="${escapeHTML(client.id)}" ${activeIds.has(client.id) ? "checked" : ""}><span>${escapeHTML(client.name)}</span></label>`,
      )
      .join("");
    el.workKpiFilterClientList
      .querySelectorAll("[data-kpi-client-id]")
      .forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
          const allBoxes = Array.from(
            el.workKpiFilterClientList.querySelectorAll(
              "[data-kpi-client-id]",
            ),
          );
          const checkedIds = allBoxes
            .filter((box) => box.checked)
            .map((box) => box.dataset.kpiClientId);
          state.workKpiClientIds =
            checkedIds.length === allBoxes.length ? null : checkedIds;
          renderWorkKpis();
        });
      });
  }
}

function renderWorkView() {
  renderWorkKpis();
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
  selectedWorkClient(); // garante que currentClientId aponte para um cliente existente antes de pintar a lista
  const query = (el.workClientSearch?.value || "").toLowerCase().trim();
  const visibleClients = clients.filter((client) =>
    `${client.name} ${client.business} ${client.city}`
      .toLowerCase()
      .includes(query),
  );
  const documents = state.workspace.documents || [];

  el.workClientCount.textContent = clients.length;
  el.workClientList.innerHTML = "";

  if (!visibleClients.length) {
    el.workClientList.innerHTML = `<div class="work-list-empty">Nenhum cliente cadastrado.</div>`;
  }
  visibleClients.forEach((client) => {
    const documentsCount = documents.filter(
      (item) => item.clientId === client.id,
    ).length;
    const item = document.createElement("button");
    item.className = `work-client-item ${client.id === state.currentClientId ? "active" : ""}`;
    item.innerHTML = `<span class="work-client-avatar">${escapeHTML((client.name || "?").slice(0, 1).toUpperCase())}</span><span class="work-client-copy"><strong>${escapeHTML(client.name)}</strong><small>${escapeHTML(client.business || "Negócio ainda não descrito")}</small></span><em title="Documentos">${documentsCount}</em>`;
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
          const sizeLabel = doc.fileSize
            ? `<small>${(doc.fileSize / 1024 / 1024).toFixed(1)}MB</small>`
            : "";
          const action = doc.storageKey
            ? `<button class="btn btn-ghost btn-sm" data-download-doc="${escapeHTML(doc.id)}">Baixar</button>`
            : `<a class="btn btn-ghost btn-sm" href="${escapeHTML(doc.url || "#")}" target="_blank" rel="noreferrer">Abrir</a>`;
          return `<article class="work-document-card"><div class="document-card-icon">DOC</div><div><span class="eyebrow-label">${escapeHTML(doc.kind || "MATERIAL")}</span><h3>${escapeHTML(doc.name)}</h3><p>Cliente: <strong>${escapeHTML(client?.name || "Não associado")}</strong></p><small>${escapeHTML(doc.status || "Rascunho")}</small>${sizeLabel}</div><div class="work-document-actions">${action}<button class="icon-btn-ghost danger" data-delete-doc="${escapeHTML(doc.id)}" title="Excluir documento"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button></div></article>`;
        })
        .join("")
    : `<div class="work-empty-state compact"><span class="work-empty-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg></span><h2>Nenhum documento encontrado</h2><p>Adicione uma proposta, briefing, apresentação ou relatório e associe-o a um cliente.</p></div>`;
  el.workDocumentsGrid.querySelectorAll("[data-download-doc]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const doc = docs.find((item) => item.id === btn.dataset.downloadDoc);
      if (doc) downloadDocument(doc);
    });
  });
  el.workDocumentsGrid.querySelectorAll("[data-delete-doc]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const doc = docs.find((item) => item.id === btn.dataset.deleteDoc);
      if (!doc || !confirm(`Excluir o documento "${doc.name}"?`)) return;
      try {
        await deleteWorkspaceRecord("document", doc.id);
        showToast("Documento excluído", "info");
        renderWorkDocuments();
      } catch (error) {
        showToast(error.message, "danger");
      }
    });
  });
}

async function downloadDocument(doc) {
  try {
    const response = await fetch(`/api/documents/download?id=${encodeURIComponent(doc.id)}`);
    if (!response.ok) throw new Error("Não foi possível baixar o arquivo");
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = doc.fileName || doc.name;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (err) {
    showToast(err.message, "danger");
  }
}

// --------------------------------------------------------------------------
// DASHBOARD BUILDER - seleção de métricas e gráficos (Meta Ads / GA4)
// --------------------------------------------------------------------------
const META_METRIC_OPTIONS = [
  { key: "impressions", label: "Impressões", default: true },
  { key: "reach", label: "Alcance", default: false },
  { key: "clicks", label: "Cliques", default: true },
  { key: "unique_clicks", label: "Cliques únicos", default: false },
  { key: "spend", label: "Investimento", default: true },
  { key: "cpm", label: "CPM", default: false },
  { key: "cpc", label: "CPC", default: false },
  { key: "ctr", label: "CTR", default: false },
  { key: "frequency", label: "Frequência", default: false },
];

const GA4_METRIC_OPTIONS = [
  { key: "sessions", label: "Sessões", default: true },
  { key: "totalUsers", label: "Usuários totais", default: true },
  { key: "newUsers", label: "Novos usuários", default: false },
  { key: "conversions", label: "Conversões", default: true },
  { key: "screenPageViews", label: "Visualizações de página", default: false },
  { key: "engagementRate", label: "Taxa de engajamento", default: false },
  { key: "bounceRate", label: "Taxa de rejeição", default: false },
  { key: "eventCount", label: "Eventos", default: false },
];

function renderMetricPicker(container, options, storageKey) {
  if (!container) return;
  if (!state.selectedMetrics) state.selectedMetrics = {};
  if (!state.selectedMetrics[storageKey]) {
    state.selectedMetrics[storageKey] = options.filter((o) => o.default).map((o) => o.key);
  }
  const selected = state.selectedMetrics[storageKey];
  container.innerHTML =
    `<span class="metric-picker-label">Métricas do gráfico</span>` +
    options
      .map(
        (opt) =>
          `<label class="metric-picker-item"><input type="checkbox" value="${opt.key}" ${selected.includes(opt.key) ? "checked" : ""}><span>${escapeHTML(opt.label)}</span></label>`,
      )
      .join("");
  container.querySelectorAll('input[type="checkbox"]').forEach((box) => {
    box.addEventListener("change", () => {
      const current = new Set(state.selectedMetrics[storageKey]);
      if (box.checked) current.add(box.value);
      else current.delete(box.value);
      state.selectedMetrics[storageKey] = Array.from(current);
    });
  });
}

function renderMetricPickers() {
  renderMetricPicker(el.metaMetricPicker, META_METRIC_OPTIONS, "meta");
  renderMetricPicker(el.gaMetricPicker, GA4_METRIC_OPTIONS, "ga4");
}

function getSelectedMetrics(storageKey, fallback) {
  return state.selectedMetrics?.[storageKey]?.length
    ? state.selectedMetrics[storageKey]
    : fallback;
}

const CHART_PALETTE = ["#6366f1", "#06b6d4", "#10b981", "#f59e0b", "#f43f5e", "#a855f7"];
const chartInstances = {};

// Nível "ad"/"adset" também trazem campaign_name junto (contexto), então
// nunca dá pra simplesmente checar "existe campaign_name?" — tem que
// respeitar o nível escolhido e só cair pro nível acima se o mais
// específico vier vazio.
function getMetaNameFieldOrder(level) {
  if (level === "ad") return ["ad_name", "adset_name", "campaign_name"];
  if (level === "adset") return ["adset_name", "campaign_name"];
  if (level === "campaign") return ["campaign_name"];
  return [];
}

function truncateChartLabel(str, maxLen = 22) {
  const s = String(str ?? "—");
  return s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
}

function renderMetricsChart(canvasId, rows, xKey, metricKeys, chartType, labelMap) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return;
  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
    delete chartInstances[canvasId];
  }
  if (!rows.length || !metricKeys.length) return;
  const fullLabels = rows.map((r) => String(r[xKey] ?? "—"));
  const labels = fullLabels.map((l) => truncateChartLabel(l));
  const isCircular = chartType === "pie" || chartType === "doughnut";
  const datasets = isCircular
    ? [
        {
          label: labelMap[metricKeys[0]] || metricKeys[0],
          data: rows.map((r) => Number(r[metricKeys[0]] || 0)),
          backgroundColor: labels.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]),
        },
      ]
    : metricKeys.map((key, i) => ({
        label: labelMap[key] || key,
        data: rows.map((r) => Number(r[key] || 0)),
        backgroundColor: chartType === "line" ? "transparent" : `${CHART_PALETTE[i % CHART_PALETTE.length]}cc`,
        borderColor: CHART_PALETTE[i % CHART_PALETTE.length],
        borderWidth: 2,
        tension: 0.35,
        fill: chartType === "line" ? false : true,
      }));
  chartInstances[canvasId] = new Chart(canvas, {
    type: chartType,
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#cbd5e1" } },
        tooltip: { callbacks: { title: (items) => fullLabels[items[0]?.dataIndex] ?? "" } },
      },
      scales: isCircular
        ? {}
        : {
            x: { ticks: { color: "#94a3b8", maxRotation: 40 }, grid: { color: "rgba(255,255,255,0.05)" } },
            y: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(255,255,255,0.05)" } },
          },
    },
  });
}

function renderInsightCharts() {
  if (state.metaInsights) {
    const rows = state.metaInsights.data || [];
    const metrics = getSelectedMetrics("meta", ["impressions", "clicks", "spend"]);
    const labelMap = Object.fromEntries(META_METRIC_OPTIONS.map((o) => [o.key, o.label]));
    const nameFieldOrder = getMetaNameFieldOrder(state.metaInsights.level);
    const xKey =
      nameFieldOrder.find((key) => rows[0]?.[key] !== undefined) || "date_start";
    renderMetricsChart(
      "metaChartCanvas",
      rows,
      xKey,
      metrics,
      el.metaChartType?.value || "bar",
      labelMap,
    );
  }
  if (state.gaInsights) {
    const rows = state.gaInsights.data || [];
    const metrics = getSelectedMetrics("ga4", ["sessions", "conversions"]);
    const labelMap = Object.fromEntries(GA4_METRIC_OPTIONS.map((o) => [o.key, o.label]));
    const xKey = el.gaGroupBy?.value || "date";
    renderMetricsChart(
      "gaChartCanvas",
      rows,
      xKey,
      metrics,
      el.gaChartType?.value || "line",
      labelMap,
    );
  }
}

function renderLookerEmbed() {
  const client = (state.workspace.clients || []).find((c) => c.id === state.currentClientId) || state.workspace.clients?.[0];
  if (el.lookerStudioUrl) el.lookerStudioUrl.value = client?.lookerStudioUrl || "";
  if (el.lookerEmbedContainer) {
    el.lookerEmbedContainer.innerHTML = client?.lookerStudioUrl
      ? `<iframe src="${escapeHTML(client.lookerStudioUrl)}" loading="lazy" allowfullscreen></iframe>`
      : `<p class="work-muted">Nenhum relatório do Looker Studio vinculado a este cliente ainda.</p>`;
  }
}

async function saveLookerStudioUrl() {
  const client = (state.workspace.clients || []).find((c) => c.id === state.currentClientId) || state.workspace.clients?.[0];
  if (!client) {
    showToast("Cadastre e selecione um cliente primeiro", "warning");
    return;
  }
  const url = el.lookerStudioUrl.value.trim();
  if (url && !/^https:\/\/lookerstudio\.google\.com\//.test(url)) {
    showToast("Cole o link de incorporação do Looker Studio (começa com https://lookerstudio.google.com/embed/...)", "danger");
    return;
  }
  try {
    await saveWorkspaceRecord("client", { ...client, lookerStudioUrl: url });
    showToast("Link do Looker Studio salvo", "success");
    renderLookerEmbed();
  } catch (error) {
    showToast(error.message, "danger");
  }
}

function renderWorkReports() {
  renderMetricPickers();
  renderLookerEmbed();
  const dashboardsHtml = `${state.metaInsights ? renderMetaDashboard(state.metaInsights) : ""}${state.gaInsights ? renderGaDashboard(state.gaInsights) : ""}`;
  el.workReportsContent.innerHTML = dashboardsHtml + renderSavedDashboardsSection();

  document.getElementById("btnSaveMetaPreset")?.addEventListener("click", () => saveDashboardPreset("meta"));
  document.getElementById("btnSaveGaPreset")?.addEventListener("click", () => saveDashboardPreset("ga4"));
  wireSavedDashboardActions();
  renderInsightCharts();
}

// --------------------------------------------------------------------------
// DASHBOARDS SALVOS POR CLIENTE
// --------------------------------------------------------------------------
// Substitui o antigo "relatório" manual (nome/período/notas digitados à mão,
// sem ligação real com os dados) por presets de verdade: salva a conta/
// propriedade, métricas e tipo de gráfico já configurados, pra não precisar
// redigitar tudo toda vez que voltar num cliente.
const PLATFORM_LABEL = { meta: "Meta Ads", ga4: "GA4" };

function renderSavedDashboardsSection() {
  const client = (state.workspace.clients || []).find((c) => c.id === state.currentClientId);
  if (!client) {
    return `<div class="saved-dashboards-section"><p class="work-muted">Selecione um cliente na aba "Clientes e campanhas" para salvar e ver os dashboards dele aqui.</p></div>`;
  }
  const presets = (state.workspace.reports || []).filter((r) => r.clientId === client.id);
  const list = presets.length
    ? presets
        .map(
          (p) =>
            `<div class="saved-dashboard-chip"><span class="chip-platform ${escapeHTML(p.platform)}">${PLATFORM_LABEL[p.platform] || p.platform}</span><span class="chip-label">${escapeHTML(p.label)}</span><button class="chip-icon-btn" data-load-preset="${escapeHTML(p.id)}" title="Carregar este dashboard"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg></button><button class="chip-icon-btn danger" data-delete-preset="${escapeHTML(p.id)}" title="Excluir"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button></div>`,
        )
        .join("")
    : `<p class="work-muted">Gere um dashboard acima e clique em "Salvar dashboard" para não precisar reconfigurar tudo da próxima vez.</p>`;
  return `<div class="saved-dashboards-section"><div class="work-section-heading"><div><span class="eyebrow-label">DASHBOARDS SALVOS</span><h3>Para ${escapeHTML(client.name)}</h3></div></div><div class="saved-dashboard-list">${list}</div></div>`;
}

function wireSavedDashboardActions() {
  el.workReportsContent.querySelectorAll("[data-load-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const preset = (state.workspace.reports || []).find((r) => r.id === btn.dataset.loadPreset);
      if (preset) loadDashboardPreset(preset);
    });
  });
  el.workReportsContent.querySelectorAll("[data-delete-preset]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Excluir este dashboard salvo?")) return;
      try {
        await deleteWorkspaceRecord("report", btn.dataset.deletePreset);
        showToast("Dashboard removido", "info");
        renderWorkReports();
      } catch (error) {
        showToast(error.message, "danger");
      }
    });
  });
}

async function saveDashboardPreset(platform) {
  const client = (state.workspace.clients || []).find((c) => c.id === state.currentClientId);
  if (!client) {
    showToast("Selecione um cliente antes de salvar o dashboard", "warning");
    return;
  }
  const payload = { clientId: client.id, platform };
  if (platform === "meta") {
    payload.accountId = el.metaAccountId.value.trim();
    payload.level = el.metaQueryLevel?.value || "campaign";
    payload.datePreset = el.metaDatePreset.value;
    payload.chartType = el.metaChartType?.value || "bar";
    payload.metrics = getSelectedMetrics("meta", ["impressions", "clicks", "spend"]);
    payload.label = `${payload.accountId} · ${el.metaDatePreset.selectedOptions[0]?.text || payload.datePreset}`;
  } else {
    payload.propertyId = el.gaPropertyId.value.trim();
    payload.groupBy = el.gaGroupBy?.value || "date";
    payload.datePreset = el.gaDatePreset.value;
    payload.chartType = el.gaChartType?.value || "line";
    payload.metrics = getSelectedMetrics("ga4", ["sessions", "conversions"]);
    payload.label = `Propriedade ${payload.propertyId} · ${el.gaDatePreset.selectedOptions[0]?.text || payload.datePreset}`;
  }
  try {
    await saveWorkspaceRecord("report", payload);
    showToast("Dashboard salvo para este cliente", "success");
    renderWorkReports();
  } catch (error) {
    showToast(error.message, "danger");
  }
}

function loadDashboardPreset(preset) {
  if (preset.platform === "meta") {
    el.metaAccountId.value = preset.accountId || "";
    if (preset.level) el.metaQueryLevel.value = preset.level;
    if (preset.datePreset) el.metaDatePreset.value = preset.datePreset;
    if (preset.chartType) el.metaChartType.value = preset.chartType;
    if (preset.metrics?.length) state.selectedMetrics = { ...state.selectedMetrics, meta: preset.metrics };
    importMetaInsights();
  } else {
    el.gaPropertyId.value = preset.propertyId || "";
    if (preset.groupBy) el.gaGroupBy.value = preset.groupBy;
    if (preset.datePreset) el.gaDatePreset.value = preset.datePreset;
    if (preset.chartType) el.gaChartType.value = preset.chartType;
    if (preset.metrics?.length) state.selectedMetrics = { ...state.selectedMetrics, ga4: preset.metrics };
    importGaInsights();
  }
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

  const nameFieldOrder = getMetaNameFieldOrder(payload.level);
  const campaignRows = rows
    .map((row) => {
      const name =
        nameFieldOrder.map((key) => row[key]).find(Boolean) || "Sem nome";
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
        <div class="dashboard-heading-actions">
          <button class="btn btn-ghost btn-sm" id="btnSaveMetaPreset">💾 Salvar dashboard</button>
          <button class="btn btn-secondary btn-sm" onclick="window.print()">Imprimir / PDF</button>
        </div>
      </div>

      <div class="chart-card">
        <h3>Gráfico personalizado (métricas selecionadas acima)</h3>
        <div class="chart-card-canvas-wrap"><canvas id="metaChartCanvas"></canvas></div>
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
        <div class="dashboard-heading-actions">
          <button class="btn btn-ghost btn-sm" id="btnSaveGaPreset">💾 Salvar dashboard</button>
          <button class="btn btn-secondary btn-sm" onclick="window.print()">Imprimir / PDF</button>
        </div>
      </div>

      <div class="chart-card">
        <h3>Gráfico personalizado (métricas selecionadas acima)</h3>
        <div class="chart-card-canvas-wrap"><canvas id="gaChartCanvas"></canvas></div>
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
    // sessionDefaultChannelGroup sempre incluído: a seção "por canal" do
    // dashboard abaixo depende dele, além da dimensão escolhida no gráfico.
    const metrics = Array.from(
      new Set([...getSelectedMetrics("ga4", ["sessions", "conversions"]), "sessions", "conversions"]),
    );
    const groupBy = el.gaGroupBy?.value || "date";
    const dimensions = Array.from(new Set([groupBy, "date", "sessionDefaultChannelGroup"]));
    const response = await fetch(
      `/api/ga4/insights?propertyId=${encodeURIComponent(propertyId)}&datePreset=${encodeURIComponent(datePreset)}&metrics=${encodeURIComponent(metrics.join(","))}&dimensions=${encodeURIComponent(dimensions.join(","))}`,
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
  const targets = [el.metaConnectionStatus, el.cfgMetaConnectionStatus].filter(Boolean);
  if (!targets.length) return;
  try {
    const response = await fetch("/api/meta/status");
    const status = await response.json();
    let html = "";
    let className = "meta-import-status";
    if (status.connectedViaOAuth) {
      html = `<span class="meta-status-ok">✅ Conectado ao Meta</span> · expira em ${status.daysUntilExpiry} dia(s) (renovação automática) · <a href="/auth/meta/login">Reconectar</a>`;
      className += " success";
    } else if (status.oauthConfigured) {
      html = `Nenhuma conta conectada ainda · <a href="/auth/meta/login">Conectar com Meta</a>`;
    } else if (status.configured) {
      html = "Usando token fixo do .env (sem renovação automática).";
    } else {
      html = "Meta Ads não configurado no backend.";
      className += " error";
    }
    targets.forEach((target) => {
      target.innerHTML = html;
      target.className = className;
    });
  } catch {
    targets.forEach((target) => (target.textContent = ""));
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
    // Campos fixos abaixo alimentam o KPI grid e a lista de campanhas do
    // dashboard (leads/compras vêm de actions/action_values); as métricas
    // marcadas na seção acima entram como extra para o gráfico personalizado.
    const requiredFields = [
      "campaign_name",
      "adset_name",
      "ad_name",
      "date_start",
      "impressions",
      "reach",
      "clicks",
      "spend",
      "actions",
      "action_values",
    ];
    const metrics = getSelectedMetrics("meta", ["impressions", "clicks", "spend"]);
    const fields = Array.from(new Set([...requiredFields, ...metrics]));
    const response = await fetch(
      `/api/meta/insights?accountId=${encodeURIComponent(accountId)}&datePreset=${encodeURIComponent(datePreset)}&level=${encodeURIComponent(level)}&fields=${encodeURIComponent(fields.join(","))}`,
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

function renderWorkClientDetail(client) {
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
  el.workDetailPanel.innerHTML = `<div class="work-detail-heading"><div><span class="eyebrow-label">CLIENTE</span><h2>${escapeHTML(client.name)}</h2><p>${escapeHTML(client.business || "Negócio")}${client.city ? ` · ${escapeHTML(client.city)}` : ""}</p></div><div class="work-detail-actions"><button class="btn btn-secondary btn-sm" id="btnEditClient">Editar</button></div></div><div class="work-info-strip"><div><span>Objetivo</span><strong>${escapeHTML(client.primaryGoal || "Não definido")}</strong></div><div><span>Contato</span><strong>${escapeHTML(client.contact || "Não informado")}</strong></div><div><span>Site / Instagram</span><strong>${escapeHTML(client.website || "Não informado")}</strong></div></div><div class="work-detail-grid"><section class="work-subpanel"><div class="work-subpanel-heading"><h3>Briefing do negócio</h3></div><dl class="work-briefing"><dt>Público-alvo</dt><dd>${escapeHTML(client.audience || "Ainda não preenchido")}</dd><dt>Detalhes</dt><dd>${escapeHTML(client.businessDetails || "Ainda não preenchido")}</dd><dt>Metas</dt><dd>${escapeHTML(client.goals || "Ainda não preenchido")}</dd></dl></section><section class="work-subpanel"><div class="work-subpanel-heading"><h3>Apresentações e documentos</h3><button class="btn btn-ghost btn-sm" id="btnAddDocument">+ Adicionar</button></div><div id="workDocumentList">${documents.length ? documents.map(renderDocumentItem).join("") : `<p class="work-muted">Adicione briefing, proposta ou relatório.</p>`}</div></section><section class="work-subpanel"><div class="work-subpanel-heading"><h3>Estudos relacionados</h3><span>${relatedNotes.length}</span></div>${relatedNotes.length ? relatedNotes.map((note) => `<div class="work-note"><strong>${escapeHTML(note.text.slice(0, 100))}</strong><small>${escapeHTML(note.timestampFormatted || "Anotação de aula")}</small></div>`).join("") : `<p class="work-muted">Adicione tags de estudo ao cliente para encontrar recomendações nas suas anotações.</p>`}</section></div>`;
  const structured = document.createElement("section");
  structured.className = "work-subpanel work-structured-summary";
  structured.innerHTML = `<div class="work-subpanel-heading"><h3>Planejamento de público, objetivos e verba</h3></div><dl class="work-briefing"><dt>Públicos-alvo</dt><dd>${(client.audiences || []).map((item) => `${item.primary ? "Principal: " : ""}${item.ageMin}-${item.ageMax} anos · ${escapeHTML(item.gender)} · ${escapeHTML(item.segmentation || "Sem segmentação")}`).join("<br>") || escapeHTML(client.audience || "Ainda não preenchido")}</dd><dt>Objetivos</dt><dd>${(client.objectives || []).map((item) => `${item.primary ? "Principal: " : ""}${escapeHTML(item.name)}`).join("<br>") || escapeHTML(client.primaryGoal || "Ainda não definido")}</dd><dt>Site</dt><dd>${escapeHTML(client.website || "Não informado")}</dd><dt>Instagram</dt><dd>${escapeHTML(client.instagram || "Não informado")}</dd><dt>Orçamentos mensais</dt><dd>${(client.budgets || []).map((item) => `${escapeHTML(item.month || "Mês não definido")}: ${formatCurrency(item.amount)}`).join("<br>") || "Ainda não definido"}</dd></dl>`;
  el.workDetailPanel.querySelector(".work-detail-grid").prepend(structured);
  el.workDetailPanel
    .querySelector("#btnEditClient")
    .addEventListener("click", () => openClientEditor(client));
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

function renderDocumentItem(document) {
  return `<div class="work-record-row"><div><strong>${escapeHTML(document.name)}</strong><small>${escapeHTML(document.kind || "Material")} · ${escapeHTML(document.status || "Rascunho")}</small></div><a href="${escapeHTML(document.url || "#")}" target="_blank" rel="noreferrer">Abrir</a></div>`;
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
  target.innerHTML = `<form class="work-form compact" id="documentForm"><div class="work-detail-heading"><div><span class="eyebrow-label">ARQUIVO PROFISSIONAL</span><h2>Novo documento</h2></div><button type="button" class="btn btn-ghost btn-sm" id="btnCancelDocument">Cancelar</button></div><div class="work-form-grid"><label>Cliente relacionado<select name="clientId">${clients.map((item) => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)}</option>`).join("")}</select></label><label>Nome do material<input name="name" required placeholder="Ex.: Proposta comercial setembro"></label><label>Tipo<select name="kind"><option>Briefing</option><option>Proposta comercial</option><option>Relatório</option><option>Apresentação</option><option>Contrato</option></select></label><label>Status<select name="status"><option>Rascunho</option><option>Enviado</option><option>Aprovado</option></select></label><label class="full">Arquivo (PDF, Word, PowerPoint, imagem...)<input type="file" name="file" id="documentFileInput" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.txt,.zip"><small id="documentFileHint">Até 14MB. Enviado com segurança para o storage — só quem tem acesso à plataforma consegue baixar.</small></label><label class="full">Ou cole um link externo (Google Drive, Canva...)<input name="url" placeholder="https://drive.google.com/..."></label><label class="full">Conteúdo / roteiro<textarea name="content" rows="6" placeholder="Título, problema, estratégia, investimento e próximos passos..."></textarea></label></div><div class="work-form-actions"><button class="btn btn-secondary" type="button" id="btnPresentationPreview">Gerar prévia HTML</button><button class="btn btn-primary" id="btnSubmitDocument">Salvar documento</button></div></form>`;
  const form = target.querySelector("form");
  form.clientId.value = selectedId;
  form.querySelector("#btnCancelDocument").addEventListener("click", () => {
    state.workSection = "documents";
    renderWorkView();
  });
  form.querySelector("#documentFileInput").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    const hint = form.querySelector("#documentFileHint");
    if (file && file.size > 14 * 1024 * 1024) {
      showToast("Arquivo muito grande (máximo 14MB). Use um link externo.", "danger");
      event.target.value = "";
      return;
    }
    if (file) hint.textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB) selecionado`;
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
    delete payload.file;
    const submitBtn = form.querySelector("#btnSubmitDocument");
    const file = form.querySelector("#documentFileInput").files?.[0];
    submitBtn.disabled = true;
    try {
      if (file) {
        submitBtn.textContent = "Enviando arquivo...";
        const uploaded = await uploadDocumentFile(file, payload.clientId);
        payload.url = uploaded.url;
        payload.storageKey = uploaded.storageKey;
        payload.fileName = uploaded.fileName;
        payload.fileSize = uploaded.fileSize;
      }
      await saveWorkspaceRecord("document", payload);
      state.workSection = "documents";
      renderWorkView();
      showToast("Documento salvo", "success");
    } catch (error) {
      showToast(error.message, "danger");
      submitBtn.disabled = false;
      submitBtn.textContent = "Salvar documento";
    }
  });
}

// Lê o arquivo escolhido, envia em base64 para o servidor guardar no R2 e
// devolve a URL de download autenticada (só quem está logado consegue abrir).
function uploadDocumentFile(file, clientId) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo"));
    reader.onload = async () => {
      try {
        const response = await fetch("/api/documents/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            fileName: file.name,
            fileBase64: reader.result,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Falha ao enviar o arquivo");
        resolve(data);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsDataURL(file);
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
    el.heroLessonSubtitle.textContent = "Envie vídeos para o storage do Cloudflare R2 ou reescaneie a biblioteca.";
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

function formatHoursStudied(totalSeconds) {
  const hours = totalSeconds / 3600;
  if (hours < 1) return `${Math.round(totalSeconds / 60)}min`;
  return `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
}

function computeStreakDays() {
  const dates = new Set();
  Object.values(state.progress.videos || {}).forEach((p) => {
    if (p.lastWatchedAt) dates.add(new Date(p.lastWatchedAt).toDateString());
  });
  if (!dates.size) return 0;
  let streak = 0;
  const cursor = new Date();
  if (!dates.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
  while (dates.has(cursor.toDateString())) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// 4. Stats Grid
function renderStatsGrid() {
  const allVideos = getAllCurrentCourseVideos();
  let completed = 0;
  let secondsStudied = 0;

  allVideos.forEach((v) => {
    const p = state.progress.videos?.[v.id];
    if (!p) return;
    if (p.completed) completed++;
    secondsStudied += p.completed ? p.duration || p.currentTime || 0 : p.currentTime || 0;
  });

  const courses = state.coursesData?.courses || [];
  const coursesInProgress = courses.filter((course) =>
    (course.modules || []).some((m) =>
      (m.videos || []).some((v) => {
        const p = state.progress.videos?.[v.id];
        return p && p.currentTime > 0 && !p.completed;
      }),
    ),
  ).length;

  el.statHoursStudied.textContent = formatHoursStudied(secondsStudied);
  el.statCompletedVideos.textContent = completed;
  el.statCoursesInProgress.textContent = coursesInProgress;
  const streak = computeStreakDays();
  el.statStreak.textContent = `${streak} dia${streak === 1 ? "" : "s"}`;
}

function renderHomeGreeting() {
  if (!el.homeGreetingText) return;
  const email = state.currentUserEmail || "";
  const name = email.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  const displayName = name
    ? name.replace(/\b\w/g, (c) => c.toUpperCase())
    : "";
  el.homeGreetingText.textContent = displayName
    ? `Olá, ${displayName}! 👋`
    : "Olá! 👋";
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

  const shelfTitles = {
    all: "Todas as Aulas",
    in_progress: "Aulas em Andamento",
    completed: "Aulas Concluídas",
    unwatched: "Aulas Não Assistidas",
    favorites: "Aulas Favoritas",
  };
  if (el.homeShelfTitle) {
    el.homeShelfTitle.textContent =
      shelfTitles[state.currentFilter] || shelfTitles.all;
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

function selectCourse(course) {
  state.currentCourse = course;
  renderAll();
  switchView("viewCourses");
}

function createCourseCardElement(course) {
  const allVideos = (course.modules || []).flatMap((m) => m.videos || []);
  const thumbUrl = allVideos[0]?.thumbUrl || "";
  const moduleCount = (course.modules || []).length;
  let lastActivity = null;
  allVideos.forEach((v) => {
    const p = state.progress.videos?.[v.id];
    if (p?.lastWatchedAt && (!lastActivity || p.lastWatchedAt > lastActivity)) {
      lastActivity = p.lastWatchedAt;
    }
  });

  const card = document.createElement("button");
  card.className = "course-card";
  card.innerHTML = `
    <div class="course-card-thumb">
      <img src="${thumbUrl}" alt="${escapeHTML(course.cleanTitle || course.title)}" loading="lazy" />
    </div>
    <div class="course-card-body">
      <h3 class="course-card-title">${escapeHTML(course.cleanTitle || course.title)}</h3>
      <p class="course-card-desc">${moduleCount} módulo${moduleCount === 1 ? "" : "s"} · ${course.totalVideos} aula${course.totalVideos === 1 ? "" : "s"}</p>
      <div class="course-card-progress-track">
        <div class="course-card-progress-fill" style="width: ${course.percentage || 0}%"></div>
      </div>
      <div class="course-card-footer">
        <span>${course.percentage || 0}% concluído</span>
        ${lastActivity ? `<span>${formatRelativeTime(lastActivity)}</span>` : ""}
      </div>
    </div>
  `;
  card.addEventListener("click", () => selectCourse(course));
  return card;
}

function renderMyCoursesGrid() {
  if (!el.myCoursesGrid) return;
  const courses = state.coursesData?.courses || [];
  el.myCoursesGrid.innerHTML = "";
  courses.forEach((course) => {
    el.myCoursesGrid.appendChild(createCourseCardElement(course));
  });
}

function watchedEntriesForCourse(course) {
  const allVideos = (course.modules || []).flatMap((m) => m.videos || []);
  return allVideos
    .map((v) => ({ video: v, p: state.progress.videos?.[v.id] }))
    .filter((entry) => entry.p && entry.p.lastWatchedAt);
}

function renderHomeRecentRail() {
  if (!el.homeRecentRail) return;
  const courses = state.coursesData?.courses || [];
  const entries = courses
    .flatMap((course) => watchedEntriesForCourse(course))
    .sort((a, b) => new Date(b.p.lastWatchedAt) - new Date(a.p.lastWatchedAt))
    .slice(0, 10);

  const shelf = el.homeRecentRail.closest(".section-shelf");
  if (!entries.length) {
    if (shelf) shelf.hidden = true;
    return;
  }
  if (shelf) shelf.hidden = false;
  el.homeRecentRail.innerHTML = "";
  entries.forEach(({ video }) => {
    el.homeRecentRail.appendChild(createVideoCardElement(video));
  });
}

function renderHomeFavoritesRail() {
  if (!el.homeFavoritesRail) return;
  const allVideos = (state.coursesData?.courses || []).flatMap((c) =>
    (c.modules || []).flatMap((m) => m.videos || []),
  );
  const favVideos = allVideos.filter((v) => state.favorites.includes(v.id));
  if (el.shelfHomeFavorites) el.shelfHomeFavorites.hidden = !favVideos.length;
  if (!favVideos.length) return;
  el.homeFavoritesRail.innerHTML = "";
  favVideos.slice(0, 10).forEach((v) => {
    el.homeFavoritesRail.appendChild(createVideoCardElement(v));
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
    playVideoFromAnyCourse(video);
  });

  return card;
}

// 6. Curriculum Track (Unrestricted height so ALL lessons are scrollable and visible)
function renderCurriculumTrack(container = el.curriculumTrackContainer) {
  if (!state.currentCourse || !container) return;
  const modules = state.currentCourse.modules || [];
  container.innerHTML = "";

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
      const noteCount = state.notes.filter((n) => n.videoId === video.id).length;

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
          ${
            noteCount > 0
              ? `<span class="item-note-indicator" title="${noteCount} anotação${noteCount === 1 ? "" : "ões"}">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                  </svg>
                  ${noteCount}
                </span>`
              : ""
          }
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

    container.appendChild(card);
  });
}

// 7. PÁGINA DO CURSO (detalhe do curso selecionado no seletor do topo)
function findNextLessonForCourse(course) {
  const allVideos = (course.modules || []).flatMap((m) => m.videos || []);
  const inProgress = allVideos.find((v) => {
    const p = state.progress.videos?.[v.id];
    return p && p.currentTime > 0 && !p.completed;
  });
  if (inProgress) return inProgress;
  return allVideos.find((v) => !state.progress.videos?.[v.id]?.completed) || allVideos[0];
}

function renderAllCoursesView() {
  const course = state.currentCourse;
  if (!el.courseDetailHeader) return;

  if (!course) {
    el.courseDetailHeader.style.display = "none";
    if (el.courseDetailModulesContainer) {
      el.courseDetailModulesContainer.innerHTML = `
        <div class="empty-state-panel">
          <h2>Nenhum curso encontrado</h2>
          <p>Envie vídeos para o storage do Cloudflare R2 ou clique em Reescanear.</p>
        </div>
      `;
    }
    return;
  }
  el.courseDetailHeader.style.display = "";

  const modules = course.modules || [];
  const allVideos = modules.flatMap((m) => m.videos || []);
  let completedLessons = 0;
  allVideos.forEach((v) => {
    if (state.progress.videos?.[v.id]?.completed) completedLessons++;
  });
  const totalLessons = course.totalVideos || 0;
  const coursePct =
    totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  el.courseDetailThumbImg.src = allVideos[0]?.thumbUrl || "";
  el.courseDetailThumbImg.alt = course.cleanTitle || course.title;
  el.courseDetailTitle.textContent = course.cleanTitle || course.title;
  el.courseDetailDesc.textContent = `${modules.length} módulo${modules.length === 1 ? "" : "s"} · ${totalLessons} aula${totalLessons === 1 ? "" : "s"}`;
  el.courseDetailProgressFill.style.width = `${coursePct}%`;
  el.courseDetailProgressLabel.textContent = `${completedLessons}/${totalLessons} aulas · ${coursePct}% concluído`;

  el.btnCourseDetailContinue.onclick = () => {
    const target = findNextLessonForCourse(course);
    if (target) playVideo(target);
  };

  renderCurriculumTrack(el.courseDetailModulesContainer);
}

// 8. Player Details & Sidebar
function renderPlayerDetails(video) {
  state.currentVideo = video;
  el.playerLessonCleanTitle.textContent = video.cleanTitle;
  el.playerLessonFileName.textContent = (video.fileName || video.id).replace(
    /\.[a-zA-Z0-9]+$/,
    "",
  );
  el.playerLessonFileName.title = video.id;
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
        <button class="note-btn-action edit-btn" title="Editar nota">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
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

    attachNoteItemActions(noteEl, note, () => renderLessonNotesList(videoId));

    el.lessonNotesList.appendChild(noteEl);
  });
}

// 10. All Notes View
function prettifyOrphanSegment(segment) {
  return segment
    .replace(/\.[a-zA-Z0-9]+$/, "")
    .replace(/^\d+[\s._-]*/, "")
    .replace(/[_]+/g, " ")
    .trim();
}

// Anotações de vídeos que não existem mais no catálogo atual (ex.: aulas
// locais antigas, de antes da migração para o R2) caem aqui — sem isso o
// título mostrado seria o caminho de arquivo cru, com extensão e tudo.
function buildOrphanNoteVideo(vId) {
  const parts = vId.split("/").filter(Boolean);
  const fileName = parts[parts.length - 1] || vId;
  return {
    id: vId,
    cleanTitle: prettifyOrphanSegment(fileName) || fileName,
    cleanModule: parts.length >= 2 ? prettifyOrphanSegment(parts[parts.length - 2]) : "Geral",
    cleanCourse: parts.length >= 3 ? prettifyOrphanSegment(parts[0]) : "Curso",
  };
}

function notesEmptyStateHTML(title, message) {
  return `
    <div class="empty-state-panel">
      <div class="empty-state-icon">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="9" y1="15" x2="15" y2="15"></line>
          <line x1="9" y1="11" x2="15" y2="11"></line>
        </svg>
      </div>
      <h2>${title}</h2>
      <p>${message}</p>
    </div>
  `;
}

function renderAllNotesView() {
  // Cursos completos, não só o selecionado no momento: uma anotação pode
  // pertencer a qualquer curso e precisa aparecer aqui de qualquer forma.
  const courses = state.coursesData?.courses || [];
  const allVideos = courses.flatMap((c) =>
    (c.modules || []).flatMap((m) => m.videos || []),
  );
  const videoMap = new Map();
  allVideos.forEach((v) => videoMap.set(v.id, v));

  el.globalNotesContainer.innerHTML = "";
  if (!state.notes.length) {
    el.globalNotesContainer.innerHTML = notesEmptyStateHTML(
      "Nenhuma anotação registrada ainda",
      "Durante a reprodução de qualquer aula, adicione anotações vinculadas ao minuto exato do vídeo.",
    );
    return;
  }

  const query = (el.notesSearchInput?.value || "").toLowerCase().trim();

  const grouped = {};
  state.notes.forEach((note) => {
    if (!grouped[note.videoId]) grouped[note.videoId] = [];
    grouped[note.videoId].push(note);
  });

  let groupsRendered = 0;

  for (const [vId, vNotes] of Object.entries(grouped)) {
    const video = videoMap.get(vId) || buildOrphanNoteVideo(vId);

    const matchedNotes = query
      ? vNotes.filter(
          (note) =>
            note.text.toLowerCase().includes(query) ||
            video.cleanTitle.toLowerCase().includes(query) ||
            video.cleanCourse.toLowerCase().includes(query) ||
            video.cleanModule.toLowerCase().includes(query),
        )
      : vNotes;
    if (!matchedNotes.length) continue;

    groupsRendered++;
    const groupEl = document.createElement("div");
    groupEl.className = "course-notes-group";
    groupEl.innerHTML = `
      <div class="course-notes-group-header">
        <div>
          <span class="course-notes-context">${video.cleanCourse} • ${video.cleanModule}</span>
          <h3 class="course-notes-title">${video.cleanTitle}</h3>
        </div>
        <button class="btn btn-secondary btn-sm btn-open-lesson">Assistir Aula ▶</button>
      </div>
      <div class="notes-list"></div>
    `;

    groupEl.querySelector(".btn-open-lesson").onclick = () => {
      playVideoFromAnyCourse(video);
    };

    const nList = groupEl.querySelector(".notes-list");
    matchedNotes
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
          <button class="note-btn-action edit-btn" title="Editar nota">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="note-btn-action delete-btn" title="Excluir nota">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;

        item.querySelector(".note-timestamp-btn").onclick = () => {
          playVideoFromAnyCourse(video, note.timestamp);
        };

        attachNoteItemActions(item, note, () => renderAllNotesView());

        nList.appendChild(item);
      });

    el.globalNotesContainer.appendChild(groupEl);
  }

  if (!groupsRendered) {
    el.globalNotesContainer.innerHTML = notesEmptyStateHTML(
      "Nenhuma anotação encontrada",
      "Tente buscar por outro termo, curso ou aula.",
    );
  }
}

// 11. Favorites View
function favoritesEmptyStateHTML(message) {
  return `
    <div class="empty-state-panel" style="grid-column: 1 / -1;">
      <div class="empty-state-icon">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
        </svg>
      </div>
      <h2>Nenhum favorito ainda</h2>
      <p>${message}</p>
    </div>
  `;
}

function renderFavoritesView() {
  const courses = state.coursesData?.courses || [];
  const allVideos = courses.flatMap((c) =>
    (c.modules || []).flatMap((m) => m.videos || []),
  );
  const favVideos = allVideos.filter((v) => state.favorites.includes(v.id));

  el.favoritesTabs
    ?.querySelectorAll(".work-tab")
    .forEach((tab) =>
      tab.classList.toggle(
        "active",
        tab.dataset.favSection === state.favoritesSection,
      ),
    );

  el.favoritesVideosGrid.hidden = state.favoritesSection !== "lessons";
  el.favoritesByCourseContainer.hidden = state.favoritesSection !== "courses";
  el.favoritesNotesList.hidden = state.favoritesSection !== "notes";

  if (state.favoritesSection === "courses") {
    if (!favVideos.length) {
      el.favoritesByCourseContainer.innerHTML = favoritesEmptyStateHTML(
        "Salve aulas que você quer revisar depois — elas aparecem aqui agrupadas por curso.",
      );
      return;
    }
    el.favoritesByCourseContainer.innerHTML = "";
    courses.forEach((course) => {
      const courseVideos = (course.modules || [])
        .flatMap((m) => m.videos || [])
        .filter((v) => state.favorites.includes(v.id));
      if (!courseVideos.length) return;
      const section = document.createElement("div");
      section.className = "section-shelf";
      section.innerHTML = `
        <div class="shelf-header">
          <div class="shelf-title-box">
            <h2 class="shelf-title">${escapeHTML(course.cleanTitle || course.title)}</h2>
            <span class="shelf-count-badge">${courseVideos.length}</span>
          </div>
        </div>
        <div class="videos-grid"></div>
      `;
      const grid = section.querySelector(".videos-grid");
      courseVideos.forEach((v) => grid.appendChild(createVideoCardElement(v)));
      el.favoritesByCourseContainer.appendChild(section);
    });
    return;
  }

  if (state.favoritesSection === "notes") {
    const favNotes = state.notes.filter((n) =>
      state.favorites.includes(n.videoId),
    );
    if (!favNotes.length) {
      el.favoritesNotesList.innerHTML = favoritesEmptyStateHTML(
        "Anotações feitas em aulas favoritadas aparecem aqui.",
      );
      return;
    }
    el.favoritesNotesList.innerHTML = favNotes
      .map((note) => {
        const video = findVideoById(note.videoId);
        return `
        <button class="history-row" data-note-id="${escapeHTML(note.id)}">
          <div class="history-row-body">
            <span class="history-row-breadcrumb">${escapeHTML(video?.cleanTitle || "Aula")}</span>
            <h3 class="history-row-title">${escapeHTML(note.text.slice(0, 100))}</h3>
          </div>
          <div class="history-row-meta">
            <span class="history-row-time">${note.timestampFormatted || formatTime(note.timestamp)}</span>
          </div>
        </button>
      `;
      })
      .join("");
    el.favoritesNotesList.querySelectorAll("[data-note-id]").forEach((row) => {
      row.addEventListener("click", () => {
        const note = favNotes.find((n) => n.id === row.dataset.noteId);
        const video = note && findVideoById(note.videoId);
        if (video) playVideoFromAnyCourse(video, note.timestamp);
      });
    });
    return;
  }

  // state.favoritesSection === "lessons"
  el.favoritesVideosGrid.innerHTML = "";
  if (!favVideos.length) {
    el.favoritesVideosGrid.innerHTML = favoritesEmptyStateHTML(
      "Clique no ícone de estrela nas aulas para salvá-las aqui e encontrá-las rapidamente.",
    );
    return;
  }
  favVideos.forEach((v) => {
    el.favoritesVideosGrid.appendChild(createVideoCardElement(v));
  });
}

function formatRelativeTime(isoString) {
  const then = new Date(isoString).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "agora mesmo";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `há ${diffHours}h`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return "ontem";
  if (diffDays < 7) return `há ${diffDays} dias`;
  const diffWeeks = Math.round(diffDays / 7);
  if (diffWeeks < 5) return `há ${diffWeeks} semana${diffWeeks > 1 ? "s" : ""}`;
  return new Date(isoString).toLocaleDateString("pt-BR");
}

function renderHistoryView() {
  if (!el.historyList) return;
  const allVideos = getAllCurrentCourseVideos();
  const watched = allVideos
    .map((v) => ({ video: v, p: state.progress.videos?.[v.id] }))
    .filter((entry) => entry.p && entry.p.lastWatchedAt)
    .sort(
      (a, b) => new Date(b.p.lastWatchedAt) - new Date(a.p.lastWatchedAt),
    );

  if (!watched.length) {
    el.historyList.innerHTML = `
      <div class="empty-state-panel">
        <div class="empty-state-icon">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="9"></circle>
            <polyline points="12 7 12 12 15.5 14"></polyline>
          </svg>
        </div>
        <h2>Seu histórico ainda está vazio</h2>
        <p>As aulas que você assistir vão aparecer aqui, da mais recente para a mais antiga.</p>
      </div>
    `;
    return;
  }

  el.historyList.innerHTML = watched
    .map(({ video, p }) => {
      const isCompleted = !!p.completed;
      return `
      <button class="history-row" data-history-id="${escapeHTML(video.id)}">
        <div class="history-row-thumb">
          <img src="${video.thumbUrl}" alt="${escapeHTML(video.cleanTitle)}" loading="lazy" />
        </div>
        <div class="history-row-body">
          <span class="history-row-breadcrumb">${escapeHTML(video.cleanCourse)} · ${escapeHTML(video.cleanModule)}</span>
          <h3 class="history-row-title">${escapeHTML(video.cleanTitle)}</h3>
          <div class="history-row-progress-track">
            <div class="history-row-progress-fill" style="width: ${isCompleted ? 100 : p.percentage || 0}%"></div>
          </div>
        </div>
        <div class="history-row-meta">
          <span class="history-row-status">${isCompleted ? "✓ Concluída" : `${p.percentage || 0}%`}</span>
          <span class="history-row-time">${formatRelativeTime(p.lastWatchedAt)}</span>
        </div>
      </button>
    `;
    })
    .join("");

  el.historyList.querySelectorAll("[data-history-id]").forEach((row) => {
    row.addEventListener("click", () => {
      const entry = watched.find((w) => w.video.id === row.dataset.historyId);
      if (entry) playVideo(entry.video);
    });
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
  el.navBtnNotes.classList.toggle("active", viewId === "viewNotes");
  el.navBtnFavorites.classList.toggle("active", viewId === "viewFavorites");
  el.navBtnHistory.classList.toggle("active", viewId === "viewHistory");
  el.navBtnWork.classList.toggle("active", viewId === "viewWork");

  [
    el.viewHome,
    el.viewCourses,
    el.viewPlayer,
    el.viewNotes,
    el.viewFavorites,
    el.viewHistory,
    el.viewWork,
  ].forEach((v) => {
    v.classList.toggle("active", v.id === viewId);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });

  if (viewId === "viewNotes") {
    renderAllNotesView();
  } else if (viewId === "viewFavorites") {
    renderFavoritesView();
  } else if (viewId === "viewHistory") {
    renderHistoryView();
  } else if (viewId === "viewHome") {
    renderHomeGreeting();
    renderHomeHero();
    renderStatsGrid();
    renderMyCoursesGrid();
    renderHomeRecentRail();
    renderHomeFavoritesRail();
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
// COMMAND PALETTE (Ctrl/Cmd + K) — busca global com resultados agrupados
// --------------------------------------------------------------------------

function findVideoById(videoId) {
  const courses = state.coursesData?.courses || [];
  for (const course of courses) {
    for (const mod of course.modules || []) {
      const found = (mod.videos || []).find((v) => v.id === videoId);
      if (found) return found;
    }
  }
  return null;
}

function findCourseByVideoId(videoId) {
  const courses = state.coursesData?.courses || [];
  return courses.find((course) =>
    (course.modules || []).some((m) =>
      (m.videos || []).some((v) => v.id === videoId),
    ),
  );
}

// Garante que o curso selecionado no topo/sidebar acompanhe a aula que vai
// tocar, mesmo quando ela vem de outro curso (ex.: resultado da busca).
function playVideoFromAnyCourse(video, startTime = null) {
  const course = findCourseByVideoId(video.id);
  if (course && course.id !== state.currentCourse?.id) {
    state.currentCourse = course;
    renderCourseDropdown();
    updateHeaderProgress();
  }
  playVideo(video, startTime);
}

function getCommandPaletteResults(query) {
  const q = query.trim().toLowerCase();
  const courses = state.coursesData?.courses || [];
  const allVideos = courses.flatMap((c) =>
    (c.modules || []).flatMap((m) => m.videos || []),
  );

  if (!q) {
    const recent = courses
      .flatMap((c) => watchedEntriesForCourse(c))
      .sort((a, b) => new Date(b.p.lastWatchedAt) - new Date(a.p.lastWatchedAt))
      .slice(0, 5)
      .map((e) => e.video);
    const favorites = allVideos
      .filter((v) => state.favorites.includes(v.id))
      .slice(0, 5);
    return { courses: [], videos: recent, notes: [], favorites, isDefault: true };
  }

  const courseMatches = courses
    .filter((c) => (c.cleanTitle || c.title || "").toLowerCase().includes(q))
    .slice(0, 5);
  const videoMatches = allVideos
    .filter(
      (v) =>
        v.cleanTitle.toLowerCase().includes(q) ||
        v.cleanModule.toLowerCase().includes(q),
    )
    .slice(0, 6);
  const noteMatches = state.notes
    .filter((n) => n.text.toLowerCase().includes(q))
    .slice(0, 5);
  const favMatches = allVideos
    .filter(
      (v) => state.favorites.includes(v.id) && v.cleanTitle.toLowerCase().includes(q),
    )
    .slice(0, 5);

  return {
    courses: courseMatches,
    videos: videoMatches,
    notes: noteMatches,
    favorites: favMatches,
    isDefault: false,
  };
}

function openCommandPalette() {
  el.commandPaletteBackdrop.classList.add("open");
  el.commandPaletteInput.value = "";
  renderCommandPaletteResults("");
  setTimeout(() => el.commandPaletteInput.focus(), 30);
}

function closeCommandPalette() {
  el.commandPaletteBackdrop.classList.remove("open");
}

function commandPaletteIcon(type) {
  const icons = {
    course: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>',
    video: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>',
    note: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>',
    favorite: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>',
  };
  return icons[type] || icons.video;
}

function renderCommandPaletteResults(query) {
  const { courses, videos, notes, favorites, isDefault } =
    getCommandPaletteResults(query);
  const groups = [
    { label: isDefault ? "Recentes" : "Aulas", type: "video", items: videos },
    { label: "Cursos", type: "course", items: courses },
    { label: "Anotações", type: "note", items: notes },
    { label: "Favoritos", type: "favorite", items: favorites },
  ].filter((g) => g.items.length);

  if (!groups.length) {
    el.commandPaletteResults.innerHTML = `<div class="command-palette-empty">Nenhum resultado encontrado.</div>`;
    return;
  }

  el.commandPaletteResults.innerHTML = groups
    .map(
      (group) => `
      <div class="cp-group-label">${group.label}</div>
      ${group.items
        .map((item, idx) => {
          if (group.type === "course") {
            return `<button class="cp-result-item" data-type="course" data-idx="${idx}">
              <span class="cp-result-icon">${commandPaletteIcon("course")}</span>
              <span class="cp-result-body"><span class="cp-result-title">${escapeHTML(item.cleanTitle || item.title)}</span><span class="cp-result-meta">${item.totalVideos} aulas</span></span>
            </button>`;
          }
          if (group.type === "note") {
            const video = findVideoById(item.videoId);
            return `<button class="cp-result-item" data-type="note" data-idx="${idx}">
              <span class="cp-result-icon">${commandPaletteIcon("note")}</span>
              <span class="cp-result-body"><span class="cp-result-title">${escapeHTML(item.text.slice(0, 70))}</span><span class="cp-result-meta">${escapeHTML(video?.cleanTitle || "Aula")}</span></span>
              <span class="cp-result-timestamp">${item.timestampFormatted || formatTime(item.timestamp)}</span>
            </button>`;
          }
          return `<button class="cp-result-item" data-type="${group.type}" data-idx="${idx}">
            <span class="cp-result-icon">${commandPaletteIcon(group.type)}</span>
            <span class="cp-result-body"><span class="cp-result-title">${escapeHTML(item.cleanTitle)}</span><span class="cp-result-meta">${escapeHTML(item.cleanCourse)} · ${escapeHTML(item.cleanModule)}</span></span>
          </button>`;
        })
        .join("")}
    `,
    )
    .join("");

  const activate = (type, idx) => {
    if (type === "course") {
      const course = courses[idx];
      closeCommandPalette();
      if (course) selectCourse(course);
    } else if (type === "note") {
      const note = notes[idx];
      const video = note && findVideoById(note.videoId);
      closeCommandPalette();
      if (video) playVideoFromAnyCourse(video, note.timestamp);
    } else {
      const video = (type === "favorite" ? favorites : videos)[idx];
      closeCommandPalette();
      if (video) playVideoFromAnyCourse(video);
    }
  };

  el.commandPaletteResults.querySelectorAll(".cp-result-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      activate(btn.dataset.type, Number(btn.dataset.idx));
    });
  });

  el.commandPaletteResults.querySelector(".cp-result-item")?.classList.add("selected");
  el.commandPaletteResults._activate = activate;
}

function moveCommandPaletteSelection(delta) {
  const items = Array.from(
    el.commandPaletteResults.querySelectorAll(".cp-result-item"),
  );
  if (!items.length) return;
  const currentIdx = items.findIndex((i) => i.classList.contains("selected"));
  const nextIdx =
    currentIdx === -1 ? 0 : (currentIdx + delta + items.length) % items.length;
  items.forEach((i) => i.classList.remove("selected"));
  items[nextIdx].classList.add("selected");
  items[nextIdx].scrollIntoView({ block: "nearest" });
}

function activateCommandPaletteSelection() {
  const selected = el.commandPaletteResults.querySelector(".cp-result-item.selected");
  if (selected && el.commandPaletteResults._activate) {
    el.commandPaletteResults._activate(selected.dataset.type, Number(selected.dataset.idx));
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
  el.navBtnNotes.addEventListener("click", () => switchView("viewNotes"));
  el.navBtnFavorites.addEventListener("click", () =>
    switchView("viewFavorites"),
  );
  el.navBtnHistory.addEventListener("click", () => switchView("viewHistory"));
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

  el.favoritesTabs?.addEventListener("click", (event) => {
    const tab = event.target.closest(".work-tab");
    if (!tab) return;
    state.favoritesSection = tab.dataset.favSection;
    renderFavoritesView();
  });
  el.documentClientFilter.addEventListener("change", renderWorkDocuments);
  el.documentSearch.addEventListener("input", renderWorkDocuments);

  el.workKpiFilterBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    el.workKpiFilter?.classList.toggle("open");
  });
  document.addEventListener("click", (event) => {
    if (el.workKpiFilter && !el.workKpiFilter.contains(event.target)) {
      el.workKpiFilter.classList.remove("open");
    }
  });
  el.workKpiFilterAll?.addEventListener("change", () => {
    state.workKpiClientIds = el.workKpiFilterAll.checked ? null : [];
    renderWorkKpis();
  });
  el.btnNewDocument.addEventListener("click", () => openDocumentEditor());
  el.btnImportMeta.addEventListener("click", importMetaInsights);
  el.btnImportGa.addEventListener("click", importGaInsights);
  el.metaChartType?.addEventListener("change", renderInsightCharts);
  el.gaChartType?.addEventListener("change", renderInsightCharts);
  el.btnSaveLookerUrl?.addEventListener("click", saveLookerStudioUrl);

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

  // DIRECT CLICK SURFACE FOR PLAY/PAUSE — atrasado um pouco para dar tempo
  // do navegador emitir "dblclick" em vez de dois cliques simples (senão um
  // duplo toque/clique também dispararia o play/pause duas vezes de quebra).
  let videoClickTimer = null;
  el.videoClickSurface.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearTimeout(videoClickTimer);
    videoClickTimer = setTimeout(() => togglePlayPause(), 250);
  });

  // Duplo clique/toque nos terços esquerdo e direito do vídeo = voltar/
  // avançar 10s (igual YouTube); no terço central, alterna tela cheia.
  el.videoClickSurface.addEventListener("dblclick", (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearTimeout(videoClickTimer);
    const rect = el.videoClickSurface.getBoundingClientRect();
    const ratio = rect.width ? (e.clientX - rect.left) / rect.width : 0.5;
    if (ratio < 0.35) {
      seekRelative(-10, "left");
    } else if (ratio > 0.65) {
      seekRelative(10, "right");
    } else {
      el.ctrlFullscreen.click();
    }
  });

  // Qualquer toque/clique dentro do player reaparece os controles (o clique
  // no click-surface não borbulha até aqui porque ele mesmo chama
  // stopPropagation, por isso é chamado direto nos dois handlers acima).
  el.videoClickSurface.addEventListener("click", showPlayerControls);
  el.videoClickSurface.addEventListener("dblclick", showPlayerControls);
  el.videoContainer.addEventListener("click", showPlayerControls);
  el.videoContainer.addEventListener("touchstart", showPlayerControls, { passive: true });

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
    showPlayerControls();
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
    showPlayerControls();
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

  el.notesSearchInput?.addEventListener("input", () => {
    renderAllNotesView();
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
    refreshMetaConnectionStatus();
    el.modalSettingsBackdrop.classList.add("open");
  });
  el.btnCloseSettings.addEventListener("click", () => {
    el.modalSettingsBackdrop.classList.remove("open");
  });
  el.btnConfirmCloseSettings.addEventListener("click", () => {
    el.modalSettingsBackdrop.classList.remove("open");
  });

  // Command Palette
  el.btnMobileSearch?.addEventListener("click", () => openCommandPalette());
  el.commandPaletteBackdrop.addEventListener("click", (e) => {
    if (e.target === el.commandPaletteBackdrop) closeCommandPalette();
  });
  let paletteDebounce = null;
  el.commandPaletteInput.addEventListener("input", (e) => {
    clearTimeout(paletteDebounce);
    const value = e.target.value;
    paletteDebounce = setTimeout(() => renderCommandPaletteResults(value), 120);
  });
  el.commandPaletteInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveCommandPaletteSelection(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveCommandPaletteSelection(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      activateCommandPaletteSelection();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeCommandPalette();
    }
  });

  el.btnCfgSwitchAccount?.addEventListener("click", handleSwitchAccount);
  el.btnCfgSignOut?.addEventListener("click", handleSignOut);

  el.btnCollapseSidebar?.addEventListener("click", async () => {
    state.settings.sidebarCollapsed = !state.settings.sidebarCollapsed;
    applySidebarCollapsed(state.settings.sidebarCollapsed);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sidebarCollapsed: state.settings.sidebarCollapsed }),
      });
    } catch (e) {
      console.warn("Não foi possível salvar a preferência da barra lateral:", e);
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
        setTimeout(scheduleAutoThumbnails, 1000);
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
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openCommandPalette();
      return;
    }

    if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      if (e.key === "Escape") document.activeElement.blur();
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
