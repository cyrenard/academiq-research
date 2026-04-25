const fs = require('fs');
const http = require('http');
const path = require('path');

const DEFAULT_CAPTURE_PORT = 27183;
const MAX_CAPTURE_PAYLOAD_BYTES = 256 * 1024;
const BROWSER_CAPTURE_PROTOCOL_VERSION = 1;
const SAFE_ID_PATTERN = /^[a-z0-9._:-]{1,128}$/i;
const SAFE_DETECTION_SOURCES = {
  none: true,
  citation_meta: true,
  scholarly_meta: true,
  doi_url: true,
  page_url: true,
  canonical_url: true,
  body_text: true,
  document_title: true,
  page_link: true,
  button_link: true,
  pdf_page: true,
  embed_src: true,
  dom: true,
  jsonld: true,
  og_meta: true,
  dc_meta: true
};
const SAFE_DETECTION_CONFIDENCE = {
  none: true,
  weak: true,
  medium: true,
  strong: true
};
const SAFE_REFERENCE_TYPES = {
  article: true,
  book: true,
  website: true
};

function asText(value, maxLen) {
  if (value == null) return '';
  const text = String(value).trim();
  if (!maxLen || text.length <= maxLen) return text;
  return text.slice(0, maxLen);
}

function safeDecodeURIComponent(value) {
  const raw = String(value || '');
  try { return decodeURIComponent(raw); } catch (_e) { return raw; }
}

function normalizeDoi(value) {
  let doi = asText(value, 512).toLowerCase();
  if (!doi) return '';
  doi = safeDecodeURIComponent(doi);
  doi = doi.replace(/^doi:\s*/i, '');
  doi = doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '');
  doi = doi.replace(/\s+/g, '');
  doi = doi.replace(/[)\].,;:]+$/g, '');
  const match = doi.match(/10\.\d{4,9}\/[-._;()/:a-z0-9]+/i);
  doi = (match && match[0] ? match[0] : doi).toLowerCase();
  doi = doi
    .replace(/(?:\/|\.)(bibtex|ris|abstract|fulltext|full|pdf|xml|html|epub)$/i, '')
    .replace(/\/[a-z]$/i, '')
    .replace(/[)\].,;:]+$/g, '');
  if (!/^10\.\d{4,9}\//i.test(doi)) return '';
  return doi;
}

function isSafeRemoteUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch (_e) {
    return false;
  }
}

function safeId(value) {
  const text = asText(value, 128);
  if (!text) return '';
  return SAFE_ID_PATTERN.test(text) ? text : '';
}

function normalizeDetectionEntry(raw, fieldName) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const normalized = {
    value: asText(source.value, 4096),
    source: asText(source.source, 64).toLowerCase(),
    confidence: asText(source.confidence, 16).toLowerCase(),
    found: !!source.found
  };
  if (fieldName === 'doi') normalized.value = normalizeDoi(normalized.value);
  if (fieldName === 'pdfUrl' && !isSafeRemoteUrl(normalized.value)) normalized.value = '';
  if (!SAFE_DETECTION_SOURCES[normalized.source]) normalized.source = 'none';
  if (!SAFE_DETECTION_CONFIDENCE[normalized.confidence]) normalized.confidence = normalized.value ? 'weak' : 'none';
  normalized.found = !!(normalized.found && normalized.value);
  if (!normalized.found) {
    normalized.value = '';
    normalized.source = 'none';
    normalized.confidence = 'none';
  }
  return normalized;
}

function sanitizeDetectionMeta(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    doi: normalizeDetectionEntry(source.doi, 'doi'),
    pdfUrl: normalizeDetectionEntry(source.pdfUrl, 'pdfUrl'),
    title: normalizeDetectionEntry(source.title, 'title'),
    authors: normalizeDetectionEntry(source.authors, 'authors'),
    journal: normalizeDetectionEntry(source.journal, 'journal'),
    year: normalizeDetectionEntry(source.year, 'year'),
    abstract: normalizeDetectionEntry(source.abstract, 'abstract')
  };
}

function isAllowedBridgeOrigin(origin) {
  const raw = asText(origin, 2048);
  if (!raw || raw === 'null') return true;
  return /^(chrome-extension|moz-extension):\/\//i.test(raw)
    || /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i.test(raw)
    || /^https?:\/\/localhost(?::\d+)?$/i.test(raw);
}

