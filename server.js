const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const crypto = require("crypto");
const { exec } = require("child_process");
const { GoogleAuth } = require("google-auth-library");

const ROOT_DIR = __dirname;

// Carrega o .env manualmente (sem depender de pacote externo), sem
// sobrescrever variáveis que já estejam definidas no ambiente real.
function loadDotEnv() {
  const envPath = path.join(ROOT_DIR, ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) return;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  });
}
loadDotEnv();

const CONFIG_FILE = path.join(ROOT_DIR, "config.json");
const DATA_DIR = path.join(ROOT_DIR, "data");
const THUMBS_DIR = path.join(DATA_DIR, "thumbs");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const PROGRESS_FILE = path.join(DATA_DIR, "progress.json");
const NOTES_FILE = path.join(DATA_DIR, "notes.json");
const FAVORITES_FILE = path.join(DATA_DIR, "favorites.json");
const META_CACHE_FILE = path.join(DATA_DIR, "meta-cache.json");
const META_TOKEN_FILE = path.join(DATA_DIR, "meta-token.json");
const WORKSPACE_FILE = path.join(DATA_DIR, "workspace.json");

// Load config early to use in constants
let config = {
  port: 3000,
  videosDir: "./videos",
  remoteVideosUrl: process.env.REMOTE_VIDEOS_URL || "",
  allowedExtensions: [".mp4", ".mkv", ".webm", ".avi", ".mov", ".m4v"],
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
      config = { ...config, ...data };
    }
  } catch (err) {
    console.error("Erro ao ler config.json:", err.message);
  }
}
loadConfig();

const PORT = process.env.PORT || config.port || 3000;
const IS_PROD = process.env.NODE_ENV === "production";
const PROTOCOL = IS_PROD ? "https" : "http";

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";
const META_APP_ID = process.env.META_APP_ID || "";
const META_APP_SECRET = process.env.META_APP_SECRET || "";
const META_REDIRECT_URI =
  process.env.META_REDIRECT_URI ||
  `${PROTOCOL}://localhost:${PORT}/auth/callback`;
const META_OAUTH_SCOPES = process.env.META_OAUTH_SCOPES || "ads_read";
// Atualiza o token long-lived quando faltar menos que isso para expirar.
const META_TOKEN_REFRESH_THRESHOLD_MS = 10 * 24 * 60 * 60 * 1000; // 10 dias
const GOOGLE_ANALYTICS_SCOPE =
  "https://www.googleapis.com/auth/analytics.readonly";
const DEFAULT_GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID || "553354770";
const PUBLIC_DIR = path.join(ROOT_DIR, "public");

// Ensure directories exist
[DATA_DIR, THUMBS_DIR, PUBLIC_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Helper to read / write JSON safely
function readJSON(file, defaultVal = {}) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    }
  } catch (e) {
    console.error(`Erro ao ler ${file}:`, e.message);
  }
  return defaultVal;
}

function writeJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.error(`Erro ao escrever em ${file}:`, e.message);
  }
}

// Memory caches
let progressData = readJSON(PROGRESS_FILE, { lastVideoId: null, videos: {} });
let settingsData = readJSON(SETTINGS_FILE, {
  theme: "dark",
  accentColor: "indigo",
  autoPlayNext: true,
  playbackSpeed: 1,
  volume: 1,
  sidebarCollapsed: false,
});
let notesData = readJSON(NOTES_FILE, []);
let favoritesData = readJSON(FAVORITES_FILE, []);
let metaCache = readJSON(META_CACHE_FILE, {});
let metaTokenStore = readJSON(META_TOKEN_FILE, null); // { access_token, expires_at, obtained_at }
let metaOAuthState = null; // CSRF state em memória (uso local, um único usuário)
let metaRefreshInFlight = null; // evita corridas de refresh simultâneas
let workspaceData = readJSON(WORKSPACE_FILE, {
  clients: [],
  campaigns: [],
  documents: [],
  reports: [],
});
workspaceData.reports ||= [];

function saveWorkspace() {
  writeJSON(WORKSPACE_FILE, workspaceData);
}

function createWorkspaceId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function saveMetaTokenStore(data) {
  metaTokenStore = data;
  writeJSON(META_TOKEN_FILE, metaTokenStore);
}

function getMetaAccessToken() {
  // Prioridade: token obtido via OAuth (armazenado em data/meta-token.json).
  // Cai para META_ACCESS_TOKEN do .env apenas se ainda não houver conexão feita.
  if (metaTokenStore?.access_token) return metaTokenStore.access_token;
  return process.env.META_ACCESS_TOKEN || "";
}

function getMetaTokenExpiresAt() {
  return metaTokenStore?.expires_at || null;
}

function isMetaOAuthConfigured() {
  return Boolean(META_APP_ID && META_APP_SECRET);
}

