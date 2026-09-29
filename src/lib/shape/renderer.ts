import shaderCode from './shape.wgsl?raw';
import type { Mesh } from './glb.ts';
import palette from '../../data/shape-palette.json' with { type: 'json' };
import { fitScale, rotationMatrix, type Quat } from './spin.ts';

export const LIGHT = [-0.4, 0.6, 0.7]; // view space, from the upper left and in front
export const AMBIENT = 0.35;
const SAMPLES = 4; // MSAA for smooth silhouettes; drop to 1 first if low-end hardware struggles
const DEPTH_FORMAT = 'depth24plus';

// Float offsets into the uniform buffer, matching struct Uniforms in shape.wgsl.
const FIT = 16;
const LIGHT_AT = 20;
const PALETTE_AT = 24;

export type Rgb = [number, number, number];

/** sRGB hex -> linear RGB, the same formula as hex_to_linear in blender/make_shape.py. */
export function hexToLinear(hex: string): Rgb {
  return [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
}

/** Bottom -> top, blended by tile height in shape.wgsl. */
export const PALETTE_LINEAR = palette.map(hexToLinear);

export async function requestDevice(): Promise<GPUDevice | null> {
  try {
    const adapter = await navigator.gpu?.requestAdapter();
    return (await adapter?.requestDevice()) ?? null;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export function createRenderer(device: GPUDevice, format: GPUTextureFormat, mesh: Mesh) {
  const module = device.createShaderModule({ code: shaderCode });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module,
      buffers: [
        { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
        { arrayStride: 4, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32' }] },
      ],
    },
    fragment: { module, targets: [{ format }] },
    primitive: { topology: 'triangle-list', cullMode: 'back' }, // glTF front faces are counter-clockwise
    depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'less' },
    multisample: { count: SAMPLES },
  });

  const upload = (data: Float32Array | Uint16Array, usage: number) => {
    const buffer = device.createBuffer({ size: data.byteLength, usage: usage | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  };
  const positions = upload(mesh.positions, GPUBufferUsage.VERTEX);
  const heights = upload(mesh.heights, GPUBufferUsage.VERTEX);
  const indices = upload(mesh.indices, GPUBufferUsage.INDEX);

  // Light and palette never change; rotation and fit are rewritten every frame.
  const uniforms = new Float32Array(PALETTE_AT + 4 * PALETTE_LINEAR.length);
  uniforms.set([...LIGHT, AMBIENT], LIGHT_AT);
  PALETTE_LINEAR.forEach((rgb, i) => uniforms.set(rgb, PALETTE_AT + 4 * i));
  const uniformBuffer = upload(uniforms, GPUBufferUsage.UNIFORM);
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  // Multisampled colour and depth targets, recreated when the output size changes.
  let msaa: GPUTexture | undefined;
  let depth: GPUTexture | undefined;
  function targetsFor({ width, height }: GPUTexture) {
    if (!msaa || !depth || msaa.width !== width || msaa.height !== height) {
      msaa?.destroy();
      depth?.destroy();
      const usage = GPUTextureUsage.RENDER_ATTACHMENT;
      msaa = device.createTexture({ size: [width, height], format, sampleCount: SAMPLES, usage });
      depth = device.createTexture({ size: [width, height], format: DEPTH_FORMAT, sampleCount: SAMPLES, usage });
    }
    return { msaa, depth };
  }

  return {
    module, // exposed so the check page can read compilation messages

    /** Draw the mesh at this orientation into the texture (a canvas texture, or an offscreen one). */
    draw(texture: GPUTexture, orientation: Quat) {
      uniforms.set(rotationMatrix(orientation), 0);
      uniforms.set(fitScale(texture.width / texture.height), FIT);
      device.queue.writeBuffer(uniformBuffer, 0, uniforms, 0, LIGHT_AT);

      const { msaa, depth } = targetsFor(texture);
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: msaa.createView(),
          resolveTarget: texture.createView(),
          clearValue: [0, 0, 0, 0],
          loadOp: 'clear',
          storeOp: 'discard',
        }],
        depthStencilAttachment: {
          view: depth.createView(),
          depthClearValue: 1,
          depthLoadOp: 'clear',
          depthStoreOp: 'discard',
        },
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.setVertexBuffer(0, positions);
      pass.setVertexBuffer(1, heights);
      pass.setIndexBuffer(indices, 'uint16');
      pass.drawIndexed(mesh.indices.length);
      pass.end();
      device.queue.submit([encoder.finish()]);
    },
  };
}