function hasBridgeBodyContentType(req) {
  const type = asText(req && req.headers ? req.headers['content-type'] : '', 256).toLowerCase();
  return !type
    || type.indexOf('application/json') >= 0
    || type.indexOf('text/plain') >= 0;
}

function deriveSetupState(info) {
  const source = info && typeof info === 'object' ? info : {};
  if (String(source.browserFamily || '') === 'unknown') return 'browser_unknown';
  if (source.bridgeConnected) return 'connected';
  if (source.installDir && source.lastConnectedAt) return 'connection_failed';
  if (source.installDir) return 'setup_ready';
  return 'not_setup';
}

function compareVersions(a, b) {
  const aa = String(a || '0').split('.').map(part => parseInt(part, 10) || 0);
  const bb = String(b || '0').split('.').map(part => parseInt(part, 10) || 0);
  const length = Math.max(aa.length, bb.length);
  for (let index = 0; index < length; index += 1) {
    const left = aa[index] || 0;
    const right = bb[index] || 0;
    if (left > right) return 1;
    if (left < right) return -1;
  }
  return 0;
}

function readExtensionManifestInfo(sourceRoot, browserFamily) {
  const family = browserFamily === 'firefox' ? 'firefox' : 'chromium';
  const manifestPath = path.join(String(sourceRoot || ''), family, 'manifest.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return {
      version: asText(parsed && parsed.version, 32) || '0.0.0',
      manifestPath
    };
  } catch (_e) {
    return {
      version: '0.0.0',
      manifestPath
    };
  }
}

function evaluateBrowserCaptureLifecycle(info) {
  const source = info && typeof info === 'object' ? info : {};
  const bundledVersion = asText(source.bundledExtensionVersion, 32) || '0.0.0';
  const installedVersion = asText(source.installedExtensionVersion, 32);
  const protocolVersion = Number(source.bridgeProtocolVersion || BROWSER_CAPTURE_PROTOCOL_VERSION);
  const installedProtocolVersion = Number(source.installedProtocolVersion || 0);
  const setupState = deriveSetupState(source);
  const hasInstalledVersion = !!installedVersion;
  const updateAvailable = !!(hasInstalledVersion && compareVersions(bundledVersion, installedVersion) > 0);
  const protocolMismatch = !!(hasInstalledVersion && installedProtocolVersion > 0 && installedProtocolVersion !== protocolVersion);
  const versionMismatch = updateAvailable || protocolMismatch;
  let lifecycleState = 'not_setup';
  let compatibilityState = 'unknown';
  let message = 'Browser Capture kuruluma hazir.';

  if (setupState === 'browser_unknown') {
    lifecycleState = 'unsupported';
    compatibilityState = 'unknown';
    message = 'Varsayilan tarayici tam dogrulanamadi. Yerel kurulum yine de rehberli ilerler.';
  } else if (!source.installDir) {
    lifecycleState = 'not_setup';
    compatibilityState = 'unknown';
    message = 'Browser Capture henuz kurulmadi.';
  } else if (protocolMismatch) {
    lifecycleState = 'version_mismatch';
    compatibilityState = 'protocol_mismatch';
    message = 'Uzanti surumu bridge protokolune uymuyor. Guncelleme veya onarim onerilir.';
  } else if (updateAvailable) {
    lifecycleState = 'update_available';
    compatibilityState = 'outdated_extension';
    message = 'Paketlenmis uzanti daha yeni. Tek tikla guncelleme hazir.';
  } else if (source.bridgeConnected) {
    lifecycleState = 'connected';
    compatibilityState = 'compatible';
    message = 'Browser Capture hazir ve bagli.';
  } else if (hasInstalledVersion) {
    lifecycleState = source.lastConnectedAt ? 'disconnected' : 'installed_not_verified';
    compatibilityState = 'unknown';
    message = source.lastConnectedAt
      ? 'Uzanti daha once baglandi ancak su an yanit vermiyor.'
      : 'Uzanti kurulmus görünüyor ama henüz dogrulanmadi.';
  } else if (setupState === 'setup_ready') {
    lifecycleState = 'setup_in_progress';
    compatibilityState = 'unknown';
    message = 'Kurulum paketi hazir. Tarayici onayi bekleniyor.';
  } else {
    lifecycleState = 'broken';
    compatibilityState = 'unknown';
    message = 'Browser Capture durumu belirsiz. Onarim onerilir.';
  }

  return {
    lifecycleState,
    compatibilityState,
    updateAvailable,
    versionMismatch,
    protocolMismatch,
    bundledExtensionVersion: bundledVersion,
    installedExtensionVersion: installedVersion || '',
    bridgeProtocolVersion: protocolVersion,
    installedProtocolVersion: installedProtocolVersion || 0,
    message
  };
}