// Troca um token (código de autorização ou token de curta duração) por um
// long-lived token (~60 dias) usando o endpoint oficial da Meta.
async function exchangeForLongLivedToken(shortLivedToken) {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: META_APP_ID,
    client_secret: META_APP_SECRET,
    fb_exchange_token: shortLivedToken,
  });
  const response = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token?${params}`,
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    const error = new Error(
      payload.error?.message || "Falha ao obter long-lived token da Meta",
    );
    error.meta = payload.error || payload;
    throw error;
  }
  return payload; // { access_token, token_type, expires_in }
}

// Renova o token atual chamando novamente o fb_exchange_token com o próprio
// long-lived token. A Meta permite isso enquanto o token ainda for válido,
// estendendo a expiração por mais ~60 dias — é isso que evita ter que voltar
// ao painel do Facebook e copiar um token novo manualmente.
async function refreshMetaTokenIfNeeded() {
  if (!metaTokenStore?.access_token || !isMetaOAuthConfigured()) return;
  const expiresAt = metaTokenStore.expires_at;
  const needsRefresh =
    !expiresAt || expiresAt - Date.now() < META_TOKEN_REFRESH_THRESHOLD_MS;
  if (!needsRefresh) return;

  if (metaRefreshInFlight) return metaRefreshInFlight;
  metaRefreshInFlight = (async () => {
    try {
      const result = await exchangeForLongLivedToken(
        metaTokenStore.access_token,
      );
      saveMetaTokenStore({
        access_token: result.access_token,
        token_type: result.token_type || "bearer",
        obtained_at: new Date().toISOString(),
        expires_at: Date.now() + (result.expires_in || 5184000) * 1000,
      });
      console.log(
        `✅ Token da Meta renovado automaticamente. Válido até ${new Date(metaTokenStore.expires_at).toLocaleString("pt-BR")}`,
      );
    } catch (err) {
      console.error(
        "⚠️  Não foi possível renovar o token da Meta automaticamente:",
        err.message,
      );
    } finally {
      metaRefreshInFlight = null;
    }
  })();
  return metaRefreshInFlight;
}

// Verificação periódica em background, além da checagem feita a cada request.
setInterval(
  () => {
    refreshMetaTokenIfNeeded().catch(() => {});
  },
  6 * 60 * 60 * 1000, // a cada 6h
).unref();

async function fetchMeta(pathname, query = {}) {
  await refreshMetaTokenIfNeeded();
  const token = getMetaAccessToken();
  if (!token) {
    const error = new Error(
      "Nenhum token da Meta configurado. Conecte sua conta em /auth/meta/login ou defina META_ACCESS_TOKEN no .env",
    );
    error.statusCode = 503;
    throw error;
  }

  const params = new URLSearchParams({ ...query, access_token: token });
  const response = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}${pathname}?${params}`,
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    const error = new Error(
      payload.error?.message ||
        `Meta Graph API retornou HTTP ${response.status}`,
    );
    error.statusCode = response.status;
    error.meta = payload.error || payload;
    throw error;
  }
  return payload;
}

function getGoogleServiceAccount() {
  const keyFilename =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(ROOT_DIR, "credentials", "ga4-api-123456.json");
  if (!fs.existsSync(keyFilename)) {
    const error = new Error(
      `Arquivo da service account não encontrado: ${keyFilename}`,
    );
    error.statusCode = 503;
    throw error;
  }
  return new GoogleAuth({ keyFilename, scopes: [GOOGLE_ANALYTICS_SCOPE] });
}

async function fetchGoogleAnalytics(propertyId, body) {
  const auth = getGoogleServiceAccount();
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();
  const token =
    typeof accessToken === "string" ? accessToken : accessToken.token;
  if (!token) {
    const error = new Error(
      "A service account não retornou um token de acesso",
    );
    error.statusCode = 503;
    throw error;
  }
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    const error = new Error(
      payload.error?.message || `GA4 Data API retornou HTTP ${response.status}`,
    );
    error.statusCode = response.status;
    error.meta = payload.error || payload;
    throw error;
  }
  return payload;
}

// Helper function to clean lesson and module titles by removing leading numbering
function cleanTitle(rawName) {
  if (!rawName) return "";
  // Remove file extension
  let name = rawName.replace(/\.[a-zA-Z0-9]+$/, "");

  // Remove leading numbers, decimals, module/lesson codes like:
  // "0.0 Como tirar o melhor proveito" -> "Como tirar o melhor proveito"
  // "0 Relatórios os simplificadores" -> "Relatórios os simplificadores"
  // "0 Leilão - o algoritmo do tráfego pago" -> "Leilão - o algoritmo do tráfego pago"
  // "1 Lance" -> "Lance"
  // "01 - Introdução" -> "Introdução"
  // "M001 - Princípios Gerais" -> "Princípios Gerais"
  // "Aula 05 - Teste" -> "Teste"
  // "1.2 O Funil de Vendas" -> "O Funil de Vendas"
  const cleaned = name
    .replace(
      /^(?:(?:m[oó]dulo|aula|li[cç][aã]o|ep(?:is[oó]dio)?|cap(?:[ií]tulo)?|m)?\s*\d+(?:[\.\-_]\d+)*\s*[-–—:]*\s*)+/i,
      "",
    )
    .trim();

  return cleaned || name;
}

// Clean module titles
function cleanModuleTitle(rawModule) {
  if (!rawModule) return "Módulo Principal";
  let clean = cleanTitle(rawModule);
  return clean || rawModule;
}

// Extract natural sort key from title
function getSortKey(str) {
  return str.replace(/(\d+)/g, (n) => n.padStart(6, "0")).toLowerCase();
}

