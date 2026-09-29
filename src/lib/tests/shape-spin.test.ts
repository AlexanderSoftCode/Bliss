import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HOLD, IDLE, MAX_DT, MOMENTUM, createSpin, drag, fitScale, rotationMatrix, step, type Quat, type Spin } from '../shape/spin.ts';

/** Where the orientation sends a model-space point, via the same matrix the shader gets. */
function apply(q: Quat, [x, y, z]: number[]) {
  const m = rotationMatrix(q);
  return [0, 1, 2].map((r) => m[r] * x + m[4 + r] * y + m[8 + r] * z);
}

const close = (a: number, b: number, eps: number) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

function run(spin: Spin, seconds: number, fps: number, idle = IDLE) {
  for (let i = 0; i < Math.round(seconds * fps); i++) step(spin, 1 / fps, idle);
  return spin;
}

test('idle spin turns about Y at IDLE rad/s', () => {
  const t = 3;
  const [x, y, z] = apply(run(createSpin(IDLE), t, 60).orientation, [0, 0, 1]);
  // 1e-6: the matrix is float32, like the one the GPU gets.
  close(x, Math.sin(IDLE * t), 1e-6);
  close(y, 0, 1e-6);
  close(z, Math.cos(IDLE * t), 1e-6);
});

test('dragging right turns the front towards +x, dragging down turns it towards -y', () => {
  const right = createSpin();
  drag(right, 20, 0, 1 / 60);
  const [rx, ry] = apply(right.orientation, [0, 0, 1]);
  assert.ok(rx > 0.1);
  close(ry, 0, 1e-9);

  const down = createSpin();
  drag(down, 0, 20, 1 / 60);
  const [dx, dy] = apply(down.orientation, [0, 0, 1]);
  close(dx, 0, 1e-9);
  assert.ok(dy < -0.1);
});

test('a released flick eases back to the idle speed', () => {
  const spin = createSpin();
  drag(spin, 60, 30, 1 / 60);
  const gapToIdle = () => Math.hypot(spin.velocity[0], spin.velocity[1] - IDLE);
  const start = gapToIdle();
  let gap = start;
  for (let i = 0; i < 5 * MOMENTUM * 60; i++) {
    step(spin, 1 / 60, IDLE);
    assert.ok(gapToIdle() < gap);
    gap = gapToIdle();
  }
  assert.ok(gap < 0.01 * start); // e^-5 of the way left after 5 time constants
});

test('the result does not depend on frame rate', () => {
  const flick = () => {
    const spin = createSpin();
    drag(spin, 0, 40, 1 / 60); // one axis, so the rotation is exact at any step size
    return spin;
  };
  const at60 = run(flick(), 1, 60, 0);
  const at144 = run(flick(), 1, 144, 0);
  at60.velocity.forEach((w, i) => close(w, at144.velocity[i], 1e-9));
  at60.orientation.forEach((c, i) => close(c, at144.orientation[i], 1e-9));

  // Both axes moving at once: rotations don't commute, so allow a small difference.
  const both = () => {
    const spin = createSpin();
    drag(spin, 40, 40, 1 / 60);
    return spin;
  };
  const a = run(both(), 1, 60).orientation;
  const b = run(both(), 1, 144).orientation;
  a.forEach((c, i) => close(c, b[i], 1e-3));
});

test('letting go of a shape held still does not fling it', () => {
  const spin = createSpin();
  spin.dragging = true;
  drag(spin, 80, 0, 1 / 60);
  const flick = Math.hypot(...spin.velocity);
  run(spin, 4 * HOLD, 60); // held still for 4 time constants
  assert.ok(Math.hypot(...spin.velocity) < 0.02 * flick);
});

test('while held, only the pointer turns the shape', () => {
  const spin = createSpin();
  spin.dragging = true;
  run(spin, 1, 60);
  assert.deepEqual(spin.orientation, [0, 0, 0, 1]);
});

test('reduced motion (idle 0) comes to rest', () => {
  const spin = createSpin();
  drag(spin, 60, 30, 1 / 60);
  const flick = Math.hypot(...spin.velocity);
  run(spin, 10 * MOMENTUM, 60, 0);
  assert.ok(Math.hypot(...spin.velocity) < 1e-4 * flick);
});

test('orientation stays a unit quaternion', () => {
  const spin = createSpin();
  drag(spin, 37, -19, 1 / 60);
  for (let i = 0; i < 100_000; i++) {
    if (i % 1000 === 0) drag(spin, 13, 7, 1 / 60);
    step(spin, 1 / 60, IDLE);
  }
  close(Math.hypot(...spin.orientation), 1, 1e-6);
});

test('long frames are clamped', () => {
  const a = createSpin();
  const b = createSpin();
  step(a, 5, IDLE);
  step(b, MAX_DT, IDLE);
  assert.deepEqual(a, b);
});

test('every orientation keeps the radius-1 shape inside clip space', () => {
  let seed = 1;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < 20; i++) {
    const spin = createSpin();
    drag(spin, random() * 500, random() * 500, 1 / 60);
    const m = rotationMatrix(spin.orientation);
    // Orthonormal rotation: no stretching, so |p| <= 1 stays <= 1.
    for (let c = 0; c < 3; c++) close(Math.hypot(m[4 * c], m[4 * c + 1], m[4 * c + 2]), 1, 1e-6);
    for (const aspect of [0.5, 1, 2]) {
      const [sx, sy] = fitScale(aspect);
      // A unit circle scaled by (sx, sy) and stretched by the canvas aspect stays round and touches the short side.
      close((sx * aspect) / sy, 1, 1e-12);
      assert.ok(sx <= 1 && sy <= 1 && Math.max(sx, sy) === 1);
    }
  }
});
