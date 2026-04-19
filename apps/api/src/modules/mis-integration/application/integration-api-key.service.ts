import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { IntegrationApiKey } from '../domain/entities/integration-api-key.entity';

export interface CreatedIntegrationApiKey {
  id: string;
  rawKey: string;
  keyMasked: string;
  connectorId: string;
  name: string | null;
  ipAllowlist: string[] | null;
  createdAt: Date;
}

const KEY_PREFIX = 'tmd_live_';
const KEY_BODY_BYTES = 16;

@Injectable()
export class IntegrationApiKeyService {
  private readonly logger = new Logger(IntegrationApiKeyService.name);

  constructor(
    @InjectRepository(IntegrationApiKey)
    private readonly keys: Repository<IntegrationApiKey>,
  ) {}

  private hashRaw(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private mask(raw: string): string {
    // `tmd_live_****3a2f` — enough to recognise the key in logs/UI without
    // leaking enough entropy to guess the rest.
    const tail = raw.slice(-4);
    return `${KEY_PREFIX}****${tail}`;
  }

  async create(params: {
    tenantId: string;
    connectorId: string;
    name?: string | null;
    ipAllowlist?: string[] | null;
    createdBy?: string | null;
  }): Promise<CreatedIntegrationApiKey> {
    const rawBody = randomBytes(KEY_BODY_BYTES).toString('hex');
    const rawKey = `${KEY_PREFIX}${rawBody}`;
    const keyHash = this.hashRaw(rawKey);
    const keyMasked = this.mask(rawKey);
    const allowlist =
      params.ipAllowlist && params.ipAllowlist.length > 0
        ? params.ipAllowlist
        : null;

    const saved = await this.keys.save(
      this.keys.create({
        tenantId: params.tenantId,
        connectorId: params.connectorId,
        keyHash,
        keyMasked,
        name: params.name ?? null,
        ipAllowlist: allowlist,
        createdBy: params.createdBy ?? null,
      }),
    );

    return {
      id: saved.id,
      rawKey,
      keyMasked: saved.keyMasked,
      connectorId: saved.connectorId,
      name: saved.name,
      ipAllowlist: saved.ipAllowlist,
      createdAt: saved.createdAt,
    };
  }

  async findActiveByRaw(rawKey: string): Promise<IntegrationApiKey | null> {
    if (!rawKey.startsWith(KEY_PREFIX)) return null;
    const keyHash = this.hashRaw(rawKey);
    return this.keys.findOne({ where: { keyHash, revokedAt: IsNull() } });
  }

  async list(tenantId: string, connectorId?: string): Promise<IntegrationApiKey[]> {
    return this.keys.find({
      where: connectorId
        ? { tenantId, connectorId }
        : { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async revoke(id: string, tenantId: string): Promise<void> {
    const key = await this.keys.findOne({ where: { id, tenantId } });
    if (!key) throw new NotFoundException('API key not found');
    if (key.revokedAt) return; // idempotent
    key.revokedAt = new Date();
    await this.keys.save(key);
  }

  /**
   * Best-effort update of `lastUsedAt` — deliberately not awaited by the
   * guard so a slow DB write never blocks the actual API call.
   */
  touchLastUsed(id: string): void {
    this.keys
      .update({ id }, { lastUsedAt: new Date() })
      .catch((e: Error) =>
        this.logger.warn(`Failed to update lastUsedAt for ${id}: ${e.message}`),
      );
  }

  /**
   * IP-allowlist check. Supports exact matches (`10.0.0.5`) and IPv4 CIDR
   * ranges (`10.0.0.0/24`). IPv6 is only exact-matched — if we need IPv6 CIDR
   * later we can swap in a library. null allowlist = accept everything.
   */
  ipMatches(allowlist: string[] | null, clientIp: string | null): boolean {
    if (!allowlist || allowlist.length === 0) return true;
    if (!clientIp) return false;

    // Express puts '::ffff:10.0.0.5' for v4-mapped addresses behind IPv6 stack.
    const normalised = clientIp.startsWith('::ffff:')
      ? clientIp.slice('::ffff:'.length)
      : clientIp;

    for (const entry of allowlist) {
      if (entry === normalised || entry === clientIp) return true;
      if (entry.includes('/') && ipv4InCidr(normalised, entry)) return true;
    }
    return false;
  }
}

/** Returns true if `ip` falls inside `cidr`. IPv4 only. */
function ipv4InCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  if (!range || !bitsStr) return false;
  const bits = Number.parseInt(bitsStr, 10);
  if (!Number.isFinite(bits) || bits < 0 || bits > 32) return false;
  const ipNum = ipv4ToInt(ip);
  const rangeNum = ipv4ToInt(range);
  if (ipNum === null || rangeNum === null) return false;
  // Shift-left by 32 is undefined in JS (produces 0) — handle /0 explicitly.
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipNum & mask) === (rangeNum & mask);
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    const n = Number.parseInt(p, 10);
    if (!Number.isFinite(n) || n < 0 || n > 255) return null;
    out = (out << 8) | n;
  }
  return out >>> 0;
}
