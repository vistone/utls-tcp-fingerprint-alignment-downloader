import { startGrpcServer } from '../src/lib/grpc-server.js';

startGrpcServer(50051).then(() => {
  console.log('[HUB] gRPC Download Hub ready on port 50051');
  console.log('[HUB] Press Ctrl+C to stop');
});