function browserFromProgId(progId) {
  const raw = asText(progId, 256).toLowerCase();
  if (!raw) return { id: '', family: 'unknown', label: 'Bilinmiyor', isChromium: false, isFirefox: false };
  if (raw.indexOf('firefox') >= 0) return { id: raw, family: 'firefox', label: 'Firefox', isChromium: false, isFirefox: true, extensionManagerUrl: 'about:debugging#/runtime/this-firefox' };
  if (raw.indexOf('edge') >= 0) return { id: raw, family: 'chromium', label: 'Microsoft Edge', isChromium: true, isFirefox: false, extensionManagerUrl: 'edge://extensions' };
  if (raw.indexOf('brave') >= 0) return { id: raw, family: 'chromium', label: 'Brave', isChromium: true, isFirefox: false, extensionManagerUrl: 'brave://extensions' };
  if (raw.indexOf('vivaldi') >= 0) return { id: raw, family: 'chromium', label: 'Vivaldi', isChromium: true, isFirefox: false, extensionManagerUrl: 'vivaldi://extensions' };
  if (raw.indexOf('opera') >= 0) return { id: raw, family: 'chromium', label: 'Opera', isChromium: true, isFirefox: false, extensionManagerUrl: 'opera://extensions' };
  if (raw.indexOf('arc') >= 0) return { id: raw, family: 'chromium', label: 'Arc', isChromium: true, isFirefox: false, extensionManagerUrl: 'arc://extensions' };
  if (raw.indexOf('chrome') >= 0) return { id: raw, family: 'chromium', label: 'Google Chrome', isChromium: true, isFirefox: false, extensionManagerUrl: 'chrome://extensions' };
  return { id: raw, family: 'chromium', label: 'Chromium Tabanlı Tarayıcı', isChromium: true, isFirefox: false, extensionManagerUrl: 'chrome://extensions' };
}

function getBrowserExtensionManagerUrl(settingsLike) {
  const source = settingsLike && typeof settingsLike === 'object' ? settingsLike : {};
  if (source.defaultBrowserProgId) {
    return browserFromProgId(source.defaultBrowserProgId).extensionManagerUrl || '';
  }
  if (source.browserFamily === 'firefox') return 'about:debugging#/runtime/this-firefox';
  if (source.browserFamily === 'chromium') return 'chrome://extensions';
  return '';
}

function parseWindowsDefaultBrowserRegOutput(output) {
  const text = String(output || '');
  const match = text.match(/ProgId\s+REG_\w+\s+([^\r\n]+)/i);
  const progId = match && match[1] ? String(match[1]).trim() : '';
  return {
    progId,
    browser: browserFromProgId(progId)
  };
}

function parseBrowserOpenCommandOutput(output) {
  const text = String(output || '');
  const match = text.match(/\(Default\)\s+REG_\w+\s+([^\r\n]+)/i);
  return match && match[1] ? String(match[1]).trim() : '';
}

