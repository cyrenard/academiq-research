export {};

type IpcResult<T = unknown> = Promise<T>;
type BrowserCaptureListener = (payload: unknown) => void;

declare global {
  interface Window {
    electronAPI: {
      loadData: () => IpcResult<{ ok: boolean; data?: string; dir?: string; error?: string }>;
      saveData: (json: string | Record<string, unknown>, source?: string) => IpcResult<unknown>;
      saveEditorDraft: (json: string | Record<string, unknown>) => IpcResult<unknown>;
      savePDF: (refId: string, buf: ArrayBuffer | Uint8Array, ws?: unknown) => IpcResult<unknown>;
      loadPDF: (refId: string, ws?: unknown) => IpcResult<unknown>;
      pdfExists: (refId: string, ws?: unknown) => IpcResult<unknown>;
      deletePDF: (refId: string, ws?: unknown) => IpcResult<unknown>;
      showPdfInExplorer: (refId: string, ws?: unknown) => IpcResult<unknown>;
      deleteWorkspacePdfFolder: (ws?: unknown) => IpcResult<unknown>;
      downloadPDFfromURL: (url: string, refId: string, options?: unknown) => IpcResult<unknown>;
      openExternalUrl: (url: string) => IpcResult<unknown>;
      netFetchJSON: (url: string, options?: unknown) => IpcResult<unknown>;
      netFetchText: (url: string, options?: unknown) => IpcResult<unknown>;
      pdfSyncAll: () => IpcResult<unknown>;
      openPDFDialog: () => IpcResult<unknown>;
      openWordDialog?: () => IpcResult<unknown>;
      openBibliographyDialog?: () => IpcResult<unknown>;
      wordToHtml: (filePath: string) => IpcResult<unknown>;
      exportPDF: (options?: unknown) => IpcResult<unknown>;
      exportAnnotatedPdfNative: (options?: unknown) => IpcResult<unknown>;
      exportDOCX: (options?: unknown) => IpcResult<unknown>;
      getSyncSettings: () => IpcResult<unknown>;
      setSyncDir: () => IpcResult<unknown>;
      clearSyncDir: () => IpcResult<unknown>;
      createBackup: () => IpcResult<unknown>;
      restoreBackup: () => IpcResult<unknown>;
      getLocalMatrixAssistantStatus: (settings?: unknown) => IpcResult<unknown>;
      rankLocalMatrixCandidates: (payload: unknown) => IpcResult<unknown>;
      composeLocalMatrixCells: (payload: unknown) => IpcResult<unknown>;
      getAppInfo: () => IpcResult<unknown>;
      getDocumentHistory: (docId: string, limit?: number) => IpcResult<unknown>;
      restoreDocumentHistorySnapshot: (docId: string, snapshotId: string) => IpcResult<unknown>;
      getBrowserCaptureStatus: () => IpcResult<unknown>;
      prepareBrowserCaptureSetup: (browserFamily?: string) => IpcResult<unknown>;
      runBrowserCaptureAction: (action: string, browserFamily?: string) => IpcResult<unknown>;
      testBrowserCaptureConnection: () => IpcResult<unknown>;
      lookupBrowserCaptureTarget: (payload: unknown) => IpcResult<unknown>;
      openBrowserCaptureInstallDir: (browserFamily?: string) => IpcResult<unknown>;
      openBrowserCaptureGuide: (browserFamily?: string) => IpcResult<unknown>;
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
      minimizeWindow: () => IpcResult<unknown>;
      startWindowDrag?: () => IpcResult<unknown>;
      toggleMaximizeWindow: () => IpcResult<unknown>;
      closeWindow: () => IpcResult<unknown>;
      db?: {
        librarySearch?: (query: string) => IpcResult<unknown>;
        libraryGet?: (id: string) => IpcResult<unknown>;
        integrityCheck?: () => IpcResult<unknown>;
        forceRemigrateHistory?: () => IpcResult<unknown>;
        rollbackToLegacyJson?: () => IpcResult<unknown>;
      };
      spell?: {
        check: (text: string, lang?: string, wsId?: string) => IpcResult<Array<{ offset: number; length: number; word: string; suggestions: string[] }>>;
        suggest: (word: string, lang?: string, wsId?: string) => IpcResult<string[]>;
        addUserWord: (word: string, lang?: string, wsId?: string) => IpcResult<void>;
        getUserDictionary: (lang?: string, wsId?: string) => IpcResult<string[]>;
      };
      fs?: {
        readFileText?: (path: string) => IpcResult<string>;
        readFileBase64?: (path: string) => IpcResult<string>;
      };
      pdf?: {
        extractMetadata?: (refId: string, ws?: unknown) => IpcResult<unknown>;
        applyAnnotations?: (refId: string, ws?: unknown, annotations?: unknown[]) => IpcResult<unknown>;
        readAnnotations?: (refId: string, ws?: unknown) => IpcResult<unknown>;
        renderPage?: (refId: string, ws?: unknown, page?: number, dpi?: number) => IpcResult<unknown>;
        extractText?: (refId: string, ws?: unknown, page?: number) => IpcResult<unknown>;
        getOutline?: (refId: string, ws?: unknown) => IpcResult<unknown>;
        ingest?: (filePath: string) => IpcResult<unknown>;
      };
    };
    ocrAPI: {
      recognize: (payload: unknown) => IpcResult<unknown>;
    };
  }
}
