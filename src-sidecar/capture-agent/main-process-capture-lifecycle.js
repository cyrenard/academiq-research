'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const {
  DEFAULT_CAPTURE_PORT,
  BROWSER_CAPTURE_PROTOCOL_VERSION,
  parseWindowsDefaultBrowserRegOutput,
  parseBrowserOpenCommandOutput,
  extractExecutableFromCommand,
  readExtensionManifestInfo,
  getBrowserExtensionManagerUrl,
  determineBrowserInstallStrategy,
  buildManagedChromiumLaunchArgs,
  buildManagedSessionGuide,
  prepareExtensionBundle,
  buildCaptureDeepLink,
  createBrowserCaptureBridge
} = require('./main-process-browser-capture');

const { buildBrowserCaptureImportMessage } = require('./main-process-capture-reference-utils');

/**
 * Browser-Capture Lifecycle Controller
 *
 * Single home for the high-level browser-capture lifecycle: detecting the
 * default browser, preparing the extension bundle, launching a managed
 * Chromium session, opening the extension manager, starting the local
 * HTTP bridge, and dispatching install/repair/test/restart_agent/stop_agent
 * actions from the renderer settings UI.
 *
 * All side-effecty deps come through the factory so this module has no
 * direct Electron coupling beyond `shell` (and that's injected too).
 *
 * Required deps:
 *   storage           — for setBrowserCaptureSettings (the persisted patches)
 *   getSettings       — () => normalized browser-capture settings
 *   buildStatus       — (extra?) => full status object (from status builder)
 *   agentManager      — { ensureRunning, stop, syncLoginItem, refreshStatusSnapshot, getLoginItemState }
 *   queueDispatcher   — { queuePayload }  (used as fallback when import fails)
 *   runtime           — { bridge, lastBridgeEventAt, lastHelloAt, lastHelloPayload, stopAgentRequested }
 *   shell             — Electron shell (openPath, openExternal)
 *   appDir            — absolute path to the per-user app data dir
 *   sourceDir         — absolute path to packaged browser-capture-extension/ source
 *   managedProfileDir — absolute path to the managed-chromium-profile root
 *   getCaptureTargets — () => capture targets descriptor
 *   buildLookup       — (payload) => preview-lookup result
 *   createWorkspace   — (name) => new workspace
 *   importCapture     — async (payload) => import result
 *   detectDefaultBrowser    — async () => { browser, progId }   (Windows-specific; can stub on other OSes)
 *   detectBrowserOpenCommand — async (progId) => command string
 *
 * Optional:
 *   onSettingsPatched — (patch) => void  (test hook)
 */
