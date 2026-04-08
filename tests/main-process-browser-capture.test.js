const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');

const {
  BROWSER_CAPTURE_PROTOCOL_VERSION,
  browserFromProgId,
  parseWindowsDefaultBrowserRegOutput,
  parseBrowserOpenCommandOutput,
  extractExecutableFromCommand,
  safeId,
  sanitizeDetectionMeta,
  isAllowedBridgeOrigin,
  deriveSetupState,
  compareVersions,
  evaluateBrowserCaptureLifecycle,
  determineBrowserInstallStrategy,
  buildManagedChromiumLaunchArgs,
  sanitizeCapturePayload,
  buildTargetsFromDataJSON,
  buildCaptureDeepLink,
  parseCaptureProtocolUrl,
  createBrowserCaptureBridge
} = require('../src/main-process-browser-capture.js');

test('browserFromProgId classifies chromium and firefox families', () => {
  assert.equal(browserFromProgId('ChromeHTML').family, 'chromium');
  assert.equal(browserFromProgId('FirefoxURL-308046B0AF4A39CB').family, 'firefox');
});

test('parseWindowsDefaultBrowserRegOutput extracts ProgId', () => {
  const parsed = parseWindowsDefaultBrowserRegOutput('\nProgId    REG_SZ    MSEdgeHTM\n');
  assert.equal(parsed.progId, 'MSEdgeHTM');
  assert.equal(parsed.browser.label, 'Microsoft Edge');
});

