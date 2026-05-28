// Auto-start the gRPC Download Hub server when this module is imported.
// This module is imported from the root layout, ensuring the Hub starts
// with the Next.js server.

import { startGrpcServer } from './grpc-server';

let started = false;

export function ensureGrpcHub() {
  if (started) return;
  started = true;
  
  // Don't start during build or test environments
  if (process.env.NODE_ENV === 'test' || process.env.NEXT_PHASE === 'phase-production-build') {
    return;
  }
  
  console.log('[HUB] Auto-starting gRPC Hub server on port 50051...');
  startGrpcServer(50051).catch((err: Error) => {
    if (err.message?.includes('EADDRINUSE')) {
      console.log('[HUB] Port 50051 already in use (likely already running)');
    } else {
      console.error('[HUB] Failed to start gRPC server:', err.message);
    }
  });
}

ensureGrpcHub();
