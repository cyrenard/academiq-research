PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT,
  body_json TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id TEXT,
  snapshot_json TEXT,
  created_at TEXT,
  FOREIGN KEY(doc_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tabs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id TEXT,
  position INTEGER,
  active INTEGER
);

CREATE TABLE IF NOT EXISTS library_items (
  id TEXT PRIMARY KEY,
  title TEXT,
  authors TEXT,
  year INTEGER,
  doi TEXT,
  abstract TEXT,
  pdf_path TEXT,
  metadata_json TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS library_fts USING fts5(
  title,
  authors,
  abstract,
  content=library_items,
  content_rowid=rowid
);

CREATE TRIGGER IF NOT EXISTS library_items_ai AFTER INSERT ON library_items BEGIN
  INSERT INTO library_fts(rowid, title, authors, abstract)
  VALUES (new.rowid, new.title, new.authors, new.abstract);
END;

CREATE TRIGGER IF NOT EXISTS library_items_ad AFTER DELETE ON library_items BEGIN
  INSERT INTO library_fts(library_fts, rowid, title, authors, abstract)
  VALUES('delete', old.rowid, old.title, old.authors, old.abstract);
END;

CREATE TRIGGER IF NOT EXISTS library_items_au AFTER UPDATE ON library_items BEGIN
  INSERT INTO library_fts(library_fts, rowid, title, authors, abstract)
  VALUES('delete', old.rowid, old.title, old.authors, old.abstract);
  INSERT INTO library_fts(rowid, title, authors, abstract)
  VALUES (new.rowid, new.title, new.authors, new.abstract);
END;

CREATE TABLE IF NOT EXISTS citations (
  id TEXT PRIMARY KEY,
  doc_id TEXT,
  library_id TEXT,
  mode TEXT,
  data_json TEXT
);

CREATE TABLE IF NOT EXISTS bibliography_entries (
  id TEXT PRIMARY KEY,
  doc_id TEXT,
  library_id TEXT,
  csl_json TEXT
);

CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  ref_id TEXT,
  page INTEGER,
  type TEXT,
  data_json TEXT
);

CREATE TABLE IF NOT EXISTS highlights (
  id TEXT PRIMARY KEY,
  ref_id TEXT,
  page INTEGER,
  range_json TEXT,
  color TEXT
);

CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_revisions_doc_id ON revisions(doc_id);
CREATE INDEX IF NOT EXISTS idx_tabs_doc_id ON tabs(doc_id);
CREATE INDEX IF NOT EXISTS idx_citations_doc_id ON citations(doc_id);
CREATE INDEX IF NOT EXISTS idx_bibliography_entries_doc_id ON bibliography_entries(doc_id);
CREATE INDEX IF NOT EXISTS idx_annotations_ref_id ON annotations(ref_id);
CREATE INDEX IF NOT EXISTS idx_highlights_ref_id ON highlights(ref_id);

INSERT OR IGNORE INTO schema_version(version, applied_at) VALUES (1, datetime('now'));
