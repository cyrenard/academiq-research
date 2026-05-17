# Phase 6 Capture Architecture

This document records the existing Electron browser-capture architecture before
the Tauri sidecar port. No Phase 6 code should be written until this contract is
understood.

## High-Level Shape

```text
Chrome/Firefox extension
  popup/background/content scripts
        |
        | HTTP JSON, token-authenticated
        | http://127.0.0.1:27183
        v
Browser capture bridge
  createBrowserCaptureBridge()
        |
        +-- Electron app bridge, when app is open
        |     main.js + lifecycle/import pipeline
        |
        +-- detached capture-agent, when app is closed/background
              src/capture-agent.js
              persisted capture queue
```

The extension does not use WebSocket or native messaging. It talks to a local
HTTP server on `127.0.0.1`, default port `27183`, with a token generated and
stored in browser-capture settings.

## Extension Protocol

Source files:

- `browser-capture-extension/common/background.js`
- `browser-capture-extension/common/popup.js`
- copied into `chromium/` and `firefox/`

Runtime config is injected as `globalThis.AQ_CAPTURE_CONFIG` during extension
bundle preparation:

```js
{
  token,
  port,
  bridgeBaseUrl: "http://127.0.0.1:<port>",
  appProtocol: "academiq://",
  browserFamily,
  browserLabel
}
```

Every bridge call includes the token, either as `?token=...` or `X-AQ-Token`.
The bridge allows origins from `chrome-extension://`, `moz-extension://`,
`localhost`, `127.0.0.1`, and `null`.

### HTTP Endpoints

```text
GET  /status
GET  /targets
POST /hello
POST /capture
POST /lookup
POST /workspace
POST /agent/stop
```

`/hello` payload:

```json
{
  "extensionVersion": "1.0.1",
  "protocolVersion": 1,
  "browserFamily": "chromium",
  "browserName": "Google Chrome",
  "timestamp": 1779020000000
}
```

`/capture` payload, after host sanitization:

```json
{
  "referenceType": "article",
  "sourcePageUrl": "https://example.org/article",
  "pageTitle": "Article page title",
  "doi": "10.1234/example",
  "isbn": "",
  "pdfUrl": "https://example.org/article.pdf",
  "detectedTitle": "Detected Article Title",
  "detectedAuthors": ["Ada Lovelace"],
  "detectedJournal": "Journal Name",
  "detectedYear": "2026",
  "detectedAbstract": "Abstract text",
  "selectedWorkspaceId": "workspace-id",
  "selectedComparisonId": "literature-matrix",
  "browserSource": "Google Chrome",
  "timestamp": 1779020000000,
  "detectionMeta": {
    "doi": { "value": "10.1234/example", "source": "doi_url", "confidence": "strong", "found": true },
    "pdfUrl": { "value": "https://example.org/article.pdf", "source": "page_link", "confidence": "medium", "found": true }
  }
}
```

`/targets` response:

```json
{
  "ok": true,
  "activeWorkspaceId": "workspace-id",
  "workspaces": [
    {
      "id": "workspace-id",
      "name": "Workspace",
      "comparisons": [
        { "id": "", "name": "Yok" },
        { "id": "literature-matrix", "name": "Literatur Matrisi" }
      ]
    }
  ],
  "preferredWorkspaceId": "workspace-id",
  "preferredComparisonId": ""
}
```

`/workspace` payload:

```json
{ "name": "New Workspace" }
```

## Queue Model

There are two queue layers.

### Renderer Delivery Queue

`src/main-process-browser-capture-store.js` stores pending payloads under
browser-capture settings as `pendingPayloads`. Entries are capped at 40:

```json
{
  "id": "cap_lx...",
  "createdAt": 1779020000000,
  "payload": { "...": "sanitized capture payload" }
}
```

`src/main-process-capture-queue-dispatcher.js` hydrates this queue, sends
`browserCapture:incoming` to the renderer, dedupes recent sends for 1.5 seconds,
and removes entries when `browserCapture:ackPayload` is called.

### Detached Agent Persistent Queue

`src/capture-agent.js` stores a richer queue with `items`:

