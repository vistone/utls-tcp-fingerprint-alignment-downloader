const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const protoPath = path.join(__dirname, '..', 'sidecar/proto/sidecar.proto');

const pkgDef = protoLoader.loadSync(protoPath, {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
});
const proto = grpc.loadPackageDefinition(pkgDef);
const service = proto.sidecar.FingerprintDownloader;
const client = new service('localhost:50053', grpc.credentials.createInsecure());

console.log('=== 1. Ping Test ===');
client.Ping({}, { deadline: new Date(Date.now() + 5000) }, (err, resp) => {
  if (err) {
    console.error('Ping FAILED:', err.message);
    process.exit(1);
  }
  console.log('Ping OK:', JSON.stringify(resp));

  console.log('\n=== 2. Download with Fingerprint Control ===');
  console.log('Target: google logo PNG');
  const call = client.Download({
    target_url: 'https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png',
    browser_preset: 'chrome_124',
    tcp_ttl: 128,
    tcp_mss: 1460,
    tcp_window_scale: 8,
    tcp_sack: true,
    tcp_timestamps: true,
    tcp_window_size: 65535,
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    enable_grease: true,
    h2_window_increment: 6291456,
  }, { deadline: new Date(Date.now() + 30000) });

  let eventCount = 0;
  let completeEvent = null;
  call.on('data', (event) => {
    eventCount++;
    if (event.log) console.log('  LOG:', event.log.message.substring(0, 130));
    else if (event.tcp_info) {
      console.log('  🔴 TCP-REAL (actual SYN params):', JSON.stringify(event.tcp_info, null, 2));
    }
    else if (event.tls_info) {
      console.log('  🔵 TLS (uTLS browser fingerprint):', JSON.stringify(event.tls_info, null, 2));
    }
    else if (event.state) {
      if (event.state.state === 'downloading') process.stdout.write('  STATE: downloading...');
      else console.log('  STATE:', event.state.state);
    }
    else if (event.error) console.log('  ERROR:', event.error.message);
    else if (event.progress) {
      if (event.progress.progress % 50 === 0 || event.progress.progress >= 99)
        console.log('  PROGRESS:', event.progress.progress.toFixed(1) + '%', '(' + (event.progress.received_bytes/1024).toFixed(1) + ' KB @ ' + (event.progress.speed_mbps/8).toFixed(2) + ' MB/s)');
    }
    else if (event.complete) {
      completeEvent = event.complete;
      console.log('  ✅ COMPLETE:', JSON.stringify(event.complete));
    }
  });
  call.on('error', (err) => { console.error('GRPC ERROR:', err.details || err.message); process.exit(1); });
  call.on('end', () => {
    console.log('\n=== RESULTS ===');
    console.log('Total events:', eventCount);
    if (completeEvent) {
      console.log('Download: SUCCESS');
      console.log('Size:', (completeEvent.total_bytes / 1024).toFixed(1), 'KB');
      console.log('Duration:', completeEvent.duration_seconds.toFixed(2), 's');
      console.log('Avg Speed:', (completeEvent.avg_speed_mbps / 8).toFixed(2), 'MB/s');
    } else {
      console.log('Download: FAILED - no complete event');
    }
    client.close();
    process.exit(0);
  });
});
