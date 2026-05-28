/**
 * Simple file-based KV database for the storage server.
 * Each file is stored as:
 *   data/{file_id}.file   - raw file content
 *   data/{file_id}.meta   - JSON metadata
 *   data/index.json       - in-memory index for fast listing
 * 
 * In production, this could be replaced with LevelDB, RocksDB, or SQLite.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

const DATA_DIR = path.join(process.cwd(), 'data');
const INDEX_PATH = path.join(DATA_DIR, 'index.json');

interface FileRecord {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  storedAt: number;
  metadata: Record<string, string>;
  checksum: string;  // SHA-256 of content
}

interface Index {
  files: Record<string, FileRecord>;
  totalBytes: number;
}

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Load or create index
let index: Index = { files: {}, totalBytes: 0 };

function loadIndex(): void {
  try {
    if (fs.existsSync(INDEX_PATH)) {
      index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
    }
  } catch {
    index = { files: {}, totalBytes: 0 };
  }
}

function saveIndex(): void {
  // Atomic write: write to temp file then rename
  const tmpPath = INDEX_PATH + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(index, null, 2), 'utf-8');
  fs.renameSync(tmpPath, INDEX_PATH);
}

loadIndex();

// ===== Public API =====

export function storeFile(
  filename: string,
  data: Buffer,
  mimeType: string,
  metadata: Record<string, string>,
): { id: string; path: string } {
  // Generate unique ID
  const id = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const filePath = path.join(DATA_DIR, `${id}.file`);
  const checksum = crypto.createHash('sha256').update(data).digest('hex');

  // Write file
  fs.writeFileSync(filePath, data);

  // Store metadata
  const record: FileRecord = {
    id,
    filename,
    mimeType,
    size: data.length,
    storedAt: Date.now(),
    metadata,
    checksum,
  };

  index.files[id] = record;
  index.totalBytes += data.length;
  saveIndex();

  console.log(`[KV] Stored: ${filename} (${(data.length / 1024).toFixed(1)} KB) -> ${filePath}`);
  return { id, path: filePath };
}

export function getFile(id: string): { data: Buffer; record: FileRecord } | null {
  const record = index.files[id];
  if (!record) return null;

  const filePath = path.join(DATA_DIR, `${id}.file`);
  if (!fs.existsSync(filePath)) return null;

  return { data: fs.readFileSync(filePath), record };
}

export function listFiles(): FileRecord[] {
  return Object.values(index.files)
    .sort((a, b) => b.storedAt - a.storedAt);
}

export function deleteFile(id: string): boolean {
  const record = index.files[id];
  if (!record) return false;

  const filePath = path.join(DATA_DIR, `${id}.file`);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    delete index.files[id];
    index.totalBytes -= record.size;
    saveIndex();
    return true;
  } catch {
    return false;
  }
}

export function getStats(): { fileCount: number; totalBytes: number; dataDir: string } {
  return {
    fileCount: Object.keys(index.files).length,
    totalBytes: index.totalBytes,
    dataDir: DATA_DIR,
  };
}