function extractExecutableFromCommand(command) {
  const raw = asText(command, 4096);
  if (!raw) return '';
  if (raw[0] === '"') {
    const quotedMatch = raw.match(/^"([^"]+?\.exe)"/i);
    return quotedMatch && quotedMatch[1] ? quotedMatch[1] : '';
  }
  const unquotedMatch = raw.match(/^([a-z]:\\[^"\r\n]+?\.exe)\b/i);
  return unquotedMatch && unquotedMatch[1] ? unquotedMatch[1] : '';
}

function determineBrowserInstallStrategy(settingsLike) {
  const source = settingsLike && typeof settingsLike === 'object' ? settingsLike : {};
  const family = asText(source.browserFamily, 32).toLowerCase();
  const executablePath = asText(source.browserExecutablePath, 4096);
  if (family === 'chromium' && executablePath) {
    return {
      id: 'managed_chromium_session',
      supported: true,
      browserFamily: 'chromium',
      label: 'Yonetilen Chromium oturumu',
      requiresBrowserConfirmation: false
    };
  }
  if (family === 'firefox') {
    return {
      id: 'unsupported_firefox_local_install',
      supported: false,
      browserFamily: 'firefox',
      label: 'Firefox otomatik kurulum desteklenmiyor',
      requiresBrowserConfirmation: false
    };
  }
  return {
    id: 'unsupported_browser',
    supported: false,
    browserFamily: family || 'unknown',
    label: 'Desteklenmeyen tarayici',
    requiresBrowserConfirmation: false
  };
}

function buildManagedChromiumLaunchArgs(options) {
  const source = options && typeof options === 'object' ? options : {};
  const profileDir = asText(source.profileDir, 4096);
  const extensionDir = asText(source.extensionDir, 4096);
  const startUrl = asText(source.startUrl, 4096) || 'about:blank';
  const args = [
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
    '--new-window'
  ];
  if (profileDir) args.push('--user-data-dir=' + profileDir);
  if (extensionDir) args.push('--load-extension=' + extensionDir);
  args.push(startUrl);
  return args;
}

function normalizeBrowserCaptureSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const port = Number.isFinite(Number(source.port)) ? Number(source.port) : DEFAULT_CAPTURE_PORT;
  return {
    enabled: source.enabled !== false,
    agentAutoStart: source.agentAutoStart !== false,
    agentAutoStartSupported: typeof source.agentAutoStartSupported === 'undefined' ? false : !!source.agentAutoStartSupported,
    port: Math.min(65535, Math.max(1024, port || DEFAULT_CAPTURE_PORT)),
    token: asText(source.token, 256),
    browserFamily: asText(source.browserFamily, 32),
    defaultBrowserLabel: asText(source.defaultBrowserLabel, 128),
    defaultBrowserProgId: asText(source.defaultBrowserProgId, 256),
    browserExecutablePath: asText(source.browserExecutablePath, 4096),
    browserOpenCommand: asText(source.browserOpenCommand, 4096),
    installDir: asText(source.installDir, 4096),
    guidePath: asText(source.guidePath, 4096),
    managedProfileDir: asText(source.managedProfileDir, 4096),
    lastPreparedAt: Number(source.lastPreparedAt) > 0 ? Number(source.lastPreparedAt) : 0,
    lastConnectedAt: Number(source.lastConnectedAt) > 0 ? Number(source.lastConnectedAt) : 0,
    lastVerificationAt: Number(source.lastVerificationAt) > 0 ? Number(source.lastVerificationAt) : 0,
    lastUsedWorkspaceId: asText(source.lastUsedWorkspaceId, 128),
    lastUsedComparisonId: asText(source.lastUsedComparisonId, 128),
    pendingPayloads: Array.isArray(source.pendingPayloads) ? source.pendingPayloads.slice(0, 40) : [],
    autoAttachPdfUrl: source.autoAttachPdfUrl !== false,
    focusImportedWorkspace: !!source.focusImportedWorkspace,
    setupPromptSeen: !!source.setupPromptSeen,
    lifecycleState: asText(source.lifecycleState, 64),
    compatibilityState: asText(source.compatibilityState, 64),
    bundledExtensionVersion: asText(source.bundledExtensionVersion, 32),
    installedExtensionVersion: asText(source.installedExtensionVersion, 32),
    bridgeProtocolVersion: Number(source.bridgeProtocolVersion) > 0 ? Number(source.bridgeProtocolVersion) : 0,
    installedProtocolVersion: Number(source.installedProtocolVersion) > 0 ? Number(source.installedProtocolVersion) : 0,
    updatePending: !!source.updatePending,
    lastLifecycleAction: asText(source.lastLifecycleAction, 64),
    lastError: asText(source.lastError, 512)
  };
}

function sanitizeCapturePayload(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const referenceTypeRaw = asText(source.referenceType, 32).toLowerCase();
  const referenceType = SAFE_REFERENCE_TYPES[referenceTypeRaw] ? referenceTypeRaw : 'article';
  const authors = Array.isArray(source.detectedAuthors)
    ? source.detectedAuthors.map(function (item) { return asText(item, 256); }).filter(Boolean).slice(0, 12)
    : [];
  const normalized = {
    referenceType,
    sourcePageUrl: isSafeRemoteUrl(source.sourcePageUrl) ? asText(source.sourcePageUrl, 4096) : '',
    pageTitle: asText(source.pageTitle, 2048),
    doi: normalizeDoi(source.doi),
    pdfUrl: isSafeRemoteUrl(source.pdfUrl) ? asText(source.pdfUrl, 4096) : '',
    detectedTitle: asText(source.detectedTitle || source.title, 2048),
    detectedAuthors: authors,
    detectedJournal: asText(source.detectedJournal || source.journal, 1024),
    detectedPublisher: asText(source.detectedPublisher || source.publisher, 1024),
    detectedWebsiteName: asText(source.detectedWebsiteName || source.websiteName, 1024),
    detectedEdition: asText(source.detectedEdition || source.edition, 128),
    detectedPublishedDate: asText(source.detectedPublishedDate || source.publishedDate, 64),
    detectedAccessedDate: asText(source.detectedAccessedDate || source.accessedDate, 64),
    detectedYear: asText(source.detectedYear || source.year, 32),
    detectedAbstract: asText(source.detectedAbstract || source.abstract, 12000),
    selectedWorkspaceId: safeId(source.selectedWorkspaceId),
    selectedComparisonId: safeId(source.selectedComparisonId),
    selectedCollectionId: safeId(source.selectedCollectionId),
    browserSource: asText(source.browserSource, 64),
    timestamp: Number(source.timestamp) > 0 ? Number(source.timestamp) : Date.now(),
    detectionMeta: sanitizeDetectionMeta(source.detectionMeta)
  };
  if (!normalized.sourcePageUrl && isSafeRemoteUrl(source.url)) normalized.sourcePageUrl = asText(source.url, 4096);
  if (!normalized.detectedTitle) normalized.detectedTitle = normalized.pageTitle;
  if (!normalized.detectedYear && normalized.detectedPublishedDate) {
    const yearMatch = String(normalized.detectedPublishedDate).match(/\b(19|20)\d{2}\b/);
    if (yearMatch && yearMatch[0]) normalized.detectedYear = yearMatch[0];
  }
  if (normalized.selectedComparisonId && normalized.selectedComparisonId !== 'literature-matrix') {
    normalized.selectedComparisonId = '';
  }
  return normalized;
}

function buildTargetsFromDataJSON(dataJSON) {
  let data = {};
  try {
    data = JSON.parse(String(dataJSON || '{}'));
  } catch (_e) {
    data = {};
  }
  const workspaces = Array.isArray(data.wss) ? data.wss : [];
  const activeWorkspaceId = asText(data.cur, 128) || (workspaces[0] && asText(workspaces[0].id, 128)) || '';
  return {
    activeWorkspaceId,
    workspaces: workspaces
      .map(function (ws) {
        const id = asText(ws && ws.id, 128);
        if (!id) return null;
        return {
          id,
          name: asText(ws && ws.name, 256) || 'Çalışma Alanı',
          comparisons: [
            { id: '', name: 'Yok' },
            { id: 'literature-matrix', name: 'Literatür Matrisi' }
          ]
        };
      })
      .filter(Boolean)
  };
}

function buildCaptureDeepLink(payload) {
  const safePayload = sanitizeCapturePayload(payload);
  const encoded = Buffer.from(JSON.stringify(safePayload), 'utf8').toString('base64url');
  return 'academiq://capture?payload=' + encoded;
}

function parseCaptureProtocolUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    if (String(parsed.protocol || '').toLowerCase() !== 'academiq:') return null;
    const host = String(parsed.hostname || parsed.host || '').toLowerCase();
    const pathName = String(parsed.pathname || '').replace(/^\/+/, '').toLowerCase();
    const route = host || pathName;
    if (route === 'open') return { action: 'open' };
    if (route !== 'capture') return null;
    const encoded = String(parsed.searchParams.get('payload') || '').trim();
    if (!encoded) return { action: 'capture', payload: null };
    const json = Buffer.from(encoded, 'base64url').toString('utf8');
    return {
      action: 'capture',
      payload: sanitizeCapturePayload(JSON.parse(json))
    };
  } catch (_e) {
    return null;
  }
}

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyTree(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) return;
  ensureDirSync(targetDir);
  fs.readdirSync(sourceDir, { withFileTypes: true }).forEach(function (entry) {
    const src = path.join(sourceDir, entry.name);
    const dst = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyTree(src, dst);
      return;
    }
    fs.writeFileSync(dst, fs.readFileSync(src));
  });
}

