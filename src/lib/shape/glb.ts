export interface Mesh {
  positions: Float32Array; // xyz per vertex
  heights: Float32Array; // one per vertex, equal across a tile's 4 corners
  indices: Uint16Array;
}

const MAGIC = 0x46546c67; // "glTF"
const JSON_CHUNK = 0x4e4f534a; // "JSON"
const BIN_CHUNK = 0x004e4942; // "BIN\0"
const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;
const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC3: 3 };

/** Reads the single-primitive glb written by blender/make_shape.py. Anything else throws. */
export function parseGlb(buffer: ArrayBuffer): Mesh {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== MAGIC) throw new Error('not a glb file');

  // Header is 12 bytes, then each chunk is [length, type, data]; chunks are padded to 4 bytes.
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== JSON_CHUNK) throw new Error('glb: first chunk is not JSON');
  if (view.getUint32(20 + jsonLength + 4, true) !== BIN_CHUNK) throw new Error('glb: second chunk is not BIN');
  const gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
  const binStart = 20 + jsonLength + 8;

  /** Byte offset and element count of an accessor, after checking it has the expected layout. */
  function locate(index: number, componentType: number, type: string): [number, number] {
    const accessor = gltf.accessors[index];
    if (accessor.componentType !== componentType || accessor.type !== type) {
      throw new Error(`glb: accessor ${index} is not ${type} of ${componentType}`);
    }
    const bufferView = gltf.bufferViews[accessor.bufferView];
    const offset = binStart + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    return [offset, accessor.count * COMPONENTS[type]];
  }

  const primitive = gltf.meshes[0].primitives[0];
  return {
    positions: new Float32Array(buffer, ...locate(primitive.attributes.POSITION, FLOAT, 'VEC3')),
    heights: new Float32Array(buffer, ...locate(primitive.attributes._FACE_HEIGHT, FLOAT, 'SCALAR')),
    indices: new Uint16Array(buffer, ...locate(primitive.indices, UNSIGNED_SHORT, 'SCALAR')),
  };
}
