#!/usr/bin/env node
// Minimal stand-in for the MIS (DocDream) webhook hub that receives patient
// documents. Temporary: use it until the real hub is reachable.
//
// Usage:
//   node scripts/mock-upload-server.mjs [port]          # default 4100 (or $PORT)
//   SAVE_DIR=./tmp/uploads node scripts/mock-upload-server.mjs
//   FAIL=1 node scripts/mock-upload-server.mjs          # every upload → 500
//
// Endpoints:
//   POST /upload/<anything>[?fail=1]  JSON body from the Telemed API:
//       { appointmentId, externalAppointmentId, tenantId, uploadedBy,
//         fileName, contentType, sizeBytes, contentBase64, uploadedAt }
//     → 200 { ok: true, id }          decoded length == sizeBytes
//     → 400 { ok: false, error }      bad JSON / missing or mismatched base64
//     → 413 / 415                      body > 20 MB / not application/json
//     → 500 { ok: false }             FAIL=1 or ?fail=1 (failure-path testing)
//   GET  /uploads                      everything received so far (no base64)
//   GET  /health                       { ok: true }
//
// Pair with scripts/mis-payment-examples.sh:
//   UPLOAD_URL=http://localhost:4100 ./scripts/mis-payment-examples.sh anon:now
// The API must run with MIS_UPLOAD_ALLOW_INSECURE=true to post to localhost.

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const port = Number(process.argv[2] ?? process.env.PORT ?? 4100);
const saveDir = process.env.SAVE_DIR ? String(process.env.SAVE_DIR) : null;
const alwaysFail = process.env.FAIL === '1';
const MAX_BODY = 20 * 1024 * 1024;

if (saveDir) mkdirSync(saveDir, { recursive: true });

const received = [];

const send = (res, status, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

const safeName = (name) =>
  String(name ?? 'file')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .slice(0, 200);

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true });
  if (req.method === 'GET' && url.pathname === '/uploads') return send(res, 200, received);

  if (req.method === 'POST' && url.pathname.startsWith('/upload/')) {
    const ct = String(req.headers['content-type'] ?? '');
    if (!ct.toLowerCase().startsWith('application/json')) {
      return send(res, 415, { ok: false, error: 'expected application/json' });
    }
    let raw;
    try {
      raw = await readBody(req);
    } catch (e) {
      return send(res, e.status ?? 400, { ok: false, error: e.message });
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return send(res, 400, { ok: false, error: 'invalid JSON' });
    }
    if (typeof body?.contentBase64 !== 'string' || body.contentBase64.length === 0) {
      return send(res, 400, { ok: false, error: 'contentBase64 missing' });
    }
    const bytes = Buffer.from(body.contentBase64, 'base64');
    if (typeof body.sizeBytes === 'number' && bytes.length !== body.sizeBytes) {
      return send(res, 400, {
        ok: false,
        error: `sizeBytes ${body.sizeBytes} != decoded ${bytes.length}`,
      });
    }

    const id = randomUUID();
    const meta = {
      id,
      receivedAt: new Date().toISOString(),
      path: url.pathname,
      appointmentId: body.appointmentId ?? null,
      externalAppointmentId: body.externalAppointmentId ?? null,
      tenantId: body.tenantId ?? null,
      uploadedBy: body.uploadedBy ?? null,
      fileName: body.fileName ?? null,
      contentType: body.contentType ?? null,
      sizeBytes: bytes.length,
      uploadedAt: body.uploadedAt ?? null,
    };

    if (alwaysFail || url.searchParams.get('fail') === '1') {
      console.log(
        `[mock-hub] REJECT ${meta.path} ${meta.fileName} (${meta.sizeBytes} B) — forced failure`,
      );
      return send(res, 500, { ok: false, error: 'forced failure' });
    }

    let savedTo = null;
    if (saveDir) {
      savedTo = join(saveDir, `${id}-${safeName(meta.fileName)}`);
      writeFileSync(savedTo, bytes);
    }
    received.push({ ...meta, savedTo });
    console.log(
      `[mock-hub] OK ${meta.path} appt=${meta.appointmentId} ext=${meta.externalAppointmentId} ` +
        `${meta.fileName} ${meta.contentType} ${meta.sizeBytes} B${savedTo ? ` → ${savedTo}` : ''}`,
    );
    return send(res, 200, { ok: true, id });
  }

  return send(res, 404, { ok: false, error: 'not found' });
});

server.listen(port, () => {
  console.log(`[mock-hub] listening on http://localhost:${port}`);
  console.log(
    `[mock-hub] POST /upload/<id>  GET /uploads  GET /health` +
      (saveDir ? `  SAVE_DIR=${saveDir}` : '') +
      (alwaysFail ? '  FAIL=1' : ''),
  );
});