function buildInstallationGuide(browserLabel, browserFamily, installDir) {
  const label = browserLabel || (browserFamily === 'firefox' ? 'Firefox' : 'Chromium tabanlı tarayıcı');
  const steps = browserFamily === 'firefox'
    ? [
        '1. Tarayıcıda about:debugging#/runtime/this-firefox adresini açın.',
        '2. "Temporary Add-on Yükle" seçeneğine tıklayın.',
        '3. Açılan klasörde manifest.json dosyasını seçin.',
        '4. Popup üzerinden workspace seçip AcademiQ bağlantısını test edin.'
      ]
    : [
        '1. Tarayıcıda uzantılar sayfasını açın (örn. chrome://extensions veya edge://extensions).',
        '2. Geliştirici Modu\'nu açın.',
        '3. "Paketlenmemiş öğe yükle" seçeneğini seçin.',
        '4. Bu klasörü seçin ve popup üzerinden AcademiQ bağlantısını test edin.'
      ];
  return [
    'AcademiQ Browser Capture Kurulumu',
    '',
    'Hedef tarayıcı: ' + label,
    'Hazırlanan klasör: ' + installDir,
    '',
    'Adımlar:',
    steps.join('\n'),
    '',
    'Notlar:',
    '- Uzantı yerel olarak çalışır; mağaza kurulumu gerekmez.',
    '- AcademiQ uygulaması açıksa localhost bridge kullanılır.',
    '- Uygulama kapalıysa uzantı academiq:// deep link ile uygulamayı açmayı dener.'
  ].join('\n');
}

