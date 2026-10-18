import { ConflictException } from '@nestjs/common';
import { assertSafeUploadUrl, isPrivateIp } from '../upload-url.guard';

describe('assertSafeUploadUrl (strict / production)', () => {
  it('accepts a public https URL and returns the parsed URL', () => {
    const url = assertSafeUploadUrl('https://hub.docdream.example/upload/abc?x=1', false);
    expect(url.host).toBe('hub.docdream.example');
  });

  it.each([
    ['not a url at all', 'nope'],
    ['plain http', 'http://hub.docdream.example/upload/abc'],
    ['ftp', 'ftp://hub.docdream.example/upload'],
    ['embedded credentials', 'https://user:pw@hub.docdream.example/upload'],
    ['localhost', 'https://localhost/upload'],
    ['.localhost suffix', 'https://api.localhost/upload'],
    ['.local suffix', 'https://mis.local/upload'],
    ['loopback v4', 'https://127.0.0.1/upload'],
    ['rfc1918 10/8', 'https://10.0.0.5/upload'],
    ['rfc1918 172.16/12', 'https://172.31.255.1/upload'],
    ['rfc1918 192.168/16', 'https://192.168.1.1/upload'],
    ['cloud metadata link-local', 'https://169.254.169.254/latest/meta-data'],
    ['cgnat', 'https://100.64.0.1/upload'],
    ['loopback v6', 'https://[::1]/upload'],
    ['v4-mapped v6', 'https://[::ffff:10.0.0.1]/upload'],
    ['unique local v6', 'https://[fd12:3456::1]/upload'],
    ['link-local v6', 'https://[fe80::1]/upload'],
  ])('rejects %s', (_label, raw) => {
    expect(() => assertSafeUploadUrl(raw, false)).toThrow(ConflictException);
  });
});

describe('assertSafeUploadUrl (insecure / local dev)', () => {
  it('allows http to localhost for the mock hub', () => {
    expect(assertSafeUploadUrl('http://localhost:4100/upload/dd-1', true).port).toBe('4100');
  });

  it('still refuses embedded credentials and non-http schemes', () => {
    expect(() => assertSafeUploadUrl('http://u:p@localhost:4100/upload', true)).toThrow(
      ConflictException,
    );
    expect(() => assertSafeUploadUrl('file:///etc/passwd', true)).toThrow(ConflictException);
  });
});

describe('isPrivateIp', () => {
  it('treats public addresses as public', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('2606:4700::1111')).toBe(false);
    expect(isPrivateIp('hub.docdream.example')).toBe(false);
  });
});
