const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const protoPath = path.join(__dirname, '..', 'sidecar/proto/sidecar.proto');
const pkgDef = protoLoader.loadSync(protoPath, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });
const proto = grpc.loadPackageDefinition(pkgDef);
const client = new proto.sidecar.FingerprintDownloader('localhost:50053', grpc.credentials.createInsecure());

function testCDN(name, cdnType, browserPreset, userAgent) {
  return new Promise((resolve) => {
    console.log(`\n=== ${name} ===`);
    const call = client.Download({
      target_url: 'https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png',
      browser_preset: browserPreset,
      user_agent: userAgent,
      tcp_ttl: 0, tcp_mss: 0,
      cdn_type: cdnType,
    }, { deadline: new Date(Date.now() + 30000) });

    let hasCDN = false, hasTCPreal = false, hasTLS = false, hasComplete = false;

    call.on('data', (event) => {
      if (event.log) {
        const m = event.log.message;
        if (m.includes('[CDN]')) { hasCDN = true; console.log('  📦', m.substring(0, 90)); }
        else if (m.includes('[CDN-TCP')) { hasTCPreal = true; console.log('  🔴', m); }
        else if (m.includes('[CDN-WARN')) { console.log('  ⚠️', m); }
        else if (m.includes('TLS ') || m.includes('TLS|')) { hasTLS = true; console.log('  🔵', m.substring(0, 100)); }
        else if (m.includes('[TCP-SYN]') && m.includes('TTL')) console.log('  📋', m);
        else if (m) console.log('  ', m.substring(0, 100));
      }
      if (event.complete) { hasComplete = true; }
    });
    call.on('error', (err) => { console.log('  ❌ ERROR:', err.message); resolve({ name, hasCDN, hasTCPreal, hasTLS, hasComplete }); });
    call.on('end', () => { resolve({ name, hasCDN, hasTCPreal, hasTLS, hasComplete }); });
  });
}

(async () => {
  const results = [];
  results.push(await testCDN('Cloudflare (Chrome Win)', 'cloudflare',
    'chrome_124', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36'));
  results.push(await testCDN('Akamai (Chrome macOS)', 'akamai',
    'chrome_124', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124.0.0.0 Safari/537.36'));
  results.push(await testCDN('Imperva (Firefox Win)', 'incapsula',
    'firefox_120', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Firefox/120.0'));
  results.push(await testCDN('F5/AWS (Safari macOS)', 'custom',
    'safari_17', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.2 Safari/605.1.15'));
  console.log('\n========== 全部结果 ==========');
  for (const r of results) {
    const p = (r.hasCDN && r.hasTCPreal && r.hasTLS && r.hasComplete) ? '✅ 通过' : '❌ 失败';
    console.log(`${p} ${r.name}: CDN=${r.hasCDN?'✅':'❌'} TCP=${r.hasTCPreal?'✅':'❌'} TLS=${r.hasTLS?'✅':'❌'} HTTP=${r.hasComplete?'✅':'❌'}`);
  }
  client.close();
  process.exit(0);
})();
