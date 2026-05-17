'use strict';

const {
  DEFAULT_CAPTURE_PORT,
  BROWSER_CAPTURE_PROTOCOL_VERSION,
  readExtensionManifestInfo,
  getBrowserExtensionManagerUrl,
  determineBrowserInstallStrategy,
  evaluateBrowserCaptureLifecycle,
  deriveSetupState,
  buildTargetsFromDataJSON
} = require('./main-process-browser-capture');

const captureRefUtils = require('./main-process-capture-reference-utils');

/**
 * Browser-capture status builder
 *
 * Aggregates settings + persisted agent/queue state + runtime hello info
 * into a single status object suitable for the renderer settings panel.
 * Also offers an IPC notify helper that respects window destruction.
 *
 * Required deps:
 *   getSettings        — () => normalized browser-capture settings (from store)
 *   getMainWindow      — () => BrowserWindow | null
 *   storage            — settings/queue/agent-state read access
 *                        (loadCaptureAgentState, loadCaptureQueue optional)
 *   runtime            — { lastHelloPayload, lastHelloAt, ... }
 *   sourceDir          — absolute path to browser-capture-extension/ source
 *   appVersion         — current app version (string)
 *   getLatestStateJSON — () => current data state JSON string (for capture targets)
 *   getStorageWorkspaceLastUsed — optional: () => { lastUsedWorkspaceId, lastUsedComparisonId }
 */
function createCaptureStatusBuilder({
  getSettings,
  getMainWindow,
  storage,
  runtime,
  sourceDir,
  appVersion,
  getLatestStateJSON
}) {
  if (typeof getSettings !== 'function') {
    throw new Error('createCaptureStatusBuilder: getSettings required');
  }
  if (typeof getMainWindow !== 'function') {
    throw new Error('createCaptureStatusBuilder: getMainWindow required');
  }
  if (!runtime || typeof runtime !== 'object') {
    throw new Error('createCaptureStatusBuilder: runtime object required');
  }
  if (!sourceDir) {
    throw new Error('createCaptureStatusBuilder: sourceDir required');
  }
  if (!appVersion) {
    throw new Error('createCaptureStatusBuilder: appVersion required');
  }
  if (typeof getLatestStateJSON !== 'function') {
    throw new Error('createCaptureStatusBuilder: getLatestStateJSON required');
  }

  function buildStatus(extra) {
    const settings = getSettings();
    const agentState = storage && typeof storage.loadCaptureAgentState === 'function'
      ? (storage.loadCaptureAgentState() || {})
      : {};
    const queueState = storage && typeof storage.loadCaptureQueue === 'function'
      ? (storage.loadCaptureQueue() || { items: [] })
      : { items: [] };
    const queueItems = Array.isArray(queueState.items) ? queueState.items : [];
    const queueStats = captureRefUtils.buildCaptureQueueStats(queueItems);
    const queuedItems = queueItems.filter((item) => item && item.status === 'queued');
    const recentQueueItems = captureRefUtils.buildCaptureQueueActivity(queueItems);
    const bundledInfo = readExtensionManifestInfo(sourceDir, settings.browserFamily);
    const runtimeInfo = runtime.lastHelloPayload && typeof runtime.lastHelloPayload === 'object'
      ? runtime.lastHelloPayload
      : {};

    const status = Object.assign({
      enabled: !!settings.enabled,
      agentAutoStart: settings.agentAutoStart !== false,
      agentAutoStartSupported: !!settings.agentAutoStartSupported,
      port: settings.port || DEFAULT_CAPTURE_PORT,
      tokenReady: !!settings.token,
      browserFamily: settings.browserFamily || 'unknown',
      defaultBrowserLabel: settings.defaultBrowserLabel || 'Bilinmiyor',
      defaultBrowserProgId: settings.defaultBrowserProgId || '',
      browserExecutablePath: settings.browserExecutablePath || '',
      browserOpenCommand: settings.browserOpenCommand || '',
      installDir: settings.installDir || '',
      guidePath: settings.guidePath || '',
      managedProfileDir: settings.managedProfileDir || '',
      lastPreparedAt: settings.lastPreparedAt || 0,
      lastConnectedAt: settings.lastConnectedAt || 0,
      lastVerificationAt: settings.lastVerificationAt || 0,
      autoAttachPdfUrl: settings.autoAttachPdfUrl !== false,
      focusImportedWorkspace: !!settings.focusImportedWorkspace,
      bridgeConnected: !!agentState.running,
      bridgeReady: !!agentState.running,
      browserCaptureProtocolVersion: BROWSER_CAPTURE_PROTOCOL_VERSION,
      bundledExtensionVersion: bundledInfo.version,
      installedExtensionVersion: runtimeInfo.extensionVersion || agentState.extensionVersion || settings.installedExtensionVersion || '',
      installedProtocolVersion: Number(runtimeInfo.protocolVersion || agentState.protocolVersion || settings.installedProtocolVersion || 0),
      lastHelloAt: Number(agentState.lastHelloAt || runtime.lastHelloAt || 0),
      lastError: settings.lastError || '',
      updatePending: !!settings.updatePending,
      lastLifecycleAction: settings.lastLifecycleAction || '',
      extensionManagerUrl: getBrowserExtensionManagerUrl(settings),
      agentRunning: !!agentState.running,
      agentPid: Number(agentState.pid || 0),
      agentPort: Number(agentState.port || settings.port || DEFAULT_CAPTURE_PORT),
      agentVersion: String(agentState.agentVersion || appVersion),
      queueLength: queuedItems.length,
      queueStats,
      recentQueueItems,
      lastCaptureReceivedAt: Number(agentState.lastCaptureReceivedAt || 0)
    }, extra || {});

    status.installStrategy = determineBrowserInstallStrategy(status);
    const lifecycle = evaluateBrowserCaptureLifecycle({
      browserFamily: status.browserFamily,
      installDir: status.installDir,
      lastConnectedAt: status.lastConnectedAt,
      bridgeConnected: status.bridgeConnected,
      bundledExtensionVersion: status.bundledExtensionVersion,
      installedExtensionVersion: status.installedExtensionVersion,
      bridgeProtocolVersion: status.browserCaptureProtocolVersion,
      installedProtocolVersion: status.installedProtocolVersion
    });
    return Object.assign(status, lifecycle, { setupState: deriveSetupState(status) });
  }

  function notifyStateChanged(detail) {
    const win = getMainWindow();
    if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) return false;
    try {
      win.webContents.send('browserCapture:stateChanged', detail && typeof detail === 'object' ? detail : {});
      return true;
    } catch (_e) {
      return false;
    }
  }

  function getCaptureTargets() {
    const targets = buildTargetsFromDataJSON(getLatestStateJSON() || '');
    const settings = getSettings();
    targets.preferredWorkspaceId = settings.lastUsedWorkspaceId || '';
    targets.preferredComparisonId = settings.lastUsedComparisonId || '';
    return targets;
  }

  return {
    buildStatus,
    notifyStateChanged,
    getCaptureTargets
  };
}

module.exports = { createCaptureStatusBuilder };
