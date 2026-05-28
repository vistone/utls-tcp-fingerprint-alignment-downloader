import test from "node:test";
import assert from "node:assert/strict";

import { validateOutboundUrl } from "../src/lib/ssrf.ts";

test("validateOutboundUrl accepts public http and https URLs", async () => {
  assert.equal((await validateOutboundUrl("https://93.184.216.34/file.bin")).valid, true);
  assert.equal((await validateOutboundUrl("http://93.184.216.34/file.bin")).valid, true);
});

test("validateOutboundUrl rejects non-http protocols", async () => {
  const result = await validateOutboundUrl("file:///etc/passwd");

  assert.equal(result.valid, false);
  assert.match(result.error || "", /http/i);
});

test("validateOutboundUrl rejects direct private and reserved IPs", async () => {
  const privateResult = await validateOutboundUrl("http://127.0.0.1:3000/");
  const metadataResult = await validateOutboundUrl("http://169.254.169.254/latest/meta-data/");

  assert.equal(privateResult.valid, false);
  assert.equal(metadataResult.valid, false);
});
