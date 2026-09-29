// Flat-shaded tiles, each one colour from a smooth palette blend by tile height.
// Uniform layout is mirrored in renderer.ts.

// Must match the length of src/data/shape-palette.json (checked by palette.test.ts).
const PALETTE_SIZE = 5u;

struct Uniforms {
  rotation: mat4x4f, // model -> view
  fit: vec4f, // xy: clip-space scale fitting the radius-1 shape into the canvas
  light: vec4f, // xyz: direction towards the light in view space, w: ambient level
  palette: array<vec4f, PALETTE_SIZE>, // linear rgb, bottom -> top
}

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VertexOut {
  @builtin(position) clip: vec4f,
  @location(0) view: vec3f,
  @location(1) @interpolate(flat) height: f32,
}

@vertex
fn vs(@location(0) position: vec3f, @location(1) height: f32) -> VertexOut {
  let view = (u.rotation * vec4f(position, 1.0)).xyz;
  // Orthographic. View z runs -1 (far) .. 1 (near); depth 0 is nearest, so flip it into 1 .. 0.
  let clip = vec4f(view.xy * u.fit.xy, 0.5 - 0.5 * view.z, 1.0);
  return VertexOut(clip, view, height);
}

// Height -1..1 -> blend between neighbouring palette stops, like the ColorRamp in make_shape.py.
fn palette(height: f32) -> vec3f {
  let t = clamp(height * 0.5 + 0.5, 0.0, 1.0) * f32(PALETTE_SIZE - 1u);
  let i = min(u32(t), PALETTE_SIZE - 2u);
  return mix(u.palette[i].rgb, u.palette[i + 1u].rgb, t - f32(i));
}

fn linear_to_srgb(c: vec3f) -> vec3f {
  return select(1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055, 12.92 * c, c <= vec3f(0.0031308));
}

@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
  // The mesh has no normals: the triangle's own slope gives a flat one per tile.
  // Framebuffer y points down, so dpdy comes first to keep the normal facing the viewer.
  let normal = normalize(cross(dpdy(in.view), dpdx(in.view)));
  let ambient = u.light.w;
  let shade = ambient + (1.0 - ambient) * max(dot(normal, normalize(u.light.xyz)), 0.0);
  // The canvas is not an sRGB format, so encode by hand. Alpha 1 is valid premultiplied output.
  return vec4f(linear_to_srgb(palette(in.height) * shade), 1.0);
}
