/** Rotation state for the shape: pure maths, no DOM, so it can be tested in Node. */

export type Quat = [number, number, number, number]; // x y z w

export interface Spin {
  orientation: Quat; // model -> view rotation about the origin
  velocity: [number, number]; // rad/s about the view X and Y axes
  dragging: boolean;
}

export const IDLE = 0.25; // rad/s about view Y while nobody is touching it
export const MOMENTUM = 0.6; // s, time constant for a released flick to ease back to idle
export const HOLD = 0.05; // s, velocity fades this fast while held, so letting go of a still shape doesn't fling it
export const RAD_PER_PX = 0.01;
export const MAX_DT = 0.1; // s, so a resumed tab doesn't jump
const MIN_DT = 1 / 240; // s, guards the velocity estimate against back-to-back pointer events

/** Starts already turning at idle, so there's no spin-up on page load. */
export function createSpin(idle = 0): Spin {
  return { orientation: [0, 0, 0, 1], velocity: [0, idle], dragging: false };
}

/** Advance by dt seconds. idle is the spin speed to settle at: IDLE, or 0 for reduced motion. */
export function step(spin: Spin, dt: number, idle: number) {
  dt = Math.min(dt, MAX_DT);
  const [wx, wy] = spin.velocity;
  if (spin.dragging) {
    const k = Math.exp(-dt / HOLD);
    spin.velocity = [wx * k, wy * k];
    return;
  }
  // Exact integral of w(t) = target + (w - target) * e^(-t/MOMENTUM), so the motion doesn't depend on frame rate.
  const k = Math.exp(-dt / MOMENTUM);
  const ease = (w: number, target: number) => ({
    w: target + (w - target) * k,
    angle: target * dt + (w - target) * MOMENTUM * (1 - k),
  });
  const x = ease(wx, 0);
  const y = ease(wy, idle);
  spin.velocity = [x.w, y.w];
  spin.orientation = rotate(spin.orientation, x.angle, y.angle);
}

/** Apply a pointer move: right turns the front towards +x, down turns it towards -y. */
export function drag(spin: Spin, dxPx: number, dyPx: number, dt: number) {
  const ax = dyPx * RAD_PER_PX;
  const ay = dxPx * RAD_PER_PX;
  spin.orientation = rotate(spin.orientation, ax, ay);
  const t = Math.max(dt, MIN_DT);
  spin.velocity = [ax / t, ay / t];
}

/** Turn q in view space by ax radians about X and ay about Y, combined into one axis-angle rotation. */
function rotate(q: Quat, ax: number, ay: number): Quat {
  const angle = Math.hypot(ax, ay);
  if (angle === 0) return q;
  const s = Math.sin(angle / 2) / angle;
  return normalize(multiply([ax * s, ay * s, 0, Math.cos(angle / 2)], q));
}

function multiply([ax, ay, az, aw]: Quat, [bx, by, bz, bw]: Quat): Quat {
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function normalize(q: Quat): Quat {
  const length = Math.hypot(...q);
  return q.map((c) => c / length) as Quat;
}

/** Column-major mat4 for the shader. */
export function rotationMatrix([x, y, z, w]: Quat): Float32Array {
  return new Float32Array([
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
    0, 0, 0, 1,
  ]);
}

/** Clip-space x/y scale that fits the radius-1 shape into the canvas' short side. aspect = width / height. */
export function fitScale(aspect: number): [number, number] {
  return [Math.min(1, 1 / aspect), Math.min(1, aspect)];
}
