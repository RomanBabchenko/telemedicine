/**
 * Dump the OpenAPI JSON of a running Telemed API to disk.
 *
 * Usage:
 *   - Start the API first: `pnpm --filter @telemed/api dev` (or docker compose up).
 *   - Then run: `pnpm --filter @telemed/api openapi:dump`
 *
 * Output: apps/api/openapi.json (gitignored by default — check in if you want
 * CI to snapshot it and block contract drift).
 *
 * To generate a typed TypeScript SDK from the dumped spec:
 *   npx openapi-typescript apps/api/openapi.json -o packages/api-client/src/generated/schema.ts
 *
 * The script intentionally does NOT boot the Nest app itself — that would
 * require a live Postgres/Redis/MinIO connection. Running against an already
 * live server matches how developers actually use the docs.
 */

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DEFAULT_URL = 'http://localhost:3000/api/docs-json';
const OUTPUT_FILE = resolve(__dirname, '..', 'openapi.json');

async function main(): Promise<void> {
  const url = process.env.OPENAPI_URL ?? DEFAULT_URL;

  // eslint-disable-next-line no-console
  console.log(`Fetching OpenAPI spec from ${url} ...`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} returned HTTP ${res.status} ${res.statusText}`);
  }
  const spec = await res.json();
  await writeFile(OUTPUT_FILE, JSON.stringify(spec, null, 2), 'utf-8');
  // eslint-disable-next-line no-console
  console.log(`Wrote ${OUTPUT_FILE}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`openapi:dump failed — is the API running? ${(err as Error).message}`);
  process.exit(1);
});
