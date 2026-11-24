/**
 * Bảo vệ model 3D trước khi đưa lên web.
 *
 *   Lớp 4 – làm sạch lossless: xoá tên node/mesh/material/texture và metadata,
 *           nhúng bản quyền + fingerprint. Geometry/texture giữ nguyên từng byte.
 *   Lớp 1 – mã hoá AES-256-GCM: file đầu ra không còn header `glTF`, không mở
 *           được bằng Blender / trình xem GLB nếu không có khoá.
 *
 * Usage:
 *   npm run protect:model                       # dùng models-src/<MODEL_SOURCE>
 *   npm run protect:model -- path/to/model.glb  # chỉ định file nguồn
 *   npm run protect:model -- --gen-key          # tạo MODEL_KEY mới vào .env.local
 *
 * MODEL_KEY (base64, 32 byte) được đọc từ biến môi trường hoặc `.env.local`.
 * Đầu ra:
 *   public/m/<hash>.bin            – file model đã mã hoá (commit được)
 *   src/config/model-asset.ts      – đường dẫn + kích thước file để viewer dùng
 */
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, rm, writeFile, appendFile } from "node:fs/promises";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SOURCE = resolve(rootDir, "models-src/LHP100_20261005-draco.glb");
const OUTPUT_DIR = resolve(rootDir, "public/m");
const MANIFEST_PATH = resolve(rootDir, "src/config/model-asset.ts");
const ENV_PATH = resolve(rootDir, ".env.local");

/** Định dạng file mã hoá: MAGIC(4) | IV(12) | ciphertext + GCM tag(16). */
const MAGIC = Buffer.from("LHP1", "ascii");
const IV_BYTES = 12;

const COPYRIGHT =
  "© Dự án kỉ niệm 100 năm Trường THPT Chuyên Lê Hồng Phong. All rights reserved. " +
  "Không được sao chép, tải xuống hay sử dụng lại khi chưa có sự cho phép.";

const args = process.argv.slice(2);

if (args.includes("--gen-key")) {
  await generateKey();
  process.exit(0);
}

const sourcePath = resolve(rootDir, args.find((a) => !a.startsWith("--")) ?? DEFAULT_SOURCE);
if (!existsSync(sourcePath)) {
  console.error(`Không tìm thấy file nguồn: ${sourcePath}`);
  console.error("Đặt file GLB gốc vào models-src/ (thư mục này không được commit).");
  process.exit(1);
}

const key = readModelKey();

// ---- Lớp 4: làm sạch metadata, giữ nguyên 100% geometry -------------------
// Chỉ sửa chunk JSON của GLB; chunk BIN (Draco, texture) được giữ nguyên từng
// byte. Không giải nén/nén lại Draco vì việc lượng tử hoá lại sẽ làm mất các
// tam giác nhỏ (đã kiểm chứng: mất ~1/3 index ở mesh lớn nhất).
const sourceGlb = readFileSync(sourcePath);
const { json, bin } = parseGlb(sourceGlb);
const before = JSON.stringify(json).length;

const NAMED_COLLECTIONS = [
  "nodes", "meshes", "materials", "textures", "images", "samplers", "accessors",
  "bufferViews", "buffers", "scenes", "skins", "animations", "cameras",
];
for (const collection of NAMED_COLLECTIONS) {
  for (const item of json[collection] ?? []) {
    delete item.name;
    delete item.extras;
  }
}
for (const mesh of json.meshes ?? []) {
  for (const primitive of mesh.primitives ?? []) delete primitive.extras;
}

const fingerprint = randomBytes(8).toString("hex");
json.asset = { version: "2.0", generator: "LHP100", copyright: COPYRIGHT };
json.extras = { lhp: { owner: "LHP100", build: new Date().toISOString(), fp: fingerprint } };

const glb = buildGlb(json, bin);
const after = JSON.stringify(json).length;

// ---- Lớp 1: mã hoá AES-256-GCM ----------------------------------------------
const iv = randomBytes(IV_BYTES);
const cipher = createCipheriv("aes-256-gcm", key, iv);
cipher.setAAD(MAGIC);
const encrypted = Buffer.concat([MAGIC, iv, cipher.update(glb), cipher.final(), cipher.getAuthTag()]);

