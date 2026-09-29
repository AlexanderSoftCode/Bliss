import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseGlb } from '../shape/glb.ts';

function load(): ArrayBuffer {
  const file = readFileSync(new URL('../../../public/models/shape.glb', import.meta.url));
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
}

const { positions, heights, indices } = parseGlb(load());
const vertexCount = positions.length / 3;

test('reads every vertex, height and index', () => {
  assert.equal(vertexCount, 9600);
  assert.equal(heights.length, vertexCount);
  assert.equal(indices.length, 14400);
  assert.ok(indices.every((i) => i < vertexCount));
});

test('fits inside the radius-1 sphere the shader frames', () => {
  for (let i = 0; i < positions.length; i += 3) {
    assert.ok(Math.hypot(positions[i], positions[i + 1], positions[i + 2]) <= 1 + 1e-6);
  }
});

test('each tile has one height in -1..1', () => {
  assert.ok(heights.every((h) => h >= -1 && h <= 1));
  for (let i = 0; i < heights.length; i += 4) {
    assert.ok(heights.subarray(i, i + 4).every((h) => h === heights[i]), `tile ${i / 4}`);
  }
});

test('triangles wind counter-clockwise from outside, so back-face culling keeps the outside', () => {
  const at = (i: number) => positions.subarray(3 * i, 3 * i + 3);
  let volume = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [at(indices[t]), at(indices[t + 1]), at(indices[t + 2])];
    volume += a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  assert.ok(volume > 0);
});

test('rejects a file that is not a glb', () => {
  const buffer = load();
  new DataView(buffer).setUint32(0, 0);
  assert.throws(() => parseGlb(buffer), /not a glb/);
});
