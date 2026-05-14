export interface ARFaceCaptureFrame {
  /** Flat xyz triples — 1220 vertices × 3 = 3660 floats for ARKit's canonical mesh. */
  vertices: number[];
  /** Triangle indices into `vertices`. */
  indices: number[];
  /** Flat xyz triples of vertex normals. */
  normals?: number[];
  /** ARKit 52-key blend-shape weights, 0..1. */
  blendShapes: Record<string, number>;
  /** 4×4 transform from world to face-local frame (row-major). */
  transform?: number[];
  /** UNIX-ms timestamp the frame was sampled. */
  timestamp: number;
}
