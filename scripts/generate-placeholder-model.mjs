import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(
  rootDir,
  'public/models/le-hong-phong-campus-placeholder.glb'
);

const positions = [];
const normals = [];
const indices = [];

addBox([0, 1.7, 0], [22, 3.4, 8]);
addBox([0, 4.9, 0.35], [10, 3, 5]);
addBox([-8.2, 3.4, -1.2], [4.4, 4.8, 5]);
addBox([8.2, 3.4, -1.2], [4.4, 4.8, 5]);
addBox([-4.7, 2.5, 4.3], [2.2, 2.6, 2]);
addBox([4.7, 2.5, 4.3], [2.2, 2.6, 2]);
addBox([0, 1.1, 5], [5.2, 1.8, 2.1]);
addBox([0, 0.4, 0], [27, 0.8, 14]);

const positionBuffer = toFloat32Buffer(positions);
const normalBuffer = toFloat32Buffer(normals);
const indexBuffer = toUInt16Buffer(indices);

let byteOffset = 0;
const binChunks = [];

const indexView = appendAlignedBuffer(indexBuffer, 4);
const positionView = appendAlignedBuffer(positionBuffer, 4);
const normalView = appendAlignedBuffer(normalBuffer, 4);

const binBuffer = Buffer.concat(binChunks);

const vertexCount = positions.length / 3;
const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];

for (let index = 0; index < positions.length; index += 3) {
  min[0] = Math.min(min[0], positions[index]);
  min[1] = Math.min(min[1], positions[index + 1]);
  min[2] = Math.min(min[2], positions[index + 2]);

  max[0] = Math.max(max[0], positions[index]);
  max[1] = Math.max(max[1], positions[index + 1]);
  max[2] = Math.max(max[2], positions[index + 2]);
}

const gltf = {
  asset: {
    version: '2.0',
    generator: 'Codex placeholder campus generator'
  },
  scene: 0,
  scenes: [
    {
      name: 'Campus Scene',
      nodes: [0]
    }
  ],
  nodes: [
    {
      name: 'Le Hong Phong Campus Placeholder',
      mesh: 0
    }
  ],
  meshes: [
    {
      name: 'CampusMassing',
      primitives: [
        {
          attributes: {
            POSITION: 1,
            NORMAL: 2
          },
          indices: 0,
          material: 0
        }
      ]
    }
  ],
  materials: [
    {
      name: 'WarmStone',
      pbrMetallicRoughness: {
        baseColorFactor: [0.87, 0.72, 0.45, 1],
        metallicFactor: 0.03,
        roughnessFactor: 0.9
      }
    }
  ],
  accessors: [
    {
      bufferView: 0,
      componentType: 5123,
      count: indices.length,
      type: 'SCALAR',
      max: [Math.max(...indices)],
      min: [0]
    },
    {
      bufferView: 1,
      componentType: 5126,
      count: vertexCount,
      type: 'VEC3',
      min,
      max
    },
    {
      bufferView: 2,
      componentType: 5126,
      count: vertexCount,
      type: 'VEC3'
    }
  ],
  bufferViews: [
    {
      buffer: 0,
      byteOffset: indexView.byteOffset,
      byteLength: indexView.byteLength,
      target: 34963
    },
    {
      buffer: 0,
      byteOffset: positionView.byteOffset,
      byteLength: positionView.byteLength,
      target: 34962
    },
    {
      buffer: 0,
      byteOffset: normalView.byteOffset,
      byteLength: normalView.byteLength,
      target: 34962
    }
  ],
  buffers: [
    {
      byteLength: binBuffer.length
    }
  ]
};

const jsonChunk = padChunk(Buffer.from(JSON.stringify(gltf), 'utf8'), 0x20);
const binChunk = padChunk(binBuffer, 0x00);
const totalLength = 12 + 8 + jsonChunk.length + 8 + binChunk.length;

const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(totalLength, 8);

const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(jsonChunk.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4);

const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(binChunk.length, 0);
binHeader.writeUInt32LE(0x004e4942, 4);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk])
);

console.log(`Generated placeholder GLB at ${outputPath}`);

function appendAlignedBuffer(buffer, alignment) {
  const remainder = byteOffset % alignment;
  if (remainder !== 0) {
    const padding = Buffer.alloc(alignment - remainder);
    binChunks.push(padding);
    byteOffset += padding.length;
  }

  const startOffset = byteOffset;
  binChunks.push(buffer);
  byteOffset += buffer.length;

  return {
    byteOffset: startOffset,
    byteLength: buffer.length
  };
}

function padChunk(buffer, fillValue) {
  const remainder = buffer.length % 4;
  if (remainder === 0) {
    return buffer;
  }

  return Buffer.concat([buffer, Buffer.alloc(4 - remainder, fillValue)]);
}

function toFloat32Buffer(values) {
  const typedArray = new Float32Array(values);
  return Buffer.from(typedArray.buffer);
}

function toUInt16Buffer(values) {
  const typedArray = new Uint16Array(values);
  return Buffer.from(typedArray.buffer);
}

function addBox(center, size) {
  const [cx, cy, cz] = center;
  const [sx, sy, sz] = size;
  const minX = cx - sx / 2;
  const maxX = cx + sx / 2;
  const minY = cy - sy / 2;
  const maxY = cy + sy / 2;
  const minZ = cz - sz / 2;
  const maxZ = cz + sz / 2;

  pushFace(
    [
      [maxX, minY, maxZ],
      [maxX, minY, minZ],
      [maxX, maxY, minZ],
      [maxX, maxY, maxZ]
    ],
    [1, 0, 0]
  );
  pushFace(
    [
      [minX, minY, minZ],
      [minX, minY, maxZ],
      [minX, maxY, maxZ],
      [minX, maxY, minZ]
    ],
    [-1, 0, 0]
  );
  pushFace(
    [
      [minX, maxY, maxZ],
      [maxX, maxY, maxZ],
      [maxX, maxY, minZ],
      [minX, maxY, minZ]
    ],
    [0, 1, 0]
  );
  pushFace(
    [
      [minX, minY, minZ],
      [maxX, minY, minZ],
      [maxX, minY, maxZ],
      [minX, minY, maxZ]
    ],
    [0, -1, 0]
  );
  pushFace(
    [
      [minX, minY, maxZ],
      [maxX, minY, maxZ],
      [maxX, maxY, maxZ],
      [minX, maxY, maxZ]
    ],
    [0, 0, 1]
  );
  pushFace(
    [
      [maxX, minY, minZ],
      [minX, minY, minZ],
      [minX, maxY, minZ],
      [maxX, maxY, minZ]
    ],
    [0, 0, -1]
  );
}

function pushFace(corners, normal) {
  const baseIndex = positions.length / 3;

  for (const [x, y, z] of corners) {
    positions.push(x, y, z);
    normals.push(...normal);
  }

  indices.push(
    baseIndex,
    baseIndex + 1,
    baseIndex + 2,
    baseIndex,
    baseIndex + 2,
    baseIndex + 3
  );
}