```json
{
  "id": "q_lx...",
  "type": "capture",
  "status": "queued",
  "createdAt": 1779020000000,
  "updatedAt": 1779020000000,
  "attemptCount": 0,
  "nextRetryAt": 0,
  "lastError": "",
  "clientWorkspaceId": "",
  "realWorkspaceId": "",
  "name": "",
  "payload": { "...": "sanitized capture payload" },
  "result": {}
}
```

Status values:

- `queued`
- `imported`
- `duplicate_attached`
- `failed`

Retries are exponential, starting at 15 seconds, capped at 10 minutes, and stop
after 5 attempts. Workspace creation is processed before capture import so
captures targeting a pending workspace can be remapped to the real workspace id.

## Lifecycle

`src/main-process-capture-lifecycle.js` owns high-level actions:

- detect default browser and browser executable
- prepare extension bundle into app data
- write `config.js` with token/port
- write install/managed-session guide files
- launch managed Chromium profile
- open extension manager
- start the local bridge in-app
- run `install`, `repair`, `update`, `test`, `restart_agent`, `stop_agent`

`src/main-process-capture-agent-manager.js` owns detached process behavior:

- build spawn args: `--capture-agent`
- optional autostart args: `--capture-agent --capture-agent-autostart`
- start detached helper
- poll `/status`
- stop with `POST /agent/stop`
- reflect state into `capture-agent-state`

`src/main-process-capture-status-builder.js` aggregates settings, queue stats,
extension manifest version, last hello data, and lifecycle state into the status
object used by the renderer.

## IPC Handler Map

The current Electron handlers live in `main.js`.

| IPC | Existing behavior | Sidecar method |
| --- | --- | --- |
| `browserCapture:getStatus` | refresh settings, refresh agent snapshot, return aggregate status | `getStatus` |
| `browserCapture:prepareSetup` | run lifecycle `install` | `prepareSetup` |
| `browserCapture:runAction` | run lifecycle action string | `runAction` |
| `browserCapture:testConnection` | run lifecycle `test` | `testConnection` |
| `browserCapture:lookup` | build duplicate/target preview from payload | `lookup` |
| `browserCapture:openInstallDir` | open prepared extension folder | `openInstallDir` |
| `browserCapture:openGuide` | open install guide file | `openGuide` |
| `browserCapture:updatePrefs` | persist safe preference patch, maybe start agent | `updatePrefs` |
| `browserCapture:createWorkspace` | create workspace from main process | `createWorkspace` |
| `browserCapture:rendererReady` | mark renderer ready, process queue, flush pending payloads | `rendererReady` |
| `browserCapture:ackPayload` | remove pending payload by queue id | `ackPayload` |

The plan text calls this "12 handlers", but the current preload/API surface has
11 callable browser-capture methods plus 3 event subscriptions:

- `onBrowserCaptureIncoming`
- `onBrowserCaptureWorkspaceCreated`
- `onBrowserCaptureStateChanged`

Phase 6 should preserve all existing method names and event names.

## Tauri Sidecar Boundary

The sidecar should keep the existing extension HTTP protocol unchanged. Tauri
Rust should not expose the extension directly; instead it should call the Node
sidecar through stdio JSON-RPC:

```json
{ "id": "uuid", "method": "getStatus", "params": {} }
{ "id": "uuid", "result": { "ok": true } }
{ "method": "browserCapture:incoming", "params": { "queueId": "cap_lx..." } }
```

Important porting constraint: current Electron imports captures into app state
inside `main.js`, using legacy runtime globals such as `AQWebRelatedPapers` and
`AQLiteratureMatrixState`. The sidecar can own the HTTP bridge and persistent
agent queue, but Tauri/Rust still needs a host-side import strategy for the
workspace/library mutation. The safest Phase 6 bridge is:

1. sidecar receives `/capture`;
2. sidecar notifies Rust over stdio;
3. Rust emits `browserCapture:incoming` to renderer or invokes an equivalent
   host import path;
4. renderer acknowledges with `ackPayload`.

## Open Questions For Implementation

- Whether Phase 6 should keep the app-open direct import behavior or route all
  captures through the pending queue and renderer event path.
- How much of `importBrowserCaptureIntoState` should move into the sidecar
  versus remain in Tauri/Rust/renderer glue.
- Whether autostart/login-item behavior is still required for the Tauri sidecar,
  since the sidecar will normally be child-managed by Tauri.

