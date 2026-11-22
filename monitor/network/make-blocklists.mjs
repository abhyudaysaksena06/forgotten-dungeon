#!/usr/bin/env node
// Turns monitor/network/blocklist.txt into the format your network or browser needs:
//
//   node monitor/network/make-blocklists.mjs dnsmasq   > ai-block.conf     (OpenWrt, Pi-hole, many routers)
//   node monitor/network/make-blocklists.mjs adguard   > ai-block.txt      (AdGuard Home, Pi-hole adlists)
//   node monitor/network/make-blocklists.mjs hosts     >> /etc/hosts       (one lab PC; Windows: C:\Windows\System32\drivers\etc\hosts)
//   node monitor/network/make-blocklists.mjs chrome    > ai-block.json     (managed Chrome on lab PCs)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function readBlocklist(path = fileURLToPath(new URL('blocklist.txt', import.meta.url))) {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*/, '').trim().toLowerCase())
    .filter(Boolean);
}

export function render(format, domains) {
  switch (format) {
    case 'dnsmasq':
      return domains.map((d) => `address=/${d}/0.0.0.0`).join('\n');
    case 'adguard':
      return domains.map((d) => `||${d}^`).join('\n');
    case 'hosts':
      // hosts files cannot block subdomains, so the common ones are listed too
      return domains.flatMap((d) => [`0.0.0.0 ${d}`, `0.0.0.0 www.${d}`, `0.0.0.0 api.${d}`, `0.0.0.0 app.${d}`]).join('\n');
    case 'chrome':
      // Chrome policy: block the sites, stop DNS-over-HTTPS from going around the venue DNS, and keep
      // incognito off so the blocks always apply. Linux: /etc/opt/chrome/policies/managed/,
      // macOS: a configuration profile, Windows: Group Policy (same keys).
      return JSON.stringify({ URLBlocklist: domains, DnsOverHttpsMode: 'off', IncognitoModeAvailability: 1 }, null, 2);
    default:
      throw new Error('Format must be one of: dnsmasq, adguard, hosts, chrome');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    console.log(render(process.argv[2], readBlocklist()));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
