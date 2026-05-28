#!/usr/bin/env tsx
/**
 * List all stored files in the KV database.
 * Usage: npx tsx src/list-files.ts
 */
import { listFiles, getStats } from './kv-store.js';

const files = listFiles();
const stats = getStats();

console.log(`\n📦 KV Database: ${stats.fileCount} files, ${(stats.totalBytes / 1048576).toFixed(2)} MB total\n`);

if (files.length === 0) {
  console.log('  No files stored yet.\n');
  process.exit(0);
}

for (const f of files) {
  const date = new Date(f.storedAt).toISOString().slice(0, 19);
  const size = f.size > 1048576
    ? `${(f.size / 1048576).toFixed(2)} MB`
    : `${(f.size / 1024).toFixed(1)} KB`;
  console.log(`  ${f.id}`);
  console.log(`    File:   ${f.filename}`);
  console.log(`    Size:   ${size}`);
  console.log(`    Type:   ${f.mimeType}`);
  console.log(`    Date:   ${date}`);
  console.log(`    Source: ${f.metadata?.source_url || '-'}`);
  console.log();
}