function createBrowserCaptureLifecycle({
  storage,
  getSettings,
  buildStatus,
  agentManager,
  queueDispatcher,
  runtime,
  shell,
  appDir,
  sourceDir,
  managedProfileDir,
  getCaptureTargets,
  buildLookup,
  createWorkspace,
  importCapture,
  detectDefaultBrowser,
  detectBrowserOpenCommand,
  onSettingsPatched = null
}) {
  if (!storage) throw new Error('createBrowserCaptureLifecycle: storage required');
  if (typeof getSettings !== 'function') throw new Error('createBrowserCaptureLifecycle: getSettings required');
  if (typeof buildStatus !== 'function') throw new Error('createBrowserCaptureLifecycle: buildStatus required');
  if (!agentManager || typeof agentManager.ensureRunning !== 'function') {
    throw new Error('createBrowserCaptureLifecycle: agentManager required');
  }
  if (!queueDispatcher || typeof queueDispatcher.queuePayload !== 'function') {
    throw new Error('createBrowserCaptureLifecycle: queueDispatcher required');
  }
  if (!runtime || typeof runtime !== 'object') {
    throw new Error('createBrowserCaptureLifecycle: runtime required');
  }
  if (!shell) throw new Error('createBrowserCaptureLifecycle: shell required');
  if (!appDir) throw new Error('createBrowserCaptureLifecycle: appDir required');
  if (!sourceDir) throw new Error('createBrowserCaptureLifecycle: sourceDir required');
  if (!managedProfileDir) throw new Error('createBrowserCaptureLifecycle: managedProfileDir required');

  function patchSettings(patch) {
    if (storage && typeof storage.setBrowserCaptureSettings === 'function') {
      storage.setBrowserCaptureSettings(patch);
    }
    if (typeof onSettingsPatched === 'function') {
      try { onSettingsPatched(patch); } catch (_e) {}
    }
  }

  function ensureManagedDirs() {
    try { fs.mkdirSync(managedProfileDir, { recursive: true }); } catch (_e) {}
  }

  function buildStartUrl(settings) {
    const token = encodeURIComponent(String(settings && settings.token ? settings.token : ''));
    const port = Number(settings && settings.port ? settings.port : DEFAULT_CAPTURE_PORT) || DEFAULT_CAPTURE_PORT;
    return 'http://127.0.0.1:' + port + '/status?token=' + token;
  }

  async function openExtensionManager(status) {
    const source = status && typeof status === 'object' ? status : buildStatus();
    const managerUrl = String(source.extensionManagerUrl || getBrowserExtensionManagerUrl(source) || '').trim();
    const executablePath = String(source.browserExecutablePath || '').trim();
    if (!managerUrl) return { ok: false, error: 'Extension manager adresi bulunamadi.' };
    if (executablePath && fs.existsSync(executablePath)) {
      try {
        const child = execFile(executablePath, [managerUrl], { windowsHide: false }, function () {});
        if (child && typeof child.unref === 'function') child.unref();
        return { ok: true, managerUrl };
      } catch (_error) {}
    }
    try {
      await shell.openExternal(managerUrl);
      return { ok: true, managerUrl };
    } catch (error) {
      return { ok: false, managerUrl, error: error && error.message ? error.message : 'Extension manager acilamadi.' };
    }
  }

  async function refreshSettings() {
    const detected = await detectDefaultBrowser();
    const browserOpenCommand = await detectBrowserOpenCommand(detected && detected.progId ? detected.progId : '');
    const browserExecutablePath = extractExecutableFromCommand(browserOpenCommand);
    const next = getSettings();
    const loginItemState = agentManager.getLoginItemState();
    const bundledInfo = readExtensionManifestInfo(sourceDir, detected && detected.browser ? detected.browser.family : 'chromium');
    const patch = {
      defaultBrowserLabel: detected && detected.browser ? detected.browser.label : 'Bilinmiyor',
      defaultBrowserProgId: detected && detected.progId ? detected.progId : '',
      browserFamily: detected && detected.browser ? detected.browser.family : 'unknown',
      browserOpenCommand,
      browserExecutablePath,
      agentAutoStartSupported: !!loginItemState.supported,
      agentAutoStart: loginItemState.supported ? !!loginItemState.enabled : (next.agentAutoStart !== false),
      bundledExtensionVersion: bundledInfo.version,
      bridgeProtocolVersion: BROWSER_CAPTURE_PROTOCOL_VERSION
    };
    patchSettings(patch);
    return Object.assign({}, next, patch);
  }

  async function prepareSetup() {
    const settings = await refreshSettings();
    ensureManagedDirs();
    const prepared = prepareExtensionBundle({
      sourceRoot: sourceDir,
      appDir,
      browserFamily: settings.browserFamily === 'firefox' ? 'firefox' : 'chromium',
      browserLabel: settings.defaultBrowserLabel,
      config: { token: settings.token, port: settings.port || DEFAULT_CAPTURE_PORT }
    });
    const installStrategy = determineBrowserInstallStrategy(Object.assign({}, settings, { installDir: prepared.installDir }));
    const managedGuidePath = path.join(prepared.installDir, 'MANAGED_SETUP.txt');
    fs.writeFileSync(managedGuidePath, buildManagedSessionGuide(settings.defaultBrowserLabel, prepared.installDir), 'utf8');
    const patch = {
      installDir: prepared.installDir,
      guidePath: installStrategy.supported ? managedGuidePath : prepared.guidePath,
      managedProfileDir: installStrategy.supported
        ? path.join(managedProfileDir, settings.browserFamily === 'firefox' ? 'firefox' : 'chromium')
        : '',
      agentAutoStart: settings.agentAutoStart !== false,
      agentAutoStartSupported: !!settings.agentAutoStartSupported,
      lastPreparedAt: Date.now(),
      setupPromptSeen: true,
      lifecycleState: installStrategy.supported ? 'installing' : 'unsupported_browser',
      compatibilityState: installStrategy.supported ? 'preparing' : 'unsupported_browser',
      lastLifecycleAction: 'prepare',
      lastError: installStrategy.supported ? '' : 'Bu tarayici icin tam uygulama-yonetimli kurulum desteklenmiyor.'
    };
    patchSettings(patch);
    return Object.assign(buildStatus(patch), {
      ok: true,
      installDir: prepared.installDir,
      guidePath: patch.guidePath,
      managedProfileDir: patch.managedProfileDir,
      deepLinkExample: buildCaptureDeepLink({
        detectedTitle: 'Örnek Makale',
        selectedWorkspaceId: getCaptureTargets().activeWorkspaceId || '',
        browserSource: settings.defaultBrowserLabel || ''
      }),
      installStrategy
    });
  }

  async function launchManagedSession(reason) {
    const prepared = await prepareSetup();
    const status = buildStatus(prepared);
    const strategy = status.installStrategy || determineBrowserInstallStrategy(status);
    if (!strategy.supported || strategy.id !== 'managed_chromium_session') {
      const patch = {
        lifecycleState: 'unsupported_browser',
        compatibilityState: 'unsupported_browser',
        lastLifecycleAction: reason || 'install',
        lastError: 'Bu tarayici icin uygulama-yonetimli kurulum desteklenmiyor.'
      };
      patchSettings(patch);
      return Object.assign({ ok: false, error: patch.lastError }, buildStatus(patch));
    }
    const executablePath = status.browserExecutablePath;
    if (!executablePath || !fs.existsSync(executablePath)) {
      const patch = {
        lifecycleState: 'failed',
        compatibilityState: 'missing_browser_path',
        lastLifecycleAction: reason || 'install',
        lastError: 'Varsayilan tarayici calistiricisi bulunamadi.'
      };
      patchSettings(patch);
      return Object.assign({ ok: false, error: patch.lastError }, buildStatus(patch));
    }
    ensureManagedDirs();
    const launchProfileDir = status.managedProfileDir || path.join(managedProfileDir, 'chromium');
    try { fs.mkdirSync(launchProfileDir, { recursive: true }); } catch (_e) {}
    const args = buildManagedChromiumLaunchArgs({
      profileDir: launchProfileDir,
      extensionDir: status.installDir,
      startUrl: buildStartUrl(status)
    });
    await new Promise((resolve, reject) => {
      try {
        const child = execFile(executablePath, args, { windowsHide: false }, (error) => {
          if (error) reject(error);
        });
        if (child && typeof child.unref === 'function') child.unref();
        setTimeout(resolve, 350);
      } catch (error) {
        reject(error);
      }
    });
    const patch = {
      enabled: true,
      managedProfileDir: launchProfileDir,
      lifecycleState: 'installed_not_verified',
      compatibilityState: 'pending_verification',
      lastLifecycleAction: reason || 'install',
      lastError: '',
      updatePending: false
    };
    patchSettings(patch);
    return Object.assign({ ok: true, launched: true }, buildStatus(patch));
  }

  async function runLifecycle(action) {
    const normalizedAction = String(action || 'install').trim().toLowerCase();

    if (normalizedAction === 'test') {
      const live = await agentManager.refreshStatusSnapshot();
      const info = buildStatus(live && typeof live === 'object' ? live : {});
      const ok = !!(live && live.ok);
      const patch = {
        lastVerificationAt: Date.now(),
        lifecycleState: ok ? 'ready' : (info.installDir ? 'repair_needed' : 'not_installed'),
        compatibilityState: ok ? 'compatible' : info.compatibilityState,
        lastLifecycleAction: 'test',
        lastError: ok ? '' : 'Capture agent veya uzanti ile aktif baglanti dogrulanamadi.'
      };
      patchSettings(patch);
      return Object.assign({ ok, action: 'test', message: ok ? 'Browser Capture hazir.' : patch.lastError }, buildStatus(patch));
    }

    if (normalizedAction === 'stop_agent') {
      try {
        runtime.stopAgentRequested = true;
        await agentManager.stop();
        await agentManager.refreshStatusSnapshot();
        return Object.assign({ ok: true, action: normalizedAction, message: 'Capture agent durduruldu.' }, buildStatus());
      } catch (error) {
        return Object.assign({ ok: false, action: normalizedAction, error: error && error.message ? error.message : 'Capture agent durdurulamadi.' }, buildStatus());
      }
    }

    if (normalizedAction === 'restart_agent') {
      runtime.stopAgentRequested = false;
      try { await agentManager.stop(); } catch (_e) {}
      await agentManager.ensureRunning();
      return Object.assign({ ok: true, action: normalizedAction, message: 'Capture agent yeniden baslatildi.' }, buildStatus());
    }

    if (normalizedAction === 'update' || normalizedAction === 'repair' || normalizedAction === 'install') {
      const prepared = await prepareSetup();
      const loginItemState = agentManager.syncLoginItem(prepared.agentAutoStart !== false);
      patchSettings({
        agentAutoStartSupported: !!loginItemState.supported,
        agentAutoStart: loginItemState.supported ? !!loginItemState.enabled : (prepared.agentAutoStart !== false)
      });
      runtime.stopAgentRequested = false;
      await agentManager.ensureRunning();
      const strategy = prepared.installStrategy || determineBrowserInstallStrategy(prepared);
      if (strategy && strategy.supported && strategy.id === 'managed_chromium_session') {
        return launchManagedSession(normalizedAction);
      }
      const patch = {
        enabled: true,
        lifecycleState: 'installed_not_verified',
        compatibilityState: 'pending_verification',
        lastLifecycleAction: normalizedAction,
        lastError: ''
      };
      patchSettings(Object.assign({}, patch, { updatePending: false }));
      const statusAfterPatch = buildStatus(patch);
      const manager = await openExtensionManager(statusAfterPatch);
      if (!manager.ok) {
        try { await shell.openPath(prepared.installDir); } catch (_e) {}
      }
      return Object.assign({
        ok: true,
        action: normalizedAction,
        installDir: prepared.installDir,
        guidePath: prepared.guidePath,
        managerOpened: !!manager.ok,
        managerUrl: manager.managerUrl || statusAfterPatch.extensionManagerUrl || '',
        message: manager.ok
          ? 'Extension dosyalari guncellendi. Acilan uzantilar sayfasinda AcademiQ Browser Capture icin Reload/Yenile tusuna basin.'
          : 'Extension dosyalari guncellendi. Klasor acildi; tarayicida uzantiyi reload edin veya klasoru tekrar yukleyin.'
      }, buildStatus(Object.assign({}, patch, { updatePending: false })));
    }

    return Object.assign({ ok: false, error: 'Bilinmeyen Browser Capture aksiyonu.' }, buildStatus());
  }

  async function startBridge({ hydratePending } = {}) {
    const settings = getSettings();
    if (typeof hydratePending === 'function') hydratePending();
    if (runtime.bridge) {
      try { await runtime.bridge.close(); } catch (_e) {}
      runtime.bridge = null;
    }
    const basePort = settings.port || DEFAULT_CAPTURE_PORT;
    const candidatePorts = [basePort];
    for (let offset = 1; offset <= 6; offset += 1) candidatePorts.push(basePort + offset);
    let lastError = null;
    for (let index = 0; index < candidatePorts.length; index += 1) {
      const bridge = createBrowserCaptureBridge({
        host: '127.0.0.1',
        port: candidatePorts[index],
        token: settings.token,
        onGetTargets: () => getCaptureTargets(),
        onGetStatus: () => buildStatus(),
        onLookup: (payload) => buildLookup(payload),
        onCreateWorkspace: (name) => createWorkspace(name),
        onRequestSeen: () => {
          runtime.lastBridgeEventAt = Date.now();
          patchSettings({ lastConnectedAt: runtime.lastBridgeEventAt });
        },
        onHello: (payload) => {
          runtime.lastHelloAt = Date.now();
          runtime.lastHelloPayload = payload || {};
          runtime.lastBridgeEventAt = runtime.lastHelloAt;
          const patch = {
            lastConnectedAt: runtime.lastHelloAt,
            lastVerificationAt: runtime.lastHelloAt,
            installedExtensionVersion: payload && payload.extensionVersion ? String(payload.extensionVersion) : '',
            installedProtocolVersion: payload && payload.protocolVersion ? Number(payload.protocolVersion) : 0,
            lifecycleState: 'ready',
            compatibilityState: 'compatible',
            lastLifecycleAction: 'verify',
            lastError: '',
            updatePending: false
          };
          patchSettings(patch);
          return Object.assign({ acknowledged: true }, buildStatus(patch));
        },
        onCapture: async (payload) => {
          const imported = await importCapture(payload);
          if (imported && imported.ok) {
            return {
              ok: true,
              queued: false,
              imported: true,
              workspaceId: imported.workspace && imported.workspace.id ? imported.workspace.id : '',
              refId: imported.ref && imported.ref.id ? imported.ref.id : '',
              message: buildBrowserCaptureImportMessage(imported)
            };
          }
          return queueDispatcher.queuePayload(payload);
        }
      });
      try {
        const bound = await bridge.listen();
        runtime.bridge = bridge;
        patchSettings({ port: bound.port });
        return bound;
      } catch (error) {
        lastError = error;
        try { await bridge.close(); } catch (_e) {}
      }
    }
    throw lastError || new Error('Bridge baslatilamadi');
  }

  return {
    refreshSettings,
    ensureManagedDirs,
    buildStartUrl,
    openExtensionManager,
    prepareSetup,
    launchManagedSession,
    runLifecycle,
    startBridge
  };
}

module.exports = { createBrowserCaptureLifecycle };