function buildManagedSessionGuide(browserLabel, installDir) {
  const label = browserLabel || 'Chromium tabanli tarayici';
  return [
    'AcademiQ Browser Capture Hazir',
    '',
    'Tarayici: ' + label,
    'Yonetilen uzanti dizini: ' + installDir,
    '',
    'Bu kurulum AcademiQ tarafindan yonetilir.',
    'Tarayici, AcademiQ tarafindan hazirlanan ayri bir profil ile acilir.',
    'Boylece uzanti dosyalariyla manuel ugrasilmaz ve guncellemeler uygulama tarafindan yonetilir.',
    '',
    'Not:',
    '- Browser Capture kullanmak icin AcademiQ\'nin actigi pencereyi veya ayni yonetilen profili kullanin.',
    '- Baglanti sorunu olursa Ayarlar > Browser Capture > Onar adimini kullanin.'
  ].join('\n');
}

function prepareExtensionBundle(options) {
  const sourceRoot = options && options.sourceRoot ? options.sourceRoot : '';
  const appDir = options && options.appDir ? options.appDir : '';
  const browserFamily = options && options.browserFamily === 'firefox' ? 'firefox' : 'chromium';
  const browserLabel = asText(options && options.browserLabel, 128);
  const config = options && options.config && typeof options.config === 'object' ? options.config : {};
  if (!sourceRoot || !appDir) throw new Error('Extension bundle hazirlanamadi');
  const installDir = path.join(appDir, 'browser-capture-extension', browserFamily);
  try { fs.rmSync(installDir, { recursive: true, force: true }); } catch (_e) {}
  ensureDirSync(installDir);
  copyTree(path.join(sourceRoot, 'common'), installDir);
  copyTree(path.join(sourceRoot, browserFamily), installDir);
  fs.writeFileSync(
    path.join(installDir, 'config.js'),
    'globalThis.AQ_CAPTURE_CONFIG=' + JSON.stringify({
      token: asText(config.token, 256),
      port: Number(config.port) || DEFAULT_CAPTURE_PORT,
      bridgeBaseUrl: 'http://127.0.0.1:' + (Number(config.port) || DEFAULT_CAPTURE_PORT),
      appProtocol: 'academiq://',
      browserFamily,
      browserLabel
    }, null, 2) + ';',
    'utf8'
  );
  const guidePath = path.join(installDir, 'INSTALLATION.txt');
  fs.writeFileSync(guidePath, buildInstallationGuide(browserLabel, browserFamily, installDir), 'utf8');
  return { installDir, guidePath };
}

