import { parseGlb } from './glb.ts';
import { createRenderer, requestDevice } from './renderer.ts';
import { IDLE, createSpin, drag, step } from './spin.ts';

const MAX_PIXEL_RATIO = 2;

/** Start rendering the shape into the canvas. Resolves a stop function, or null if WebGPU or the model is unavailable. */
export async function mountShape(canvas: HTMLCanvasElement, url = '/models/shape.glb'): Promise<(() => void) | null> {
  try {
    const device = await requestDevice();
    const context = canvas.getContext('webgpu');
    if (!device || !context) return null;
    const response = await fetch(url);
    if (!response.ok) return null;

    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'premultiplied' });
    const renderer = createRenderer(device, format, parseGlb(await response.arrayBuffer()));

    const resize = new ResizeObserver(() => {
      const ratio = Math.min(devicePixelRatio, MAX_PIXEL_RATIO);
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    });
    resize.observe(canvas);

    // TODO(you): reduced motion. Hint: matchMedia('(prefers-reduced-motion: reduce)').matches -> 0 instead of IDLE.
    const idle = IDLE;
    const spin = createSpin(idle);

    // Pointer events cover mouse, touchpad and touch alike.
    let lastMove = 0; // ms, event time of the previous pointer event
    const listeners = new AbortController(); // one abort() removes every listener below
    const { signal } = listeners;
    canvas.addEventListener('pointerdown', (e) => {
      spin.dragging = true;
      lastMove = e.timeStamp;
      canvas.setPointerCapture(e.pointerId); // keep receiving moves when the pointer leaves the canvas
    }, { signal });
    canvas.addEventListener('pointermove', (e) => {
      if (!spin.dragging) return;
      drag(spin, e.movementX, e.movementY, (e.timeStamp - lastMove) / 1000);
      lastMove = e.timeStamp;
    }, { signal });
    const letGo = () => (spin.dragging = false); // step() then eases the momentum back to idle
    canvas.addEventListener('pointerup', letGo, { signal });
    canvas.addEventListener('pointercancel', letGo, { signal });

    // Only render while the canvas is on screen. Hidden tabs need nothing extra: browsers already stop rAF there.
    let last = 0;
    let frameId = 0; // 0 while paused
    function frame(now: number) {
      step(spin, (now - last) / 1000, idle);
      last = now;
      renderer.draw(context.getCurrentTexture(), spin.orientation);
      frameId = requestAnimationFrame(frame);
    }
    const visibility = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !frameId) {
        last = performance.now(); // so the first step isn't the whole time spent off screen
        frameId = requestAnimationFrame(frame);
      } else if (!entry.isIntersecting) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }
    });
    visibility.observe(canvas);

    // No device.destroy(): on pagehide it stalls every later frame in the tab in Firefox 155.
    // The browser frees the device with the page instead.
    return () => {
      cancelAnimationFrame(frameId);
      resize.disconnect();
      visibility.disconnect();
      listeners.abort();
      context.unconfigure();
    };
  } catch (error) {
    console.error(error);
    return null;
  }
}