const hash = createHash("sha256").update(encrypted).digest("hex").slice(0, 12);
const fileName = `${hash}.bin`;

await mkdir(OUTPUT_DIR, { recursive: true });
for (const old of await readdir(OUTPUT_DIR)) {
  if (old.endsWith(".bin")) await rm(resolve(OUTPUT_DIR, old));
}
await writeFile(resolve(OUTPUT_DIR, fileName), encrypted);

await writeFile(
  MANIFEST_PATH,
  `// File được sinh tự động bởi scripts/protect-model.mjs – không sửa tay.
export const modelAsset = {
  /** Đường dẫn tương đối với BASE_URL tới model đã mã hoá. */
  path: "m/${fileName}",
  /** Kích thước file mã hoá (byte), dùng cho thanh tiến trình khi thiếu Content-Length. */
  byteLength: ${encrypted.length},
} as const;
`,
);

console.log(`Nguồn       : ${basename(sourcePath)} (${formatBytes(readFileSync(sourcePath).length)})`);
console.log(`JSON        : ${before} → ${after} byte (đã xoá tên/metadata)`);
console.log(`BIN chunk   : ${formatBytes(bin.length)} (giữ nguyên từng byte)`);
console.log(`GLB sạch    : ${formatBytes(glb.length)}`);
console.log(`Đã mã hoá   : public/m/${fileName} (${formatBytes(encrypted.length)})`);
console.log(`Fingerprint : ${fingerprint}`);

// ---------------------------------------------------------------------------

function readModelKey() {
  let raw = process.env.MODEL_KEY;
  if (!raw && existsSync(ENV_PATH)) {
    const match = readFileSync(ENV_PATH, "utf8").match(/^MODEL_KEY=(.+)$/m);
    raw = match?.[1].trim().replace(/^["']|["']$/g, "");
  }
  if (!raw) {
    console.error("Thiếu MODEL_KEY. Chạy `npm run protect:model -- --gen-key` để tạo khoá.");
    process.exit(1);
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    console.error("MODEL_KEY phải là 32 byte mã hoá base64.");
    process.exit(1);
  }
  return buf;
}

async function generateKey() {
  if (existsSync(ENV_PATH) && /^MODEL_KEY=/m.test(readFileSync(ENV_PATH, "utf8"))) {
    console.error(".env.local đã có MODEL_KEY – không ghi đè. Xoá dòng đó nếu muốn tạo khoá mới.");
    process.exit(1);
  }
  const value = randomBytes(32).toString("base64");
  await appendFile(ENV_PATH, `MODEL_KEY=${value}\n`);
  console.log("Đã ghi MODEL_KEY mới vào .env.local.");
  console.log("Nhớ thêm đúng giá trị này vào Vercel → Project → Settings → Environment Variables.");
}

function parseGlb(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "glTF" || buffer.readUInt32LE(4) !== 2) {
    throw new Error("File nguồn không phải GLB v2.");
  }
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString("utf8"));
    else if (type === 0x004e4942) bin = data;
    offset += 8 + length;
  }
  if (!json) throw new Error("GLB thiếu chunk JSON.");
  return { json, bin };
}

function buildGlb(json, bin) {
  const pad = (buf, byte) => {
    const rem = buf.length % 4;
    return rem === 0 ? buf : Buffer.concat([buf, Buffer.alloc(4 - rem, byte)]);
  };
  const jsonChunk = pad(Buffer.from(JSON.stringify(json), "utf8"), 0x20);
  const binChunk = bin ? pad(Buffer.from(bin), 0x00) : null;
  const chunkHeader = (length, type) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(length, 0);
    h.writeUInt32LE(type, 4);
    return h;
  };
  const parts = [chunkHeader(jsonChunk.length, 0x4e4f534a), jsonChunk];
  if (binChunk) parts.push(chunkHeader(binChunk.length, 0x004e4942), binChunk);
  const body = Buffer.concat(parts);
  const header = Buffer.alloc(12);
  header.write("glTF", 0, "ascii");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + body.length, 8);
  return Buffer.concat([header, body]);
}

function formatBytes(n) {
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