function writeJson(res, statusCode, data) {
  const body = JSON.stringify(data || {});
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-AQ-Token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function createBrowserCaptureBridge(options) {
  const config = options && typeof options === 'object' ? options : {};
  const token = asText(config.token, 256);
  const host = asText(config.host, 128) || '127.0.0.1';
  const desiredPort = Number(config.port) || DEFAULT_CAPTURE_PORT;
  const onCapture = typeof config.onCapture === 'function' ? config.onCapture : function () { return { ok: true }; };
  const onHello = typeof config.onHello === 'function' ? config.onHello : function () { return { ok: true }; };
  const onGetTargets = typeof config.onGetTargets === 'function' ? config.onGetTargets : function () { return { activeWorkspaceId: '', workspaces: [] }; };
  const onGetStatus = typeof config.onGetStatus === 'function' ? config.onGetStatus : function () { return {}; };
  const onLookup = typeof config.onLookup === 'function' ? config.onLookup : function () { return { ok: false, error: 'Lookup unavailable' }; };
  const onCreateWorkspace = typeof config.onCreateWorkspace === 'function' ? config.onCreateWorkspace : function () { return { ok: false, error: 'Workspace creation unavailable' }; };
  const onStop = typeof config.onStop === 'function' ? config.onStop : function () { return { ok: false, error: 'Stop unavailable' }; };
  const onRequestSeen = typeof config.onRequestSeen === 'function' ? config.onRequestSeen : function () {};
  let server = null;
  let activePort = 0;

  function isAuthorized(reqUrl, req) {
    const url = new URL(reqUrl, 'http://127.0.0.1');
    const queryToken = asText(url.searchParams.get('token'), 256);
    const headerToken = asText(req.headers['x-aq-token'], 256);
    return !!token && (queryToken === token || headerToken === token);
  }

  function handleRequest(req, res) {
    const reqUrl = String(req.url || '/');
    const parsed = new URL(reqUrl, 'http://127.0.0.1');
    if (req.method === 'OPTIONS') {
      writeJson(res, 200, { ok: true });
      return;
    }
    if (!isAuthorized(reqUrl, req)) {
      writeJson(res, 401, { ok: false, error: 'Unauthorized' });
      return;
    }
    if (!isAllowedBridgeOrigin(req.headers.origin)) {
      writeJson(res, 403, { ok: false, error: 'Forbidden origin' });
      return;
    }
    onRequestSeen({
      path: parsed.pathname,
      method: req.method || 'GET',
      userAgent: asText(req.headers['user-agent'], 512)
    });
    if (req.method === 'GET' && parsed.pathname === '/status') {
      writeJson(res, 200, Object.assign({
        ok: true,
        connected: true,
        port: activePort || desiredPort
      }, onGetStatus() || {}));
      return;
    }
    if (req.method === 'GET' && parsed.pathname === '/targets') {
      writeJson(res, 200, Object.assign({ ok: true }, onGetTargets() || {}));
      return;
    }
    if (req.method === 'POST' && parsed.pathname === '/hello') {
      if (!hasBridgeBodyContentType(req)) {
        writeJson(res, 415, { ok: false, error: 'JSON veya text payload gerekli' });
        return;
      }
      let chunks = [];
      let total = 0;
      req.on('data', function (chunk) {
        total += chunk.length;
        if (total > MAX_CAPTURE_PAYLOAD_BYTES) {
          chunks = [];
          writeJson(res, 413, { ok: false, error: 'Payload cok buyuk' });
          try { req.destroy(); } catch (_e) {}
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', function () {
        try {
          const body = Buffer.concat(chunks).toString('utf8');
          const raw = body ? JSON.parse(body) : {};
          const payload = {
            extensionVersion: asText(raw.extensionVersion, 32),
            protocolVersion: Number(raw.protocolVersion) > 0 ? Number(raw.protocolVersion) : 0,
            browserFamily: asText(raw.browserFamily, 32).toLowerCase(),
            browserName: asText(raw.browserName, 128),
            timestamp: Number(raw.timestamp) > 0 ? Number(raw.timestamp) : Date.now()
          };
          writeJson(res, 200, Object.assign({ ok: true }, onHello(payload) || {}));
        } catch (error) {
          writeJson(res, 400, { ok: false, error: error && error.message ? error.message : 'Gecersiz payload' });
        }
      });
      return;
    }
    if (req.method === 'POST' && parsed.pathname === '/capture') {
      if (!hasBridgeBodyContentType(req)) {
        writeJson(res, 415, { ok: false, error: 'JSON veya text payload gerekli' });
        return;
      }
      let chunks = [];
      let total = 0;
      req.on('data', function (chunk) {
        total += chunk.length;
        if (total > MAX_CAPTURE_PAYLOAD_BYTES) {
          chunks = [];
          writeJson(res, 413, { ok: false, error: 'Payload cok buyuk' });
          try { req.destroy(); } catch (_e) {}
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', function () {
        try {
          const body = Buffer.concat(chunks).toString('utf8');
          const payload = sanitizeCapturePayload(JSON.parse(body || '{}'));
          const result = onCapture(payload) || { ok: true };
          writeJson(res, 200, Object.assign({ ok: true }, result));
        } catch (error) {
          writeJson(res, 400, { ok: false, error: error && error.message ? error.message : 'Gecersiz payload' });
        }
      });
      return;
    }
    if (req.method === 'POST' && parsed.pathname === '/lookup') {
      if (!hasBridgeBodyContentType(req)) {
        writeJson(res, 415, { ok: false, error: 'JSON veya text payload gerekli' });
        return;
      }
      let chunks = [];
      let total = 0;
      req.on('data', function (chunk) {
        total += chunk.length;
        if (total > MAX_CAPTURE_PAYLOAD_BYTES) {
          chunks = [];
          writeJson(res, 413, { ok: false, error: 'Payload cok buyuk' });
          try { req.destroy(); } catch (_e) {}
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', function () {
        try {
          const body = Buffer.concat(chunks).toString('utf8');
          const payload = sanitizeCapturePayload(JSON.parse(body || '{}'));
          writeJson(res, 200, onLookup(payload) || { ok: false, error: 'Lookup unavailable' });
        } catch (error) {
          writeJson(res, 400, { ok: false, error: error && error.message ? error.message : 'Gecersiz payload' });
        }
      });
      return;
    }
    if (req.method === 'POST' && parsed.pathname === '/workspace') {
      if (!hasBridgeBodyContentType(req)) {
        writeJson(res, 415, { ok: false, error: 'JSON veya text payload gerekli' });
        return;
      }
      let chunks = [];
      let total = 0;
      req.on('data', function (chunk) {
        total += chunk.length;
        if (total > MAX_CAPTURE_PAYLOAD_BYTES) {
          chunks = [];
          writeJson(res, 413, { ok: false, error: 'Payload cok buyuk' });
          try { req.destroy(); } catch (_e) {}
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', function () {
        try {
          const body = Buffer.concat(chunks).toString('utf8');
          const raw = body ? JSON.parse(body) : {};
          const name = asText(raw && raw.name, 256);
          writeJson(res, 200, onCreateWorkspace(name) || { ok: false, error: 'Workspace creation unavailable' });
        } catch (error) {
          writeJson(res, 400, { ok: false, error: error && error.message ? error.message : 'Gecersiz payload' });
        }
      });
      return;
    }
    if (req.method === 'POST' && parsed.pathname === '/agent/stop') {
      if (!hasBridgeBodyContentType(req)) {
        writeJson(res, 415, { ok: false, error: 'JSON veya text payload gerekli' });
        return;
      }
      Promise.resolve(onStop() || { ok: true }).then(function (result) {
        writeJson(res, 200, Object.assign({ ok: true }, result || {}));
        setTimeout(function () {
          try { close(); } catch (_e) {}
        }, 40);
      }).catch(function (error) {
        writeJson(res, 500, { ok: false, error: error && error.message ? error.message : 'Stop failed' });
      });
      return;
    }
    writeJson(res, 404, { ok: false, error: 'Not found' });
  }

  function listen() {
    return new Promise(function (resolve, reject) {
      server = http.createServer(handleRequest);
      server.on('error', reject);
      server.listen(desiredPort, host, function () {
        activePort = server.address() && server.address().port ? server.address().port : desiredPort;
        resolve({ host, port: activePort });
      });
    });
  }

  function close() {
    return new Promise(function (resolve) {
      if (!server) {
        resolve();
        return;
      }
      try {
        server.close(function () {
          server = null;
          activePort = 0;
          resolve();
        });
      } catch (_e) {
        server = null;
        activePort = 0;
        resolve();
      }
    });
  }

  return {
    listen,
    close,
    getPort: function () { return activePort || desiredPort; }
  };
}

module.exports = {
  DEFAULT_CAPTURE_PORT,
  BROWSER_CAPTURE_PROTOCOL_VERSION,
  browserFromProgId,
  parseWindowsDefaultBrowserRegOutput,
  parseBrowserOpenCommandOutput,
  extractExecutableFromCommand,
  safeId,
  normalizeDetectionEntry,
  sanitizeDetectionMeta,
  isAllowedBridgeOrigin,
  deriveSetupState,
  compareVersions,
  readExtensionManifestInfo,
  evaluateBrowserCaptureLifecycle,
  getBrowserExtensionManagerUrl,
  determineBrowserInstallStrategy,
  buildManagedChromiumLaunchArgs,
  buildManagedSessionGuide,
  normalizeBrowserCaptureSettings,
  sanitizeCapturePayload,
  buildTargetsFromDataJSON,
  buildCaptureDeepLink,
  parseCaptureProtocolUrl,
  prepareExtensionBundle,
  createBrowserCaptureBridge
};
