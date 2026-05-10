export {};

type IpcResult<T = unknown> = Promise<T>;
type BrowserCaptureListener = (payload: unknown) => void;

declare global {
  interface Window {
    electronAPI: {
      loadData: () => IpcResult<{ ok: boolean; data?: string; dir?: string; error?: string }>;
      saveData: (json: string | Record<string, unknown>) => IpcResult<unknown>;
      saveEditorDraft: (json: string | Record<string, unknown>) => IpcResult<unknown>;
      savePDF: (refId: string, buf: ArrayBuffer | Uint8Array, ws?: unknown) => IpcResult<unknown>;
      loadPDF: (refId: string, ws?: unknown) => IpcResult<unknown>;
      pdfExists: (refId: string, ws?: unknown) => IpcResult<unknown>;
      deletePDF: (refId: string, ws?: unknown) => IpcResult<unknown>;
      showPdfInExplorer: (refId: string, ws?: unknown) => IpcResult<unknown>;
      deleteWorkspacePdfFolder: (ws?: unknown) => IpcResult<unknown>;
      downloadPDFfromURL: (url: string, refId: string, options?: unknown) => IpcResult<unknown>;
      netFetchJSON: (url: string, options?: unknown) => IpcResult<unknown>;
      netFetchText: (url: string, options?: unknown) => IpcResult<unknown>;
      pdfSyncAll: () => IpcResult<unknown>;
      openPDFDialog: () => IpcResult<unknown>;
      wordToHtml: (filePath: string) => IpcResult<unknown>;
      exportPDF: (options?: unknown) => IpcResult<unknown>;
      exportAnnotatedPdfNative: (options?: unknown) => IpcResult<unknown>;
      exportDOCX: (options?: unknown) => IpcResult<unknown>;
      getSyncSettings: () => IpcResult<unknown>;
      setSyncDir: () => IpcResult<unknown>;
      clearSyncDir: () => IpcResult<unknown>;
      getAppInfo: () => IpcResult<unknown>;
      getDocumentHistory: (docId: string, limit?: number) => IpcResult<unknown>;
      restoreDocumentHistorySnapshot: (docId: string, snapshotId: string) => IpcResult<unknown>;
      getBrowserCaptureStatus: () => IpcResult<unknown>;
      prepareBrowserCaptureSetup: () => IpcResult<unknown>;
      runBrowserCaptureAction: (action: string) => IpcResult<unknown>;
      testBrowserCaptureConnection: () => IpcResult<unknown>;
      lookupBrowserCaptureTarget: (payload: unknown) => IpcResult<unknown>;
      openBrowserCaptureInstallDir: () => IpcResult<unknown>;
      openBrowserCaptureGuide: () => IpcResult<unknown>;
      updateBrowserCapturePrefs: (prefs: unknown) => IpcResult<unknown>;
      createBrowserCaptureWorkspace: (name: string) => IpcResult<unknown>;
      browserCaptureRendererReady: () => IpcResult<unknown>;
      ackBrowserCapturePayload: (queueId: string) => IpcResult<unknown>;
      onBrowserCaptureIncoming: (callback: BrowserCaptureListener) => () => void;
      onBrowserCaptureWorkspaceCreated: (callback: BrowserCaptureListener) => () => void;
      onBrowserCaptureStateChanged: (callback: BrowserCaptureListener) => () => void;
      checkUpdate: () => IpcResult<unknown>;
      downloadUpdate: (url: string) => IpcResult<unknown>;
      setUpdateUrl: (url: string) => IpcResult<unknown>;
      restartApp: () => IpcResult<unknown>;
    };
    ocrAPI: {
      recognize: (payload: unknown) => IpcResult<unknown>;
    };
  }
}

