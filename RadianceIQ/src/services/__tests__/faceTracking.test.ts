import { analyzeAlignment, getDirections, DetectedFace } from '../faceTracking';

// No mocks needed — analyzeAlignment is a pure function

describe('faceTracking', () => {
  describe('analyzeAlignment', () => {
    const FRAME_W = 1000;
    const FRAME_H = 1000;

    it('returns no_face when faces array is empty', () => {
      const result = analyzeAlignment([], FRAME_W, FRAME_H);
      expect(result.status).toBe('no_face');
      expect(result.issues).toContain('Position your face in the frame');
      expect(result.lightingOk).toBe(false);
    });

    it('returns aligned for a well-positioned face', () => {
      const faces: DetectedFace[] = [
        { x: 200, y: 200, width: 600, height: 600, yawAngle: 5, rollAngle: -3 },
      ];
      const result = analyzeAlignment(faces, FRAME_W, FRAME_H);
      expect(result.status).toBe('aligned');
      expect(result.issues).toHaveLength(0);
      expect(result.lightingOk).toBe(true);
      expect(result.faceRect).toEqual({ x: 200, y: 200, width: 600, height: 600 });
    });

    it('returns "Move closer" when face is too small', () => {
      const faces: DetectedFace[] = [
        { x: 450, y: 450, width: 100, height: 100, yawAngle: 0, rollAngle: 0 },
      ];
      const result = analyzeAlignment(faces, FRAME_W, FRAME_H);
      expect(result.status).toBe('misaligned');
      expect(result.issues).toContain('Move closer');
    });

    it('returns directional hints when face is off-center', () => {
      // Face in top-left corner
      const faces: DetectedFace[] = [
        { x: 0, y: 0, width: 500, height: 500, yawAngle: 0, rollAngle: 0 },
      ];
      const result = analyzeAlignment(faces, FRAME_W, FRAME_H);
      expect(result.issues.some(i => i.includes('Move'))).toBe(true);
    });

    it('returns "Turn toward camera" for excessive yaw', () => {
      const faces: DetectedFace[] = [
        { x: 200, y: 200, width: 600, height: 600, yawAngle: 25, rollAngle: 0 },
      ];
      const result = analyzeAlignment(faces, FRAME_W, FRAME_H);
      expect(result.issues).toContain('Turn toward camera');
    });

    it('returns "Turn toward camera" for excessive roll', () => {
      const faces: DetectedFace[] = [
        { x: 200, y: 200, width: 600, height: 600, yawAngle: 0, rollAngle: 20 },
      ];
      const result = analyzeAlignment(faces, FRAME_W, FRAME_H);
      expect(result.issues).toContain('Turn toward camera');
    });

    it('selects the largest face when multiple are detected', () => {
      const faces: DetectedFace[] = [
        { x: 400, y: 400, width: 100, height: 100 }, // small
        { x: 200, y: 200, width: 600, height: 600 }, // large — should be picked
      ];
      const result = analyzeAlignment(faces, FRAME_W, FRAME_H);
      expect(result.faceRect?.width).toBe(600);
    });

    it('treats null angles as valid', () => {
      const faces: DetectedFace[] = [
        { x: 200, y: 200, width: 600, height: 600, yawAngle: null, rollAngle: null },
      ];
      const result = analyzeAlignment(faces, FRAME_W, FRAME_H);
      expect(result.status).toBe('aligned');
    });
  });

  describe('getDirections', () => {
    it('returns empty array for no issues', () => {
      expect(getDirections([])).toEqual([]);
    });

    it('maps "Move closer" to closer direction', () => {
      expect(getDirections(['Move closer'])).toEqual(['closer']);
    });

    it('maps "Move left" to left direction', () => {
      expect(getDirections(['Move left'])).toEqual(['left']);
    });

    it('maps "Move right" to right direction', () => {
      expect(getDirections(['Move right'])).toEqual(['right']);
    });

    it('maps "Turn toward camera" to face_camera direction', () => {
      expect(getDirections(['Turn toward camera'])).toEqual(['face_camera']);
    });

    it('maps multiple issues to multiple directions', () => {
      const dirs = getDirections(['Move closer', 'Move left', 'Turn toward camera']);
      expect(dirs).toEqual(['closer', 'left', 'face_camera']);
    });

    it('maps "Move up" and "Move down" correctly', () => {
      expect(getDirections(['Move up'])).toEqual(['up']);
      expect(getDirections(['Move down'])).toEqual(['down']);
    });

    it('ignores unknown issues', () => {
      expect(getDirections(['Position your face in the frame'])).toEqual([]);
    });
  });
});
