const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const crypto = require("crypto");
const { exec } = require("child_process");
const { GoogleAuth } = require("google-auth-library");
const { createClient } = require("@supabase/supabase-js");
const {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  PutBucketCorsCommand,
} = require("@aws-sdk/client-s3");

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

// --- Cloudflare R2 (usado quando os vídeos não estão mais no disco local, ex.: Vercel) ---
function isR2Configured() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME &&
      process.env.R2_PUBLIC_URL,
  );
}

function getR2Client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

// Lista os objetos do bucket R2 e devolve no mesmo formato que scanDirectory()
// produz para arquivos locais, para que getCoursesData() possa usar qualquer um dos dois.
async function scanR2Videos() {
  const s3 = getR2Client();
  const results = [];
  let ContinuationToken;

  do {
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: process.env.R2_BUCKET_NAME,
        ContinuationToken,
      }),
    );
    for (const obj of response.Contents || []) {
      const ext = path.extname(obj.Key).toLowerCase();
      if (!config.allowedExtensions.includes(ext)) continue;

      const parts = obj.Key.split("/");
      let courseName = "Curso Principal";
      let moduleName = "Aulas Gerais";
      let lessonFileName = parts[parts.length - 1];

      if (parts.length >= 3) {
        courseName = parts[0];
        moduleName = parts[1];
        lessonFileName = parts.slice(2).join(" - ");
      } else if (parts.length === 2) {
        moduleName = parts[0];
        lessonFileName = parts[1];
      }

      results.push({
        id: obj.Key,
        fileName: parts[parts.length - 1],
        rawTitle: lessonFileName.replace(/\.[a-zA-Z0-9]+$/, ""),
        cleanTitle: cleanTitle(lessonFileName),
        course: courseName,
        cleanCourse: cleanTitle(courseName),
        module: moduleName,
        cleanModule: cleanModuleTitle(moduleName),
        ext,
        size: obj.Size || 0,
        mtime: obj.LastModified ? new Date(obj.LastModified).getTime() : 0,
        sortKey: getSortKey(obj.Key),
        remoteUrl: `${process.env.R2_PUBLIC_URL.replace(/\/$/, "")}/${encodeURI(obj.Key)}`,
      });
    }
    ContinuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (ContinuationToken);

  return results;
}

