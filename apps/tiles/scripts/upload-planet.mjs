/* eslint-disable no-console -- a command-line tool: its output is the log */
/**
 * Copies a (very large) PMTiles file from a URL into R2 as a multipart upload, part by part:
 * each 256 MB part is fetched with an HTTP range and uploaded on its own, with retries, so a
 * dropped connection only repeats one part. Nothing is written to disk.
 *
 *   SRC=https://build.protomaps.com/20261030.pmtiles KEY=planet.pmtiles BUCKET=nyrgo-tiles \
 *   R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… \
 *     node scripts/upload-planet.mjs
 */
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';

const { SRC, KEY, BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
for (const [k, v] of Object.entries({
  SRC,
  KEY,
  BUCKET,
  R2_ENDPOINT,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
})) {
  if (!v) throw new Error(`${k} is required`);
}
const PART = Number(process.env.PART_MB ?? 256) * 1024 * 1024;
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 8);
const TRIES = 6;

const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);

async function retry(what, fn) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= TRIES) throw new Error(`${what}: ${e.message}`);
      log(`${what} failed (${e.message}), retry ${i}`);
      await sleep(2000 * 2 ** i);
    }
  }
}

const head = await fetch(SRC, { method: 'HEAD' });
if (!head.ok) throw new Error(`source answered ${head.status}`);
const size = Number(head.headers.get('content-length'));
if (!(size > 0)) throw new Error('source has no length');
const parts = Math.ceil(size / PART);
if (parts > 10_000) throw new Error('too many parts; raise PART_MB');
log(`${SRC}: ${(size / 1e9).toFixed(1)} GB in ${parts} parts of ${PART / 1048576} MB`);

// leftovers of failed runs would keep costing storage until R2 expires them
const old = await s3.send(new ListMultipartUploadsCommand({ Bucket: BUCKET, Prefix: KEY }));
for (const u of old.Uploads ?? []) {
  await s3.send(
    new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: u.Key, UploadId: u.UploadId }),
  );
  log(`aborted an old unfinished upload of ${u.Key}`);
}

const { UploadId } = await s3.send(
  new CreateMultipartUploadCommand({
    Bucket: BUCKET,
    Key: KEY,
    ContentType: 'application/vnd.pmtiles',
  }),
);
const etags = new Array(parts);
let next = 0;
let done = 0;
const started = Date.now();

async function worker() {
  for (;;) {
    const i = next++;
    if (i >= parts) return;
    const start = i * PART;
    const end = Math.min(size, start + PART) - 1;
    const body = await retry(`download part ${i + 1}`, async () => {
      const res = await fetch(SRC, { headers: { range: `bytes=${start}-${end}` } });
      if (res.status !== 206) throw new Error(`range answered ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length !== end - start + 1) throw new Error(`short read ${buf.length}`);
      return buf;
    });
    const out = await retry(`upload part ${i + 1}`, () =>
      s3.send(
        new UploadPartCommand({
          Bucket: BUCKET,
          Key: KEY,
          UploadId,
          PartNumber: i + 1,
          Body: body,
        }),
      ),
    );
    etags[i] = out.ETag;
    done++;
    if (done % 10 === 0 || done === parts) {
      const mbs = (done * PART) / 1048576 / ((Date.now() - started) / 1000);
      log(`${done}/${parts} parts (${mbs.toFixed(0)} MB/s)`);
    }
  }
}

try {
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await s3.send(
    new CompleteMultipartUploadCommand({
      Bucket: BUCKET,
      Key: KEY,
      UploadId,
      MultipartUpload: { Parts: etags.map((ETag, i) => ({ ETag, PartNumber: i + 1 })) },
    }),
  );
} catch (e) {
  await s3
    .send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: KEY, UploadId }))
    .catch(() => {});
  throw e;
}
const stored = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: KEY }));
if (stored.ContentLength !== size)
  throw new Error(`stored ${stored.ContentLength} bytes, expected ${size}`);
log(`done: ${KEY} is ${size} bytes`);
console.log(`::notice title=World map::${KEY} in R2: ${(size / 1e9).toFixed(1)} GB`);
