import dns from 'node:dns/promises';
import net from 'node:net';
import { env } from '../config/env';
import { badRequest } from './http-error';

/*
 * The server fetches whatever link it is given, so a link must not point back into our own network
 * (the database, the cloud metadata service, a router's admin page …). Links are checked by scheme and
 * by every address their host name resolves to.
 */

function isPrivateIPv4(ip: string) {
  const [a, b] = ip.split('.').map(Number) as [number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast and reserved
  );
}

function isPrivateIPv6(ip: string) {
  const v = ip.toLowerCase();
  if (v === '::' || v === '::1') return true;
  if (v.startsWith('fc') || v.startsWith('fd')) return true; // unique local
  if (v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb')) return true; // link-local
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]!);
  return false;
}

export const isPrivateAddress = (ip: string) => (net.isIPv4(ip) ? isPrivateIPv4(ip) : net.isIPv6(ip) ? isPrivateIPv6(ip) : true);

/** Throws a 400 unless `raw` is an http(s) link to a public host. Returns the normalised URL. */
export async function assertPublicUrl(raw: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw badRequest('That does not look like a link. Paste the full address, starting with https://', 'BAD_URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw badRequest('Only http and https links are supported', 'BAD_URL');
  if (url.username || url.password) throw badRequest('Links with a user name or password are not supported', 'BAD_URL');
  if (env.ALLOW_PRIVATE_URLS) return url.toString();

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw badRequest('Links to local or private addresses are not allowed', 'PRIVATE_URL');
  let addresses: string[];
  if (net.isIP(host)) addresses = [host];
  else {
    try {
      addresses = (await dns.lookup(host, { all: true, verbatim: true })).map((a) => a.address);
    } catch {
      throw badRequest(`Could not find the site "${host}". Check the link.`, 'BAD_URL');
    }
  }
  if (!addresses.length || addresses.some(isPrivateAddress)) throw badRequest('Links to local or private addresses are not allowed', 'PRIVATE_URL');
  return url.toString();
}