// Verifica se já existe uma thumbnail salva no R2 para esse vídeo.
// Retorna a URL pública se existir, ou null se não existir ainda.
async function getR2ThumbUrl(hash) {
  const key = `thumbs/${hash}.jpg`;
  try {
    await getR2Client().send(
      new HeadObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }),
    );
    return `${process.env.R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  } catch (e) {
    return null; // não existe ainda (ou erro de acesso) — segue com o fallback
  }
}

// Salva a thumbnail capturada pelo navegador no R2, na pasta thumbs/.
async function uploadR2Thumb(hash, buffer) {
  const key = `thumbs/${hash}.jpg`;
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: "image/jpeg",
    }),
  );
}

// Lista todos os hashes de thumbnails já salvos no R2 (uma única chamada,
// em vez de um HEAD por vídeo) para o front saber quais vídeos ainda
// precisam ter a thumbnail gerada automaticamente.
async function listR2ThumbHashes() {
  const s3 = getR2Client();
  const hashes = new Set();
  let ContinuationToken;
  do {
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: process.env.R2_BUCKET_NAME,
        Prefix: "thumbs/",
        ContinuationToken,
      }),
    );
    for (const obj of response.Contents || []) {
      const name = obj.Key.slice("thumbs/".length).replace(/\.jpg$/, "");
      if (name) hashes.add(name);
    }
    ContinuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (ContinuationToken);
  return hashes;
}

// O canvas usado para capturar o primeiro frame do vídeo no navegador só
// consegue ler os pixels (toDataURL) se o <video> tiver sido carregado em
// modo CORS. Isso exige que o bucket R2 devolva os headers Access-Control-*.
// Sem isso, a captura falha silenciosamente e a thumbnail nunca é salva
// (fica sempre no fundo azul de fallback). Configuramos isso uma vez,
// automaticamente, sem depender do painel da Cloudflare.
let r2CorsEnsured = false;
async function ensureR2CorsConfigured() {
  if (r2CorsEnsured || !isR2Configured()) return;
  try {
    await getR2Client().send(
      new PutBucketCorsCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: ["*"],
              AllowedMethods: ["GET", "HEAD"],
              AllowedHeaders: ["*"],
              MaxAgeSeconds: 86400,
            },
          ],
        },
      }),
    );
    r2CorsEnsured = true;
  } catch (e) {
    console.error(
      "⚠️  Não foi possível configurar CORS no bucket R2 (thumbnails automáticas podem falhar):",
      e.message,
    );
  }
}

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
// Métricas/dimensões padrão da Data API do GA4 que o construtor de dashboard
// deixa o usuário escolher livremente (evita passar nomes inválidos pra API).
const GA4_ALLOWED_METRICS = new Set([
  "sessions",
  "activeUsers",
  "totalUsers",
  "newUsers",
  "conversions",
  "screenPageViews",
  "screenPageViewsPerSession",
  "engagementRate",
  "engagedSessions",
  "bounceRate",
  "userEngagementDuration",
  "averageSessionDuration",
  "eventCount",
  "eventsPerSession",
  "totalRevenue",
  "purchaseRevenue",
  "transactions",
  "ecommercePurchases",
]);
const GA4_ALLOWED_DIMENSIONS = new Set([
  "date",
  "sessionDefaultChannelGroup",
  "sessionSourceMedium",
  "sessionSource",
  "sessionMedium",
  "sessionCampaignName",
  "country",
  "city",
  "deviceCategory",
  "browser",
  "landingPage",
  "pagePath",
  "pageTitle",
]);
const PUBLIC_DIR = path.join(ROOT_DIR, "public");

// --- Controle de acesso (allowlist) ---
// A chave anônima do Supabase não é secreta (é feita para rodar no navegador);
// a segurança real vem de validar o token do usuário aqui no servidor e
// checar o e-mail contra a lista de autorizados abaixo.
const SUPABASE_URL = process.env.SUPABASE_URL || "https://olofdrngtjktrvgopyun.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || "sb_publishable_5J0eCJlr7nPZcvIpopnhyQ_aHdlFfB4";
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ALLOWED_EMAILS = new Set(
  (
    process.env.ALLOWED_EMAILS ||
    "iagodjcarvalho@gmail.com,iagoderik2223@gmail.com,iagoderik.work@gmail.com"
  )
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

function isEmailAllowed(email) {
  return Boolean(email) && ALLOWED_EMAILS.has(String(email).toLowerCase());
}

// Extrai e valida o token Supabase do request (header Authorization ou,
// para links abertos via navegação direta, um ?token= na própria URL).
async function getAuthenticatedEmail(req, parsedUrl) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : parsedUrl?.query?.token || null;
  if (!token) return null;
  try {
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data?.user?.email) return null;
    return data.user.email.toLowerCase();
  } catch (e) {
    return null;
  }
}

// Rotas de API que continuam públicas mesmo sem login (o próprio app usa
// para decidir se mostra a tela de login/acesso negado ou o site).
function isPublicApiPath(pathname, method) {
  if (pathname === "/api/me") return true;
  if (pathname === "/api/video" && method === "GET") return true;
  if (pathname === "/api/thumbnail" && method === "GET") return true;
  return false;
}

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

// Memory caches (valores padrão; o conteúdo real do R2/disco é carregado de
// forma assíncrona por ensureAppDataLoaded() antes de qualquer request).
let progressData = { lastVideoId: null, videos: {} };
let settingsData = {
  theme: "dark",
  accentColor: "indigo",
  autoPlayNext: true,
  playbackSpeed: 1,
  volume: 1,
  sidebarCollapsed: false,
};
let notesData = [];
let favoritesData = [];
let metaCache = {};
let metaTokenStore = null; // { access_token, expires_at, obtained_at }
let metaRefreshInFlight = null; // evita corridas de refresh simultâneas
let metaTokenLoadPromise = null; // garante que o token salvo no R2 só é lido uma vez por instância
let workspaceData = { clients: [], campaigns: [], documents: [], reports: [] };

async function saveWorkspace() {
  await persistStore("workspace", WORKSPACE_FILE, workspaceData);
}

// Carrega todas as stores (progresso, notas, favoritos, config, cache da
// Meta e workspace) do R2/disco uma única vez por instância serverless.
let appDataLoadPromise = null;
function ensureAppDataLoaded() {
  if (appDataLoadPromise) return appDataLoadPromise;
  appDataLoadPromise = (async () => {
    [progressData, settingsData, notesData, favoritesData, metaCache, workspaceData] =
      await Promise.all([
        loadPersistedStore("progress", PROGRESS_FILE, progressData),
        loadPersistedStore("settings", SETTINGS_FILE, settingsData),
        loadPersistedStore("notes", NOTES_FILE, notesData),
        loadPersistedStore("favorites", FAVORITES_FILE, favoritesData),
        loadPersistedStore("meta-cache", META_CACHE_FILE, metaCache),
        loadPersistedStore("workspace", WORKSPACE_FILE, workspaceData),
      ]);
    workspaceData.reports ||= [];
  })();
  return appDataLoadPromise;
}

function createWorkspaceId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// --- Persistência de dados em ambiente serverless (Vercel) ---
// Em produção o disco é somente leitura (ou efêmero entre invocações), então
// data/*.json nunca sobrevive a um novo request/instância — sem isso, um
// cliente cadastrado, uma anotação ou a conexão com a Meta podiam sumir
// sozinhos. Guardamos uma cópia criptografada no R2 (que já está configurado
// para os vídeos/thumbnails) além do arquivo local (usado em dev). Como o
// bucket tem uma URL pública (R2_PUBLIC_URL), tudo é criptografado antes de
// subir — mesmo que alguém descubra o caminho do objeto, não consegue ler.
const R2_DATA_PREFIX = "_private/data/";

function getDataCipherKey() {
  const secret = META_APP_SECRET || META_APP_ID || "video-hub-data-fallback";
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptForR2(data) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getDataCipherKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(data), "utf8")),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

function decryptFromR2(base64Data) {
  try {
    const raw = Buffer.from(base64Data, "base64");
    const iv = raw.subarray(0, 12);
    const authTag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", getDataCipherKey(), iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString("utf8"));
  } catch (e) {
    return null;
  }
}

async function readEncryptedFromR2(key) {
  try {
    const res = await getR2Client().send(
      new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }),
    );
    const body = await res.Body.transformToString();
    return decryptFromR2(body);
  } catch (e) {
    return null; // ainda não existe
  }
}

async function writeEncryptedToR2(key, data) {
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: encryptForR2(data),
      ContentType: "text/plain",
    }),
  );
}

// Carrega uma "store" de dados (progresso, notas, favoritos, configurações,
// cache da Meta, workspace) do R2 uma única vez por instância — o resultado
// fica em cache na promise, então chamadas seguintes são instantâneas.
const dataLoadPromises = {};
function loadPersistedStore(storeName, localFile, defaultVal) {
  if (dataLoadPromises[storeName]) return dataLoadPromises[storeName];
  dataLoadPromises[storeName] = (async () => {
    if (!isR2Configured()) return readJSON(localFile, defaultVal);
    const remote = await readEncryptedFromR2(`${R2_DATA_PREFIX}${storeName}.enc`);
    return remote !== null ? remote : readJSON(localFile, defaultVal);
  })();
  return dataLoadPromises[storeName];
}

// Salva uma store tanto localmente (dev) quanto no R2 (produção). Sempre
// aguardada antes do response terminar, pois a função serverless pode ser
// congelada logo após o res.end() e uma escrita "solta" nunca completaria.
async function persistStore(storeName, localFile, data) {
  writeJSON(localFile, data); // uso local (dev); no-op silencioso se o disco for read-only
  if (isR2Configured()) {
    try {
      await writeEncryptedToR2(`${R2_DATA_PREFIX}${storeName}.enc`, data);
    } catch (e) {
      console.error(
        `⚠️  Não foi possível salvar "${storeName}" no R2 (pode não sobreviver a uma nova instância):`,
        e.message,
      );
    }
  }
}

// Garante que, ao "acordar" uma nova instância serverless, o token salvo
// anteriormente no R2 seja recuperado antes de decidir que não há conexão.
function ensureMetaTokenLoaded() {
  if (metaTokenLoadPromise) return metaTokenLoadPromise;
  metaTokenLoadPromise = (async () => {
    if (!metaTokenStore) {
      const remote = await loadPersistedStore("meta-token", META_TOKEN_FILE, null);
      if (remote) metaTokenStore = remote;
    }
  })();
  return metaTokenLoadPromise;
}

async function saveMetaTokenStore(data) {
  metaTokenStore = data;
  await persistStore("meta-token", META_TOKEN_FILE, metaTokenStore);
}

function getMetaAccessToken() {
  // Prioridade: token obtido via OAuth (armazenado em data/meta-token.json e/ou no R2).
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

// CSRF do fluxo OAuth sem depender de estado em memória: como cada request
// serverless pode cair numa instância diferente, guardar o "state" numa
// variável global (como antes) fazia o /auth/callback falhar com
// "state divergente" de forma intermitente. Em vez disso, o state é
// auto-verificável: carimbo de tempo + assinatura HMAC com o App Secret.
function createMetaOAuthState() {
  const payload = `${Date.now()}`;
  const sig = crypto
    .createHmac("sha256", META_APP_SECRET || "video-hub-oauth-fallback")
    .update(payload)
    .digest("hex");
  return `${payload}.${sig}`;
}

function isValidMetaOAuthState(state) {
  if (!state || typeof state !== "string") return false;
  const [payload, sig] = state.split(".");
  // Exige exatamente 64 hex chars (tamanho de um HMAC-SHA256 em hex); evita
  // ambiguidade de Buffer.from(..., "hex") truncando lixo à direita inválido.
  if (!payload || !/^[0-9a-f]{64}$/i.test(sig || "")) return false;
  const expectedSig = crypto
    .createHmac("sha256", META_APP_SECRET || "video-hub-oauth-fallback")
    .update(payload)
    .digest("hex");
  const sigBuf = Buffer.from(sig, "hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return false;
  const age = Date.now() - Number(payload);
  return age >= 0 && age < 15 * 60 * 1000; // válido por 15 minutos
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
  await ensureMetaTokenLoaded();
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
      await saveMetaTokenStore({
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

// Configura o CORS do bucket R2 uma vez por instância (necessário para a
// captura automática de thumbnails no navegador via canvas).
ensureR2CorsConfigured().catch(() => {});

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
  // Em produção (Vercel), não há disco persistente para um arquivo de credenciais,
  // então lemos o JSON inteiro da service account de uma variável de ambiente.
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (credentialsJson) {
    let credentials;
    try {
      credentials = JSON.parse(credentialsJson);
    } catch (e) {
      const error = new Error(
        "GOOGLE_SERVICE_ACCOUNT_JSON não é um JSON válido. Confira se colou o conteúdo do arquivo inteiro, sem quebras.",
      );
      error.statusCode = 503;
      throw error;
    }
    return new GoogleAuth({ credentials, scopes: [GOOGLE_ANALYTICS_SCOPE] });
  }

  // Fallback: uso local, lendo o arquivo do disco como antes.
  const keyFilename =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(ROOT_DIR, "credentials", "ga4-api-123456.json");
  if (!fs.existsSync(keyFilename)) {
    const error = new Error(
      `Nenhuma credencial do GA4 encontrada. Defina GOOGLE_SERVICE_ACCOUNT_JSON (produção) ou GOOGLE_APPLICATION_CREDENTIALS (local). Arquivo local esperado: ${keyFilename}`,
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
async function getCoursesData() {
  const r2Configured = isR2Configured();
  const allVideos = r2Configured
    ? await scanR2Videos()
    : scanDirectory(getVideosAbsDir());

  // Usado para o front saber quais vídeos ainda não têm uma thumbnail real
  // (para gerar automaticamente em segundo plano, sem esperar o usuário
  // clicar em play).
  let existingThumbHashes = null;
  if (r2Configured) {
    try {
      existingThumbHashes = await listR2ThumbHashes();
    } catch (e) {
      console.error("Não foi possível listar thumbnails existentes no R2:", e.message);
    }
  }

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

    // Se o vídeo veio do R2 (já traz remoteUrl) ou há um prefixo remoto configurado
    // (CDN, S3, R2, etc.) manualmente, usa a URL remota direto. Senão, serve do disco local.
    const videoUrl =
      video.remoteUrl ||
      (config.remoteVideosUrl && config.remoteVideosUrl.trim() !== ""
        ? `${config.remoteVideosUrl.replace(/\/$/, "")}/${video.id}`
        : `/api/video?id=${encodeURIComponent(video.id)}`);

    const thumbUrl = `/api/thumbnail?id=${encodeURIComponent(video.id)}`;
    const thumbHash = crypto.createHash("md5").update(video.id).digest("hex");
    const hasThumb = existingThumbHashes
      ? existingThumbHashes.has(thumbHash)
      : fs.existsSync(path.join(THUMBS_DIR, `${thumbHash}.jpg`));

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
      thumbUrl,
      hasThumb,
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

  await ensureAppDataLoaded();

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

  // GET /api/me - usado pelo frontend para saber se a sessão logada (Google
  // via Supabase) pertence a alguém autorizado a usar o site.
  if (pathname === "/api/me" && method === "GET") {
    const email = await getAuthenticatedEmail(req, parsedUrl);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ email: email || null, allowed: isEmailAllowed(email) }));
    return;
  }

  // Bloqueia todo o resto da API para quem não estiver logado com um e-mail
  // autorizado. /api/video e /api/thumbnail ficam de fora porque são
  // carregados via <video>/<img src> (sem o header Authorization do fetch).
  if (pathname.startsWith("/api/") && !isPublicApiPath(pathname, method)) {
    const email = await getAuthenticatedEmail(req, parsedUrl);
    if (!isEmailAllowed(email)) {
      res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Acesso não autorizado" }));
      return;
    }
  }

  // Parse JSON helper
  function parseJSONBody(cb) {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20 * 1024 * 1024) {
        // 20MB limit (cobre thumbs em base64 e a maioria dos documentos/PDFs)
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
    const params = new URLSearchParams({
      client_id: META_APP_ID,
      redirect_uri: META_REDIRECT_URI,
      state: createMetaOAuthState(),
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
    if (!code || !isValidMetaOAuthState(state)) {
      res.end(
        `<h2>Requisição inválida ou expirada</h2><p>O link de conexão só é válido por alguns minutos.</p><a href="/auth/meta/login">Tentar novamente</a>`,
      );
      return;
    }

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
      await saveMetaTokenStore({
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
    const data = await getCoursesData();
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(data));
    return;
  }

  // POST /api/rescan - Force rescan
  if (pathname === "/api/rescan" && method === "POST") {
    metaCache = {};
    await persistStore("meta-cache", META_CACHE_FILE, metaCache);
    const data = await getCoursesData();
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

    // Se o R2 estiver configurado, procura a thumbnail lá primeiro
    if (isR2Configured()) {
      const r2ThumbUrl = await getR2ThumbUrl(hash);
      if (r2ThumbUrl) {
        res.writeHead(302, { Location: r2ThumbUrl });
        res.end();
        return;
      }
      // Ainda não foi gerada (vídeo nunca foi assistido) — mostra o SVG com o título
      const rawName = path.basename(videoId);
      const cleaned = cleanTitle(rawName);
      const svg = generateFallbackThumbSVG(cleaned);
      res.writeHead(200, { "Content-Type": "image/svg+xml; charset=utf-8" });
      res.end(svg);
      return;
    }

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
    parseJSONBody(async (err, data) => {
      if (err || !data.videoId || !data.imageBase64) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Dados inválidos" }));
        return;
      }
      const hash = crypto.createHash("md5").update(data.videoId).digest("hex");
      const base64Data = data.imageBase64.replace(
        /^data:image\/\w+;base64,/,
        "",
      );
      const buffer = Buffer.from(base64Data, "base64");

      try {
        if (isR2Configured()) {
          await uploadR2Thumb(hash, buffer);
        } else {
          const thumbFile = path.join(THUMBS_DIR, `${hash}.jpg`);
          fs.writeFileSync(thumbFile, buffer);
        }
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

  // POST /api/documents/upload - Envia um documento do cliente (proposta,
  // contrato, briefing...) para o R2. Ao contrário dos vídeos/thumbs, esses
  // arquivos não são expostos pela URL pública do bucket: só são acessíveis
  // via /api/documents/download, que exige estar logado com e-mail autorizado.
  if (pathname === "/api/documents/upload" && method === "POST") {
    if (!isR2Configured()) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Upload de documentos requer o Cloudflare R2 configurado.",
        }),
      );
      return;
    }
    parseJSONBody(async (err, data) => {
      if (err || !data.fileName || !data.fileBase64) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Dados inválidos" }));
        return;
      }
      const match = /^data:([\w/.+-]+);base64,([\s\S]+)$/.exec(data.fileBase64);
      const contentType = match ? match[1] : "application/octet-stream";
      const base64Data = match ? match[2] : data.fileBase64;
      const buffer = Buffer.from(base64Data, "base64");
      if (buffer.length > 14 * 1024 * 1024) {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Arquivo muito grande (máximo 14MB)" }));
        return;
      }
      const ext = path
        .extname(data.fileName || "")
        .slice(0, 10)
        .replace(/[^a-zA-Z0-9.]/g, "");
      const storageKey = `documents/${crypto.randomUUID()}${ext}`;
      try {
        await getR2Client().send(
          new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: storageKey,
            Body: buffer,
            ContentType: contentType,
          }),
        );
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            storageKey,
            fileName: data.fileName,
            fileSize: buffer.length,
            url: `/api/documents/download?key=${encodeURIComponent(storageKey)}`,
          }),
        );
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // GET /api/documents/download - Baixa um documento (exige sessão
  // autorizada, já garantido pelo bloqueio geral de /api/* acima).
  if (pathname === "/api/documents/download" && method === "GET") {
    const key = String(parsedUrl.query.key || "");
    if (!key.startsWith("documents/")) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Chave inválida" }));
      return;
    }
    try {
      const obj = await getR2Client().send(
        new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }),
      );
      res.writeHead(200, {
        "Content-Type": obj.ContentType || "application/octet-stream",
        "Content-Disposition": "attachment",
      });
      obj.Body.pipe(res);
    } catch (e) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Arquivo não encontrado" }));
    }
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
      parseJSONBody(async (err, data) => {
        if (err || !data.videoId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "videoId é obrigatório" }));
          return;
        }

        // Sentinela usada pelo botão "Zerar Histórico e Progresso".
        if (data.videoId === "__RESET__") {
          progressData = { lastVideoId: null, videos: {} };
          await persistStore("progress", PROGRESS_FILE, progressData);
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(JSON.stringify({ success: true, progress: null }));
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

        await persistStore("progress", PROGRESS_FILE, progressData);

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
      const coursesData = await getCoursesData();
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
      parseJSONBody(async (err, data) => {
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
        await persistStore("notes", NOTES_FILE, notesData);

        res.writeHead(201, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(JSON.stringify(newNote));
      });
      return;
    }

    if (method === "PUT") {
      const noteId = pathname.replace("/api/notes/", "");
      parseJSONBody(async (err, data) => {
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
        await persistStore("notes", NOTES_FILE, notesData);

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
      await persistStore("notes", NOTES_FILE, notesData);

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
      parseJSONBody(async (err, data) => {
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
        await persistStore("favorites", FAVORITES_FILE, favoritesData);
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
      parseJSONBody(async (err, data) => {
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
        await saveWorkspace();

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
    await saveWorkspace();
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ success: true, workspace: workspaceData }));
    return;
  }

  // Meta Ads proxy: the access token stays exclusively in the Node process.
  if (pathname === "/api/meta/status" && method === "GET") {
    await refreshMetaTokenIfNeeded();
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
    const requestedMetrics = String(
      parsedUrl.query.metrics ||
        "sessions,conversions,totalUsers,newUsers,screenPageViews,engagementRate,bounceRate,userEngagementDuration,averageSessionDuration,eventCount",
    )
      .split(",")
      .map((m) => m.trim())
      .filter((m) => GA4_ALLOWED_METRICS.has(m));
    const requestedDimensions = String(
      parsedUrl.query.dimensions ||
        "date,sessionDefaultChannelGroup,sessionSourceMedium,sessionCampaignName,country,city",
    )
      .split(",")
      .map((d) => d.trim())
      .filter((d) => GA4_ALLOWED_DIMENSIONS.has(d));
    if (!requestedMetrics.length) requestedMetrics.push("sessions");
    const body = {
      dateRanges: [{ startDate: range[0], endDate: range[1] }],
      metrics: requestedMetrics.map((name) => ({ name })),
      dimensions: requestedDimensions.map((name) => ({ name })),
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
          metrics: requestedMetrics,
          dimensions: requestedDimensions,
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
      parseJSONBody(async (err, data) => {
        settingsData = { ...settingsData, ...data };
        await persistStore("settings", SETTINGS_FILE, settingsData);
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