// Get absolute path of videos directory
function getVideosAbsDir() {
  if (path.isAbsolute(config.videosDir)) {
    return config.videosDir;
  }
  return path.resolve(ROOT_DIR, config.videosDir);
}

// Recursive directory scan
function scanDirectory(dir, baseDir = dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results = results.concat(scanDirectory(fullPath, baseDir));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (config.allowedExtensions.includes(ext)) {
          const relPath = path.relative(baseDir, fullPath).replace(/\\/g, "/");
          const parts = relPath.split("/");

          let courseName = "Curso Principal";
          let moduleName = "Módulo 1";
          let lessonFileName = entry.name;

          if (parts.length >= 3) {
            courseName = parts[0];
            moduleName = parts[1];
            lessonFileName = parts.slice(2).join(" - ");
          } else if (parts.length === 2) {
            courseName = "Curso Principal";
            moduleName = parts[0];
            lessonFileName = parts[1];
          } else {
            courseName = "Curso Principal";
            moduleName = "Aulas Gerais";
            lessonFileName = parts[0];
          }

          const id = relPath;
          const cleanedTitle = cleanTitle(lessonFileName);
          const cleanedModule = cleanModuleTitle(moduleName);
          const cleanedCourse = cleanTitle(courseName);

          results.push({
            id,
            fullPath,
            fileName: entry.name,
            rawTitle: lessonFileName.replace(/\.[a-zA-Z0-9]+$/, ""),
            cleanTitle: cleanedTitle,
            course: courseName,
            cleanCourse: cleanedCourse,
            module: moduleName,
            cleanModule: cleanedModule,
            ext,
            size: fs.statSync(fullPath).size,
            mtime: fs.statSync(fullPath).mtimeMs,
            sortKey: getSortKey(relPath),
          });
        }
      }
    }
  } catch (e) {
    console.error("Erro ao escanear diretório:", e.message);
  }
  return results;
}

// Get list of courses with hierarchy
function getCoursesData() {
  const vDir = getVideosAbsDir();
  const allVideos = scanDirectory(vDir);

  // Sort videos naturally
  allVideos.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  // Group by Course -> Module -> Lessons
  const coursesMap = new Map();

  for (const video of allVideos) {
    if (!coursesMap.has(video.course)) {
      coursesMap.set(video.course, {
        id: video.course,
        title: video.course,
        cleanTitle: video.cleanCourse,
        modulesMap: new Map(),
        totalVideos: 0,
        completedVideos: 0,
      });
    }
    const cData = coursesMap.get(video.course);
    cData.totalVideos++;

    if (!cData.modulesMap.has(video.module)) {
      cData.modulesMap.set(video.module, {
        id: `${video.course}/${video.module}`,
        title: video.module,
        cleanTitle: video.cleanModule,
        courseId: video.course,
        videos: [],
        totalVideos: 0,
        completedVideos: 0,
      });
    }
    const mData = cData.modulesMap.get(video.module);
    mData.totalVideos++;

    const progress =
      (progressData.videos && progressData.videos[video.id]) || null;
    const isCompleted = !!(progress && progress.completed);
    if (isCompleted) {
      cData.completedVideos++;
      mData.completedVideos++;
    }

    const isFavorite =
      Array.isArray(favoritesData) && favoritesData.includes(video.id);
    const videoNotes = (notesData || []).filter((n) => n.videoId === video.id);

    // Se houver um prefixo/URL base remoto configurado (CDN, S3, R2, etc.), usa a URL remota
    const videoUrl =
      config.remoteVideosUrl && config.remoteVideosUrl.trim() !== ""
        ? `${config.remoteVideosUrl.replace(/\/$/, "")}/${video.id}`
        : `/api/video?id=${encodeURIComponent(video.id)}`;

    mData.videos.push({
      id: video.id,
      fileName: video.fileName,
      cleanTitle: video.cleanTitle,
      rawTitle: video.rawTitle,
      course: video.course,
      cleanCourse: video.cleanCourse,
      module: video.module,
      cleanModule: video.cleanModule,
      ext: video.ext,
      size: video.size,
      progress: progress || {
        currentTime: 0,
        duration: 0,
        percentage: 0,
        completed: false,
      },
      isCompleted,
      isFavorite,
      notesCount: videoNotes.length,
      videoUrl,
      thumbUrl: `/api/thumbnail?id=${encodeURIComponent(video.id)}`,
    });
  }

  // Convert maps to array
  const courses = [];
  for (const c of coursesMap.values()) {
    const modules = [];
    for (const m of c.modulesMap.values()) {
      modules.push({
        id: m.id,
        title: m.title,
        cleanTitle: m.cleanTitle,
        totalVideos: m.totalVideos,
        completedVideos: m.completedVideos,
        percentage:
          m.totalVideos > 0
            ? Math.round((m.completedVideos / m.totalVideos) * 100)
            : 0,
        videos: m.videos,
      });
    }
    courses.push({
      id: c.id,
      title: c.title,
      cleanTitle: c.cleanTitle,
      totalVideos: c.totalVideos,
      completedVideos: c.completedVideos,
      percentage:
        c.totalVideos > 0
          ? Math.round((c.completedVideos / c.totalVideos) * 100)
          : 0,
      modules,
    });
  }

  return {
    courses,
    totalCourses: courses.length,
    totalVideos: allVideos.length,
    lastVideoId: progressData.lastVideoId,
    settings: settingsData,
  };
}