test('parseBrowserOpenCommandOutput and extractExecutableFromCommand resolve executable path', () => {
  const command = parseBrowserOpenCommandOutput('\n    (Default)    REG_SZ    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" -- "%1"\n');
  assert.equal(command, '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" -- "%1"');
  assert.equal(extractExecutableFromCommand(command), 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
});

test('sanitizeCapturePayload normalizes DOI and unsupported comparison ids', () => {
  const payload = sanitizeCapturePayload({
    doi: 'https://doi.org/10.1000/ABC.DEF',
    selectedComparisonId: 'unknown-id',
    detectedAuthors: ['A', 'B']
  });
  assert.equal(payload.doi, '10.1000/abc.def');
  assert.equal(payload.selectedComparisonId, '');
  assert.deepEqual(payload.detectedAuthors, ['A', 'B']);
});

test('sanitizeCapturePayload removes unsafe url and invalid ids while preserving detection meta', () => {
  const payload = sanitizeCapturePayload({
    sourcePageUrl: 'file:///secret',
    pdfUrl: 'javascript:alert(1)',
    selectedWorkspaceId: 'ws 1',
    detectionMeta: {
      doi: { value: '10.1000/test', source: 'citation_meta', confidence: 'strong', found: true },
      pdfUrl: { value: 'https://example.org/a.pdf', source: 'page_link', confidence: 'medium', found: true }
    }
  });
  assert.equal(payload.sourcePageUrl, '');
  assert.equal(payload.pdfUrl, '');
  assert.equal(payload.selectedWorkspaceId, '');
  assert.equal(payload.detectionMeta.doi.source, 'citation_meta');
  assert.equal(payload.detectionMeta.pdfUrl.confidence, 'medium');
});

test('safeId and setup state helpers stay conservative', () => {
  assert.equal(safeId('ws-1_ok'), 'ws-1_ok');
  assert.equal(safeId('ws 1'), '');
  const detectionMeta = sanitizeDetectionMeta({
    doi: { value: '10.1000/test', source: 'unknown-source', confidence: 'loud', found: true }
  });
  assert.equal(detectionMeta.doi.source, 'none');
  assert.equal(detectionMeta.doi.confidence, 'weak');
  assert.equal(deriveSetupState({ browserFamily: 'chromium' }), 'not_setup');
  assert.equal(deriveSetupState({ browserFamily: 'chromium', installDir: 'C:/x' }), 'setup_ready');
  assert.equal(deriveSetupState({ browserFamily: 'chromium', installDir: 'C:/x', lastConnectedAt: 1 }), 'connection_failed');
  assert.equal(deriveSetupState({ browserFamily: 'chromium', bridgeConnected: true }), 'connected');
});

test('lifecycle evaluation flags updates and protocol mismatches', () => {
  const updateState = evaluateBrowserCaptureLifecycle({
    browserFamily: 'chromium',
    installDir: 'C:/x',
    bundledExtensionVersion: '1.2.0',
    installedExtensionVersion: '1.0.0',
    bridgeProtocolVersion: BROWSER_CAPTURE_PROTOCOL_VERSION,
    installedProtocolVersion: BROWSER_CAPTURE_PROTOCOL_VERSION
  });
  assert.equal(updateState.lifecycleState, 'update_available');
  assert.equal(updateState.updateAvailable, true);

  const protocolState = evaluateBrowserCaptureLifecycle({
    browserFamily: 'chromium',
    installDir: 'C:/x',
    bundledExtensionVersion: '1.2.0',
    installedExtensionVersion: '1.2.0',
    bridgeProtocolVersion: BROWSER_CAPTURE_PROTOCOL_VERSION,
    installedProtocolVersion: BROWSER_CAPTURE_PROTOCOL_VERSION + 1
  });
  assert.equal(protocolState.lifecycleState, 'version_mismatch');
  assert.equal(protocolState.protocolMismatch, true);
});

test('managed install strategy only supports chromium with executable path', () => {
  assert.equal(determineBrowserInstallStrategy({ browserFamily: 'chromium', browserExecutablePath: 'C:/chrome.exe' }).supported, true);
  assert.equal(determineBrowserInstallStrategy({ browserFamily: 'firefox', browserExecutablePath: 'C:/firefox.exe' }).supported, false);
});

test('managed chromium launch args stay deterministic', () => {
  const args = buildManagedChromiumLaunchArgs({
    profileDir: 'C:/profile',
    extensionDir: 'C:/extension',
    startUrl: 'http://127.0.0.1:27183/status'
  });
  assert.deepEqual(args, [
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
    '--new-window',
    '--user-data-dir=C:/profile',
    '--load-extension=C:/extension',
    'http://127.0.0.1:27183/status'
  ]);
});

test('origin allowlist accepts extension origins and rejects random sites', () => {
  assert.equal(isAllowedBridgeOrigin('chrome-extension://abc123'), true);
  assert.equal(isAllowedBridgeOrigin('moz-extension://abc123'), true);
  assert.equal(isAllowedBridgeOrigin('http://127.0.0.1:1234'), true);
  assert.equal(isAllowedBridgeOrigin('https://evil.example.com'), false);
});

test('buildTargetsFromDataJSON exposes workspace list and literature matrix option', () => {
  const targets = buildTargetsFromDataJSON(JSON.stringify({
    cur: 'ws2',
    wss: [
      { id: 'ws1', name: 'Bir' },
      { id: 'ws2', name: 'Iki' }
    ]
  }));
  assert.equal(targets.activeWorkspaceId, 'ws2');
  assert.equal(targets.workspaces.length, 2);
  assert.equal(targets.workspaces[0].comparisons[1].id, 'literature-matrix');
});

test('capture deep link roundtrip restores payload', () => {
  const url = buildCaptureDeepLink({
    detectedTitle: 'Sample',
    selectedWorkspaceId: 'ws1',
    browserSource: 'Chrome'
  });
  const parsed = parseCaptureProtocolUrl(url);
  assert.equal(parsed.action, 'capture');
  assert.equal(parsed.payload.detectedTitle, 'Sample');
  assert.equal(parsed.payload.selectedWorkspaceId, 'ws1');
});

test('bridge workspace endpoint creates a response through authorized local bridge', async () => {
  const freePort = await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = address && address.port ? address.port : 0;
      probe.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    probe.on('error', reject);
  });
  let createdName = '';
  const bridge = createBrowserCaptureBridge({
    host: '127.0.0.1',
    port: freePort,
    token: 'test-token',
    onCreateWorkspace: function (name) {
      createdName = name;
      return { ok: true, workspace: { id: 'ws_new', name: name } };
    }
  });
  const bound = await bridge.listen();
  const response = await fetch(`http://127.0.0.1:${bound.port}/workspace`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-AQ-Token': 'test-token',
      'Origin': 'moz-extension://unit-test'
    },
    body: JSON.stringify({ name: 'Yeni Workspace' })
  });
  const json = await response.json();
  await bridge.close();
  assert.equal(response.status, 200);
  assert.equal(createdName, 'Yeni Workspace');
  assert.equal(json.workspace.id, 'ws_new');
});
