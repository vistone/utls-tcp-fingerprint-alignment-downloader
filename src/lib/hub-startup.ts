// Auto-start the gRPC Download Hub server when this module is imported.
// This module is imported from the root layout, ensuring the Hub starts
// with the Next.js server.

import { startGrpcServer } from './grpc-server';

let started = false;

export function ensureGrpcHub() {
  if (started) return;
  started = true;
  console.log('[HUB] Auto-starting gRPC Hub server on port 50051...');
  startGrpcServer(50051).catch((err: Error) => {
    console.error('[HUB] Failed to start gRPC server:', err.message);
  });
}

ensureGrpcHub();

// Prevent tree-shaking by making this module's exports visible
export const __version__ = '1.0.0';
