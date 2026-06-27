import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SsrfError,
  assertUrlAllowed,
  isBlockedAddress,
  type LookupFn,
} from "../safe-fetch.js";

describe("isBlockedAddress", () => {
  it("blocks loopback, private, link-local, and unique-local ranges", () => {
    for (const ip of [
      "127.0.0.1",
      "169.254.169.254", // cloud metadata endpoint
      "10.1.2.3",
      "192.168.1.1",
      "172.16.5.5",
      "172.31.0.1",
      "0.0.0.0",
      "::1",
      "::",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "::ffff:127.0.0.1", // IPv4-mapped loopback
      "::ffff:10.0.0.1", // IPv4-mapped private
    ]) {
      assert.equal(isBlockedAddress(ip), true, `${ip} should be blocked`);
    }
  });

  it("allows public addresses, including /12 boundaries and IPv4-mapped public", () => {
    for (const ip of [
      "93.184.216.34",
      "8.8.8.8",
      "1.1.1.1",
      "172.15.0.1", // just below 172.16/12
      "172.32.0.1", // just above 172.16/12
      "2606:2800:220:1:248:1893:25c8:1946",
      "::ffff:93.184.216.34",
    ]) {
      assert.equal(isBlockedAddress(ip), false, `${ip} should be allowed`);
    }
  });

  it("fails safe on unparseable input", () => {
    assert.equal(isBlockedAddress("not-an-ip"), true);
    assert.equal(isBlockedAddress(""), true);
  });
});

describe("assertUrlAllowed scheme guard", () => {
  const noLookup: LookupFn = async () => {
    throw new Error("DNS should not be consulted for these cases");
  };

  it("rejects non-http(s) schemes", async () => {
    for (const url of ["file:///etc/passwd", "ftp://example.com/x", "gopher://example.com"]) {
      await assert.rejects(assertUrlAllowed(url, noLookup), SsrfError, url);
    }
  });

  it("rejects malformed URLs", async () => {
    await assert.rejects(assertUrlAllowed("http://", noLookup), SsrfError);
    await assert.rejects(assertUrlAllowed("not a url", noLookup), SsrfError);
  });
});

describe("assertUrlAllowed IP guard", () => {
  const unusedLookup: LookupFn = async () => {
    throw new Error("literal-IP hosts must not trigger DNS");
  };

  it("blocks literal private/loopback/link-local IP hosts without DNS", async () => {
    for (const url of [
      "http://169.254.169.254/latest/meta-data",
      "http://127.0.0.1:8080/",
      "http://10.0.0.5/",
      "http://[fc00::1]/",
    ]) {
      await assert.rejects(assertUrlAllowed(url, unusedLookup), SsrfError, url);
    }
  });

  it("blocks a public hostname that resolves to a private address (rebinding)", async () => {
    const privateLookup: LookupFn = async () => [{ address: "10.1.2.3", family: 4 }];
    await assert.rejects(
      assertUrlAllowed("http://internal.example.com/", privateLookup),
      SsrfError,
    );
  });

  it("blocks when any resolved address is private", async () => {
    const mixedLookup: LookupFn = async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ];
    await assert.rejects(assertUrlAllowed("http://mixed.example.com/", mixedLookup), SsrfError);
  });

  it("allows a normal public host", async () => {
    const publicLookup: LookupFn = async () => [{ address: "93.184.216.34", family: 4 }];
    const url = await assertUrlAllowed("https://example.com/article", publicLookup);
    assert.equal(url.hostname, "example.com");
    assert.equal(url.protocol, "https:");
  });
});
