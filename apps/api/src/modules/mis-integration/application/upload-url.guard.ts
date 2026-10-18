import { ConflictException } from '@nestjs/common';
import { isIP } from 'node:net';

/**
 * Validates the MIS-supplied document upload URL before the API POSTs to it.
 *
 * The URL arrives over an authenticated integration API key, so the sender is
 * trusted — but a leaked key must not turn the API into a proxy that reaches
 * loopback, link-local (cloud metadata) or RFC1918 hosts. Production therefore
 * requires https and a public literal host. `allowInsecure` (dev only, env
 * MIS_UPLOAD_ALLOW_INSECURE) relaxes both so a local mock hub works.
 *
 * Known limit: only the literal host is checked; a public hostname that
 * resolves to a private IP (DNS rebinding) is not detected — undici exposes no
 * cheap per-request `lookup` hook. `redirect: 'error'` on the fetch call closes
 * the other classic hole (public URL → 30x → internal address).
 */
export const assertSafeUploadUrl = (raw: string, allowInsecure: boolean): URL => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw badUrl('is not a valid URL');
  }

  const httpsOk = url.protocol === 'https:';
  const httpOk = allowInsecure && url.protocol === 'http:';
  if (!httpsOk && !httpOk) {
    throw badUrl(allowInsecure ? 'must use http or https' : 'must use https');
  }
  if (url.username || url.password) {
    throw badUrl('must not embed credentials');
  }
  if (allowInsecure) return url;

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    isPrivateIp(host)
  ) {
    throw badUrl('points at a private or local address');
  }
  return url;
};

const badUrl = (why: string) =>
  new ConflictException({
    message: `Document upload URL configured by the clinic ${why}`,
    code: 'mis_upload.bad_url',
  });

export const isPrivateIp = (host: string): boolean => {
  const kind = isIP(host);
  if (kind === 4) return isPrivateV4(host);
  if (kind === 6) return isPrivateV6(host);
  return false;
};

const isPrivateV4 = (ip: string): boolean => {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || // "this" network
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) || // link-local incl. cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) // CGNAT
  );
};

const isPrivateV6 = (ip: string): boolean => {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  // IPv4-mapped — judge the embedded v4 address. Note the WHATWG URL parser
  // (what `new URL().hostname` gives us) serialises ::ffff:10.0.0.1 as
  // ::ffff:a00:1, so accept both the dotted and the two-hextet spellings.
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (dotted) return isPrivateV4(dotted[1]);
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return isPrivateV4(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`);
  }
  const first = parseInt(lower.split(':')[0] || '0', 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  return false;
};