// Generate an SVG placeholder thumbnail if ffmpeg is not present
function generateFallbackThumbSVG(title) {
  const safeTitle = (title || "Vídeo Aula")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="640" height="360" viewBox="0 0 640 360" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="50%" stop-color="#1e1b4b"/>
      <stop offset="100%" stop-color="#064e3b"/>
    </linearGradient>
    <linearGradient id="circleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#10b981"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="12" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>
  <rect width="640" height="360" fill="url(#bgGrad)"/>
  <rect x="12" y="12" width="616" height="336" rx="12" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>
  
  <!-- Subtle tech grid -->
  <path d="M 0 120 L 640 120 M 0 240 L 640 240 M 160 0 L 160 360 M 320 0 L 320 360 M 480 0 L 480 360" stroke="rgba(255,255,255,0.03)" stroke-width="1"/>
  
  <!-- Play Button Circle -->
  <circle cx="320" cy="165" r="44" fill="url(#circleGrad)" filter="url(#glow)" opacity="0.9"/>
  <circle cx="320" cy="165" r="40" fill="#0b0f19" opacity="0.75"/>
  <polygon points="312,148 335,165 312,182" fill="#ffffff"/>
  
  <!-- Title Badge -->
  <rect x="40" y="275" width="560" height="46" rx="8" fill="rgba(10, 15, 29, 0.85)" stroke="rgba(255,255,255,0.1)"/>
  <text x="320" y="304" fill="#f1f5f9" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="600" text-anchor="middle">
    ${safeTitle.length > 55 ? safeTitle.slice(0, 52) + "..." : safeTitle}
  </text>
</svg>`;
}

// Generate thumbnail via ffmpeg
function generateThumbnail(videoFullPath, thumbPath, callback) {
  const cmd = `ffmpeg -y -i "${videoFullPath}" -frames:v 1 -q:v 2 "${thumbPath}"`;
  exec(cmd, (err) => {
    if (err) {
      const fallbackCmd = `ffmpeg -y -ss 00:00:01 -i "${videoFullPath}" -frames:v 1 -q:v 2 "${thumbPath}"`;
      exec(fallbackCmd, (err2) => {
        callback(err2);
      });
    } else {
      callback(null);
    }
  });
}

// Format seconds into HH:MM:SS or MM:SS
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

// HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // CORS and base headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Range");

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Parse JSON helper
  function parseJSONBody(cb) {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) {
        // 10MB limit (for base64 thumb uploads)
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Payload too large" }));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        cb(null, parsed);
      } catch (err) {
        cb(err);
      }
    });
  }

  // -------------------------------------------------------------
  // META OAUTH (login manual + auto-renovação do token)
  // -------------------------------------------------------------

  // GET /auth/meta/login - inicia o fluxo OAuth com o Facebook/Meta
  if (pathname === "/auth/meta/login" && method === "GET") {
    if (!isMetaOAuthConfigured()) {
      res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        "<h2>META_APP_ID / META_APP_SECRET não configurados no .env</h2>",
      );
      return;
    }
    metaOAuthState = crypto.randomBytes(16).toString("hex");
    const params = new URLSearchParams({
      client_id: META_APP_ID,
      redirect_uri: META_REDIRECT_URI,
      state: metaOAuthState,
      scope: META_OAUTH_SCOPES,
      response_type: "code",
    });
    res.writeHead(302, {
      Location: `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?${params}`,
    });
    res.end();
    return;
  }

  // GET /auth/callback - recebe o "code" de volta da Meta e troca por um
  // long-lived token, salvando em data/meta-token.json
  if (pathname === "/auth/callback" && method === "GET") {
    const { code, state, error, error_description } = parsedUrl.query;
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });

    if (error) {
      res.end(
        `<h2>Conexão cancelada</h2><p>${error_description || error}</p><a href="/">Voltar</a>`,
      );
      return;
    }
    if (!code || !state || state !== metaOAuthState) {
      res.end(
        `<h2>Requisição inválida (state divergente)</h2><a href="/auth/meta/login">Tentar novamente</a>`,
      );
      return;
    }
    metaOAuthState = null;

    try {
      // 1) troca o "code" por um token de curta duração
      const codeParams = new URLSearchParams({
        client_id: META_APP_ID,
        redirect_uri: META_REDIRECT_URI,
        client_secret: META_APP_SECRET,
        code,
      });
      const shortLivedResp = await fetch(
        `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token?${codeParams}`,
      );
      const shortLivedPayload = await shortLivedResp.json().catch(() => ({}));
      if (!shortLivedResp.ok || shortLivedPayload.error) {
        throw new Error(
          shortLivedPayload.error?.message ||
            "Falha ao trocar o code pelo token inicial",
        );
      }

      // 2) troca o token de curta duração por um long-lived (~60 dias)
      const longLived = await exchangeForLongLivedToken(
        shortLivedPayload.access_token,
      );
      saveMetaTokenStore({
        access_token: longLived.access_token,
        token_type: longLived.token_type || "bearer",
        obtained_at: new Date().toISOString(),
        expires_at: Date.now() + (longLived.expires_in || 5184000) * 1000,
      });

      res.end(
        `<h2>✅ Conta da Meta conectada com sucesso!</h2><p>O token foi salvo e será renovado automaticamente. Pode fechar esta aba e voltar ao Video Hub.</p><a href="/">Voltar ao Video Hub</a>`,
      );
    } catch (err) {
      res.end(
        `<h2>Erro ao conectar</h2><p>${err.message}</p><a href="/auth/meta/login">Tentar novamente</a>`,
      );
    }
    return;
  }

  // -------------------------------------------------------------
  // API ROUTES
  // -------------------------------------------------------------

  // GET /api/videos - Return all courses, modules, and lessons
  if (pathname === "/api/videos" && method === "GET") {
    const data = getCoursesData();
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(data));
    return;
  }

  // POST /api/rescan - Force rescan
  if (pathname === "/api/rescan" && method === "POST") {
    metaCache = {};
    writeJSON(META_CACHE_FILE, metaCache);
    const data = getCoursesData();
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        success: true,
        message: "Diretório reescaneado com sucesso",
        data,
      }),
    );
    return;
  }

  // GET /api/video?id=... - Stream video with HTTP Range Requests
  if (pathname === "/api/video" && method === "GET") {
    const videoId = parsedUrl.query.id;
    if (!videoId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "ID do vídeo não especificado" }));
      return;
    }

    const vDir = getVideosAbsDir();
    const fullPath = path.resolve(vDir, videoId);

    // Security check: ensure path is within videos directory
    if (!fullPath.startsWith(vDir) || !fs.existsSync(fullPath)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Arquivo de vídeo não encontrado" }));
      return;
    }

    const stat = fs.statSync(fullPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    const ext = path.extname(fullPath).toLowerCase();
    const mimeTypes = {
      ".mp4": "video/mp4",
      ".mkv": "video/mp4", // Most browsers play h264 inside mkv container as video/mp4
      ".webm": "video/webm",
      ".mov": "video/quicktime",
      ".avi": "video/x-msvideo",
      ".m4v": "video/mp4",
    };
    const contentType = mimeTypes[ext] || "video/mp4";

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        res.writeHead(416, {
          "Content-Range": `bytes */${fileSize}`,
          "Content-Type": contentType,
        });
        res.end();
        return;
      }

      const chunksize = end - start + 1;
      const fileStream = fs.createReadStream(fullPath, { start, end });

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": contentType,
        "Cache-Control": "no-cache",
      });
      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
      });
      fs.createReadStream(fullPath).pipe(res);
    }
    return;
  }

  // GET /api/thumbnail?id=... - Serve thumbnail or generate on-the-fly
  if (pathname === "/api/thumbnail" && method === "GET") {
    const videoId = parsedUrl.query.id;
    if (!videoId) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("ID não fornecido");
      return;
    }

    const hash = crypto.createHash("md5").update(videoId).digest("hex");
    const thumbFile = path.join(THUMBS_DIR, `${hash}.jpg`);

    // Check if thumbnail image already exists
    if (fs.existsSync(thumbFile)) {
      res.writeHead(200, {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400",
      });
      fs.createReadStream(thumbFile).pipe(res);
      return;
    }

    // Try generating with ffmpeg
    const vDir = getVideosAbsDir();
    const fullPath = path.resolve(vDir, videoId);

    if (fs.existsSync(fullPath)) {
      generateThumbnail(fullPath, thumbFile, (err) => {
        if (!err && fs.existsSync(thumbFile)) {
          res.writeHead(200, {
            "Content-Type": "image/jpeg",
            "Cache-Control": "public, max-age=86400",
          });
          fs.createReadStream(thumbFile).pipe(res);
        } else {
          // Serve dynamic SVG fallback
          const rawName = path.basename(videoId);
          const cleaned = cleanTitle(rawName);
          const svg = generateFallbackThumbSVG(cleaned);
          res.writeHead(200, {
            "Content-Type": "image/svg+xml; charset=utf-8",
          });
          res.end(svg);
        }
      });
      return;
    }

    // Fallback if video file doesn't exist
    const rawName = path.basename(videoId);
    const cleaned = cleanTitle(rawName);
    const svg = generateFallbackThumbSVG(cleaned);
    res.writeHead(200, { "Content-Type": "image/svg+xml; charset=utf-8" });
    res.end(svg);
    return;
  }

  // POST /api/thumbnail/upload - Client canvas-captured thumbnail upload
  if (pathname === "/api/thumbnail/upload" && method === "POST") {
    parseJSONBody((err, data) => {
      if (err || !data.videoId || !data.imageBase64) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Dados inválidos" }));
        return;
      }
      const hash = crypto.createHash("md5").update(data.videoId).digest("hex");
      const thumbFile = path.join(THUMBS_DIR, `${hash}.jpg`);
      const base64Data = data.imageBase64.replace(
        /^data:image\/\w+;base64,/,
        "",
      );
      try {
        fs.writeFileSync(thumbFile, Buffer.from(base64Data, "base64"));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: true,
            thumbUrl: `/api/thumbnail?id=${encodeURIComponent(data.videoId)}`,
          }),
        );
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // GET & POST /api/progress - Watch progress
  if (pathname === "/api/progress") {
    if (method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(progressData));
      return;
    }
    if (method === "POST") {
      parseJSONBody((err, data) => {
        if (err || !data.videoId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "videoId é obrigatório" }));
          return;
        }

        if (!progressData.videos) progressData.videos = {};

        const videoId = data.videoId;
        const duration = parseFloat(data.duration) || 0;
        const currentTime = parseFloat(data.currentTime) || 0;
        let percentage =
          duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
        if (percentage > 100) percentage = 100;

        const previousProgress = progressData.videos[videoId];
        let completed =
          typeof data.completed === "boolean"
            ? data.completed
            : !!previousProgress?.completed;
        // Auto complete if watched 90% or more
        if (percentage >= 90) {
          completed = true;
        }

        progressData.lastVideoId = videoId;
        progressData.videos[videoId] = {
          currentTime,
          duration,
          percentage,
          completed,
          lastWatchedAt: new Date().toISOString(),
        };

        writeJSON(PROGRESS_FILE, progressData);

        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(
          JSON.stringify({
            success: true,
            progress: progressData.videos[videoId],
          }),
        );
      });
      return;
    }
  }

  // /api/notes - CRUD for lesson notes
  if (pathname === "/api/notes" || pathname.startsWith("/api/notes/")) {
    // GET /api/notes/export - Export notes as Markdown
    if (pathname === "/api/notes/export" && method === "GET") {
      const coursesData = getCoursesData();
      let md = `# Anotações de Aulas - Video Hub\n\n*Exportado em: ${new Date().toLocaleString("pt-BR")}*\n\n---\n\n`;

      const videoMap = new Map();
      coursesData.courses.forEach((c) => {
        c.modules.forEach((m) => {
          m.videos.forEach((v) => {
            videoMap.set(v.id, v);
          });
        });
      });

      // Group notes by video
      const notesByVideo = {};
      notesData.forEach((note) => {
        if (!notesByVideo[note.videoId]) notesByVideo[note.videoId] = [];
        notesByVideo[note.videoId].push(note);
      });

      for (const [vId, vNotes] of Object.entries(notesByVideo)) {
        const video = videoMap.get(vId) || {
          cleanTitle: vId,
          cleanModule: "Geral",
          cleanCourse: "Curso",
        };
        md += `## 📚 ${video.cleanCourse} > ${video.cleanModule}\n`;
        md += `### 🎬 Aula: ${video.cleanTitle}\n\n`;

        vNotes
          .sort((a, b) => a.timestamp - b.timestamp)
          .forEach((n) => {
            md += `- **[${n.timestampFormatted || formatTime(n.timestamp)}]**: ${n.text}\n`;
            if (n.createdAt) {
              md += `  *(${new Date(n.createdAt).toLocaleDateString("pt-BR")})*\n`;
            }
          });
        md += `\n---\n\n`;
      }

      res.writeHead(200, {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": 'attachment; filename="anotacoes-aulas.md"',
      });
      res.end(md);
      return;
    }

    if (method === "GET") {
      const videoId = parsedUrl.query.videoId;
      let notes = notesData || [];
      if (videoId) {
        notes = notes.filter((n) => n.videoId === videoId);
      }
      notes.sort((a, b) =>
        (b.createdAt || "").localeCompare(a.createdAt || ""),
      );
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(notes));
      return;
    }

    if (method === "POST") {
      parseJSONBody((err, data) => {
        if (err || !data.videoId || !data.text) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "videoId e text são obrigatórios" }));
          return;
        }
        const ts = parseFloat(data.timestamp) || 0;
        const newNote = {
          id:
            "note_" +
            Date.now() +
            "_" +
            Math.random().toString(36).substring(2, 7),
          videoId: data.videoId,
          timestamp: ts,
          timestampFormatted: formatTime(ts),
          text: data.text.trim(),
          createdAt: new Date().toISOString(),
        };
        notesData.push(newNote);
        writeJSON(NOTES_FILE, notesData);

        res.writeHead(201, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(JSON.stringify(newNote));
      });
      return;
    }

    if (method === "PUT") {
      const noteId = pathname.replace("/api/notes/", "");
      parseJSONBody((err, data) => {
        const note = notesData.find((n) => n.id === noteId);
        if (!note) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Nota não encontrada" }));
          return;
        }
        if (data.text) note.text = data.text.trim();
        if (typeof data.timestamp !== "undefined") {
          note.timestamp = parseFloat(data.timestamp);
          note.timestampFormatted = formatTime(note.timestamp);
        }
        note.updatedAt = new Date().toISOString();
        writeJSON(NOTES_FILE, notesData);

        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(JSON.stringify(note));
      });
      return;
    }

    if (method === "DELETE") {
      const noteId = pathname.replace("/api/notes/", "");
      const idx = notesData.findIndex((n) => n.id === noteId);
      if (idx === -1) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Nota não encontrada" }));
        return;
      }
      notesData.splice(idx, 1);
      writeJSON(NOTES_FILE, notesData);

      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ success: true, message: "Nota removida" }));
      return;
    }
  }

  // /api/favorites
  if (pathname === "/api/favorites") {
    if (method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(favoritesData || []));
      return;
    }
    if (method === "POST") {
      parseJSONBody((err, data) => {
        if (err || !data.videoId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "videoId é obrigatório" }));
          return;
        }
        const vId = data.videoId;
        const isFav = favoritesData.includes(vId);
        if (isFav) {
          favoritesData = favoritesData.filter((id) => id !== vId);
        } else {
          favoritesData.push(vId);
        }
        writeJSON(FAVORITES_FILE, favoritesData);
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(
          JSON.stringify({
            success: true,
            isFavorite: !isFav,
            favorites: favoritesData,
          }),
        );
      });
      return;
    }
  }

  // /api/settings
  if (pathname === "/api/workspace") {
    if (method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(workspaceData));
      return;
    }
    if (method === "POST") {
      parseJSONBody((err, data) => {
        if (err || !data.type || !data.payload) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "type e payload são obrigatórios" }));
          return;
        }

        const collectionMap = {
          client: "clients",
          campaign: "campaigns",
          document: "documents",
          report: "reports",
        };
        const collection = collectionMap[data.type];
        if (!collection) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Tipo de registro inválido" }));
          return;
        }

        const payload = { ...data.payload };
        const id = payload.id || createWorkspaceId(data.type);
        const index = workspaceData[collection].findIndex(
          (item) => item.id === id,
        );
        const record = {
          ...payload,
          id,
          updatedAt: new Date().toISOString(),
          createdAt:
            index >= 0
              ? workspaceData[collection][index].createdAt
              : new Date().toISOString(),
        };

        if (index >= 0) workspaceData[collection][index] = record;
        else workspaceData[collection].push(record);
        saveWorkspace();

        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(
          JSON.stringify({ success: true, record, workspace: workspaceData }),
        );
      });
      return;
    }
  }

  if (pathname.startsWith("/api/workspace/") && method === "DELETE") {
    const [, , , type, id] = pathname.split("/");
    const collectionMap = {
      client: "clients",
      campaign: "campaigns",
      document: "documents",
      report: "reports",
    };
    const collection = collectionMap[type];
    if (!collection) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Tipo de registro inválido" }));
      return;
    }
    workspaceData[collection] = workspaceData[collection].filter(
      (item) => item.id !== id,
    );
    if (type === "client") {
      workspaceData.campaigns = workspaceData.campaigns.filter(
        (item) => item.clientId !== id,
      );
      workspaceData.documents = workspaceData.documents.filter(
        (item) => item.clientId !== id,
      );
    }
    saveWorkspace();
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ success: true, workspace: workspaceData }));
    return;
  }

  // Meta Ads proxy: the access token stays exclusively in the Node process.
  if (pathname === "/api/meta/status" && method === "GET") {
    const expiresAt = getMetaTokenExpiresAt();
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        configured: Boolean(getMetaAccessToken()),
        graphVersion: META_GRAPH_VERSION,
        connectedViaOAuth: Boolean(metaTokenStore?.access_token),
        oauthConfigured: isMetaOAuthConfigured(),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        daysUntilExpiry: expiresAt
          ? Math.max(
              0,
              Math.round((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)),
            )
          : null,
      }),
    );
    return;
  }

  if (pathname === "/api/meta/adaccounts" && method === "GET") {
    try {
      const data = await fetchMeta("/me/adaccounts", {
        fields: "id,name,account_id,currency,timezone_name,account_status",
        limit: "200",
      });
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data));
    } catch (error) {
      res.writeHead(error.statusCode || 502, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(
        JSON.stringify({ error: error.message, details: error.meta || null }),
      );
    }
    return;
  }

  if (pathname === "/api/meta/insights" && method === "GET") {
    const rawAccountId = String(parsedUrl.query.accountId || "").trim();
    if (!/^act_\d+$/.test(rawAccountId)) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({ error: "accountId deve estar no formato act_<ID>" }),
      );
      return;
    }

    const allowedFields = new Set([
      "account_id",
      "account_name",
      "campaign_name",
      "campaign_id",
      "adset_name",
      "adset_id",
      "ad_name",
      "ad_id",
      "date_start",
      "date_stop",
      "impressions",
      "reach",
      "frequency",
      "clicks",
      "unique_clicks",
      "spend",
      "cpm",
      "cpc",
      "ctr",
      "cost_per_unique_click",
      "actions",
      "action_values",
      "cost_per_action_type",
      "purchase_roas",
      "outbound_clicks",
      "conversions",
    ]);
    const requestedFields = String(
      parsedUrl.query.fields ||
        "campaign_name,impressions,reach,frequency,clicks,spend,cpm,cpc,ctr,actions,action_values,purchase_roas,cost_per_action_type",
    )
      .split(",")
      .filter((field) => allowedFields.has(field));
    const query = {
      level: ["account", "campaign", "adset", "ad"].includes(
        parsedUrl.query.level,
      )
        ? parsedUrl.query.level
        : "campaign",
      fields: requestedFields.join(","),
      date_preset: parsedUrl.query.datePreset || "last_30d",
      limit: "500",
    };
    if (parsedUrl.query.timeRange) query.time_range = parsedUrl.query.timeRange;
    try {
      const data = await fetchMeta(`/${rawAccountId}/insights`, query);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data));
    } catch (error) {
      res.writeHead(error.statusCode || 502, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(
        JSON.stringify({ error: error.message, details: error.meta || null }),
      );
    }
    return;
  }

  if (pathname === "/api/ga4/insights" && method === "GET") {
    const rawPropertyId = String(
      parsedUrl.query.propertyId || DEFAULT_GA4_PROPERTY_ID,
    ).trim();
    const propertyId = /^properties\/\d+$/.test(rawPropertyId)
      ? rawPropertyId
      : `properties/${rawPropertyId}`;
    if (!/^properties\/\d+$/.test(propertyId)) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          error:
            "propertyId deve estar no formato 123456789 ou properties/123456789",
        }),
      );
      return;
    }
    const firstDay = new Date();
    firstDay.setDate(1);
    const firstDayIso = firstDay.toISOString().slice(0, 10);
    const allowedDatePresets = {
      last_7d: ["7daysAgo", "yesterday"],
      last_14d: ["14daysAgo", "yesterday"],
      last_30d: ["30daysAgo", "yesterday"],
      this_month: [firstDayIso, "today"],
    };
    const range = allowedDatePresets[parsedUrl.query.datePreset] || [
      "7daysAgo",
      "yesterday",
    ];
    const body = {
      dateRanges: [{ startDate: range[0], endDate: range[1] }],
      metrics: [
        { name: "sessions" },
        { name: "conversions" },
        { name: "activeUsers" },
        { name: "totalUsers" },
        { name: "newUsers" },
        { name: "screenPageViews" },
        { name: "engagementRate" },
        { name: "bounceRate" },
        { name: "userEngagementDuration" },
        { name: "averageSessionDuration" },
        { name: "eventCount" },
      ],
      dimensions: [
        { name: "date" },
        { name: "sessionDefaultChannelGroup" },
        { name: "sessionSourceMedium" },
        { name: "sessionCampaignName" },
        { name: "country" },
        { name: "city" },
      ],
    };
    try {
      const data = await fetchGoogleAnalytics(propertyId, body);
      const dimensionHeaders = (data.dimensionHeaders || []).map(
        (header) => header.name,
      );
      const metricHeaders = (data.metricHeaders || []).map(
        (header) => header.name,
      );
      const rows = (data.rows || []).map((row) => {
        const dimensions = Object.fromEntries(
          dimensionHeaders.map((name, index) => [
            name,
            row.dimensionValues?.[index]?.value || "",
          ]),
        );
        const metrics = Object.fromEntries(
          metricHeaders.map((name, index) => [
            name,
            Number(row.metricValues?.[index]?.value || 0),
          ]),
        );
        return { ...dimensions, ...metrics };
      });
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          propertyId,
          datePreset: parsedUrl.query.datePreset || "last_7d",
          timezone: data.metadata?.timeZone || null,
          currency: data.metadata?.currencyCode || null,
          data: rows,
          rows: data.rows || [],
        }),
      );
    } catch (error) {
      res.writeHead(error.statusCode || 502, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(
        JSON.stringify({ error: error.message, details: error.meta || null }),
      );
    }
    return;
  }

  // /api/settings
  if (pathname === "/api/settings") {
    if (method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(settingsData));
      return;
    }
    if (method === "POST") {
      parseJSONBody((err, data) => {
        settingsData = { ...settingsData, ...data };
        writeJSON(SETTINGS_FILE, settingsData);
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(JSON.stringify({ success: true, settings: settingsData }));
      });
      return;
    }
  }

  // /api/config
  if (pathname === "/api/config") {
    if (method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          ...config,
          videosAbsDir: getVideosAbsDir(),
          videosExist: fs.existsSync(getVideosAbsDir()),
        }),
      );
      return;
    }
    if (method === "POST") {
      parseJSONBody((err, data) => {
        if (typeof data.videosDir === "string") {
          config.videosDir = data.videosDir;
        }
        if (typeof data.remoteVideosUrl === "string") {
          config.remoteVideosUrl = data.remoteVideosUrl.trim();
        }
        if (data.port) {
          config.port = parseInt(data.port, 10) || config.port;
        }
        writeJSON(CONFIG_FILE, config);
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(JSON.stringify({ success: true, config }));
      });
      return;
    }
  }

  // -------------------------------------------------------------
  // STATIC FILES (public/)
  // -------------------------------------------------------------
  let filePath = "";
  if (pathname === "/" || pathname === "/index.html") {
    filePath = path.join(PUBLIC_DIR, "index.html");
  } else {
    // If request starts with /public/, strip it
    const cleanPath = pathname.replace(/^\/public\//, "");
    filePath = path.join(PUBLIC_DIR, cleanPath);
  }

  // Prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Acesso negado");
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".svg": "image/svg+xml; charset=utf-8",
      ".ico": "image/x-icon",
      ".woff2": "font/woff2",
      ".woff": "font/woff",
      ".ttf": "font/ttf",
    };
    const contentType = mimeTypes[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // 404 fallback
  res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
  res.end(
    JSON.stringify({ error: "Rota ou arquivo não encontrado", path: pathname }),
  );
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  🚀 VIDEO HUB LOCAL PRO 2.0`);
  console.log(`  🔗 Servidor rodando em: http://localhost:${PORT}`);
  console.log(`  📁 Diretório de vídeos: ${getVideosAbsDir()}`);
  console.log(`  🔑 Meta Redirect URI: ${META_REDIRECT_URI}`);
  console.log(`======================================================\n`);
});
