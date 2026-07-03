/**
 * Bone Structure 3D — facial-architecture metrics computed on a captured 3D mesh.
 *
 * Line-parallel JavaScript port of `src/services/onDeviceBoneStructure.ts`. Pure deterministic
 * math over a captured 3D face mesh — no native dependencies, no ONNX, no
 * network. Runs in the JS thread on the iPhone, eliminating the
 * `/api/vision/bone-structure` round-trip entirely.
 *
 * Convention for the model-local frame:
 *   +X = subject's right in ARKit capture space (MediaPipe canonical is mirrored
 *        into the same source-agnostic landmark map before metric math)
 *   +Y = up
 *   +Z = out of the face, toward the camera
 */
// ---------------------------------------------------------------------------
// Indexed landmark tables
// ---------------------------------------------------------------------------
//
// ARKit deliberately has no index table here. Apple's ARFaceGeometry topology is
// not MediaPipe's topology, so copying MediaPipe indices onto ARKit fabricates
// anatomy. The ARKit path below derives landmarks geometrically from vertices +
// triangle-hole boundary loops instead.
const MEDIAPIPE_LANDMARKS = {
    trichion: 10,
    glabella: 9,
    pronasale: 1,
    subnasale: 2,
    menton: 152,
    pogonion: 199,
    upper_lip_top: 0,
    stomion: 13,
    lower_lip_bot: 17,
    inner_canthus_L: 133,
    inner_canthus_R: 362,
    outer_canthus_L: 33,
    outer_canthus_R: 263,
    upper_eyelid_L: 159,
    upper_eyelid_R: 386,
    lower_eyelid_L: 145,
    lower_eyelid_R: 374,
    brow_inner_L: 55,
    brow_inner_R: 285,
    brow_apex_L: 105,
    brow_apex_R: 334,
    alar_L: 49,
    alar_R: 279,
    zygion_L: 234,
    zygion_R: 454,
    tragion_L: 127,
    tragion_R: 356,
    gonion_L: 172,
    gonion_R: 397,
    cheilion_L: 61,
    cheilion_R: 291,
    iris_L: 468,
    iris_R: 473,
};
const LANDMARK_TABLES = {
    canonical: MEDIAPIPE_LANDMARKS,
    mediapipe: MEDIAPIPE_LANDMARKS,
};
// ---------------------------------------------------------------------------
// Domain weights — calibrated against the cosmesis literature. Must sum to 100.
// ---------------------------------------------------------------------------
const DOMAIN_WEIGHTS = {
    symmetry: 25,
    periorbital: 20,
    mandibular: 20,
    midface: 15,
    nose: 10,
    brow: 10,
};
const METRICS_BY_DOMAIN = {
    symmetry: ['facial_thirds', 'facial_fifths', 'fluctuating_asymmetry'],
    periorbital: ['canthal_tilt', 'scleral_show', 'palpebral_fissure_ratio', 'ipd_ratio'],
    mandibular: ['gonial_angle', 'bigonial_bizygomatic_ratio', 'chin_projection'],
    midface: ['bitemporal_bizygomatic_ratio', 'zygomatic_projection', 'facial_index', 'lip_ratio'],
    nose: ['alar_bizygomatic_ratio', 'mouth_nose_ratio', 'nasolabial_angle'],
    brow: ['brow_position', 'brow_apex_lateral_third'],
};
// ---------------------------------------------------------------------------
// Sex-adjusted ideals
// ---------------------------------------------------------------------------
const IDEALS = {
    // Symmetry domain. Farkas-style facial thirds/fifths are treated as ratios.
    facial_thirds: { target: 1.0, halfWidth: 0.25, fallToZero: 0.60 },
    facial_fifths: { target: 0.90, halfWidth: 0.08, fallToZero: 0.35 },
    fluctuating_asymmetry: { target: 0.0, halfWidth: 0.01, fallToZero: 0.08 },
    // Periorbital. Naini/Bashour: mild positive canthal tilt is typical; lower
    // lid usually touches/covers the inferior limbus, so positive show is penalised.
    canthal_tilt: { idealMin: 0, idealMax: 9, hardMin: -10, hardMax: 18 },
    scleral_show: { idealMin: -8, idealMax: 1, hardMin: -14, hardMax: 5 },
    palpebral_fissure_ratio: { target: 0.30, halfWidth: 0.08, fallToZero: 0.28 },
    ipd_ratio: { target: 2.0, halfWidth: 0.30, fallToZero: 0.9 },
    // Mandibular (sex-aware) — Naini facial aesthetics norms.
    gonial_angle: {
        male: { idealMin: 115, idealMax: 125, hardMin: 100, hardMax: 140 },
        female: { idealMin: 120, idealMax: 130, hardMin: 105, hardMax: 145 },
        unisex: { idealMin: 117, idealMax: 130, hardMin: 102, hardMax: 145 },
    },
    bigonial_bizygomatic_ratio: { idealMin: 0.64, idealMax: 0.82, hardMin: 0.50, hardMax: 0.95 },
    // Template-anchored normalized depth relation; Naini describes pogonion near
    // the subnasale-pronasale soft-tissue plane, not an invented millimetre unit.
    chin_projection: { target: -0.02, halfWidth: 0.08, fallToZero: 0.35 },
    // Midface. Facial index approximates Farkas morphological facial index.
    bitemporal_bizygomatic_ratio: { idealMin: 0.60, idealMax: 0.98, hardMin: 0.50, hardMax: 1.35 },
    zygomatic_projection: { target: 0.04, halfWidth: 0.06, fallToZero: 0.22 },
    facial_index: { idealMin: 0.90, idealMax: 1.35, hardMin: 0.75, hardMax: 1.70 },
    lip_ratio: { idealMin: 0.35, idealMax: 0.75, hardMin: 0.20, hardMax: 1.10 },
    // Nose. Mouth width is classically about 1.5–1.6× alar width (Farkas/Naini).
    alar_bizygomatic_ratio: { idealMin: 0.18, idealMax: 0.32, hardMin: 0.12, hardMax: 0.42 },
    mouth_nose_ratio: { idealMin: 1.40, idealMax: 1.75, hardMin: 1.00, hardMax: 2.20 },
    nasolabial_angle: {
        male: { idealMin: 90, idealMax: 120, hardMin: 70, hardMax: 145 },
        female: { idealMin: 95, idealMax: 125, hardMin: 75, hardMax: 150 },
        unisex: { idealMin: 90, idealMax: 125, hardMin: 70, hardMax: 150 },
    },
    // Brow (sex-aware) — brow position measured as y-offset of brow apex above
    // supraorbital rim normalised by intercanthal distance.
    brow_position: {
        male: { target: -0.55, halfWidth: 0.18, fallToZero: 0.70 },
        female: { target: -0.50, halfWidth: 0.18, fallToZero: 0.70 },
        unisex: { target: -0.55, halfWidth: 0.20, fallToZero: 0.75 },
    },
    brow_apex_lateral_third: { target: 0.66, halfWidth: 0.15, fallToZero: 0.45 },
};
// ---------------------------------------------------------------------------
// Vector helpers
// ---------------------------------------------------------------------------
function vec(vertices, index) {
    if (index == null)
        return null;
    const i = index * 3;
    if (i < 0 || i + 2 >= vertices.length)
        return null;
    const p = { x: vertices[i], y: vertices[i + 1], z: vertices[i + 2] };
    return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z) ? p : null;
}
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function mul(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross(a, b) {
    return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function len(a) { return Math.sqrt(dot(a, a)); }
function norm(a) { const l = len(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; }
function distance(a, b) { return len(sub(a, b)); }
function midpoint(a, b) { return mul(add(a, b), 0.5); }
function avg(points) {
    const sum = points.reduce((acc, p) => add(acc, p), { x: 0, y: 0, z: 0 });
    return mul(sum, 1 / Math.max(points.length, 1));
}
function angleDeg(u, v) {
    const denom = (len(u) * len(v)) || 1;
    const c = Math.max(-1, Math.min(1, dot(u, v) / denom));
    return Math.acos(c) * 180 / Math.PI;
}
function allVertices(vertices) {
    const out = [];
    for (let i = 0; i + 2 < vertices.length; i += 3) {
        const p = { x: vertices[i], y: vertices[i + 1], z: vertices[i + 2] };
        if (Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z))
            out.push(p);
    }
    return out;
}
function extent(points) {
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const p of points) {
        min.x = Math.min(min.x, p.x);
        min.y = Math.min(min.y, p.y);
        min.z = Math.min(min.z, p.z);
        max.x = Math.max(max.x, p.x);
        max.y = Math.max(max.y, p.y);
        max.z = Math.max(max.z, p.z);
    }
    return { min, max, width: max.x - min.x, height: max.y - min.y, depth: max.z - min.z, centerX: (min.x + max.x) / 2 };
}
function pickMax(points, score) {
    let best;
    let bestScore = -Infinity;
    for (const p of points) {
        const s = score(p);
        if (s > bestScore) {
            best = p;
            bestScore = s;
        }
    }
    return best;
}
function pickMin(points, score) {
    return pickMax(points, (p) => -score(p));
}
// ---------------------------------------------------------------------------
// Mesh validation and landmark resolution
// ---------------------------------------------------------------------------
function isDegenerateMesh(vertices) {
    // Ported verbatim to the backend: reject all-zero/coincident meshes before
    // ratios convert them into plausible-looking but meaningless finite numbers.
    if (!vertices || typeof vertices.length !== 'number' || vertices.length < 3)
        return true;
    let min = Infinity;
    let max = -Infinity;
    let anyFinite = false;
    for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i];
        if (!Number.isFinite(v))
            continue;
        anyFinite = true;
        if (v < min)
            min = v;
        if (v > max)
            max = v;
    }
    return !anyFinite || (max - min) < 1e-6;
}
function normalizeSource(source) {
    if (source === 'arkit')
        return 'arkit';
    if (source === 'canonical')
        return 'canonical';
    if (source === 'mediapipe' || source == null)
        return 'mediapipe';
    throw new Error(`Unknown landmark source: ${source}`);
}
function isSourceCoherent(source, vertexCount, indices) {
    const normalized = normalizeSource(source);
    if (normalized === 'arkit') {
        if (vertexCount < 900)
            return { ok: false, reason: 'arkit source requires an ARKit-sized mesh (>=900 vertices)' };
        if (!indices || indices.length < 3)
            return { ok: false, reason: 'arkit source requires triangle indices for derived landmarks' };
        return { ok: true };
    }
    if (vertexCount < 468 || vertexCount > 478) {
        return { ok: false, reason: 'canonical/mediapipe source requires 468-478 indexed vertices' };
    }
    return { ok: true };
}
function indexedLandmarks(vertices, source) {
    const table = LANDMARK_TABLES[source];
    const landmarks = {};
    for (const [key, idx] of Object.entries(table)) {
        const p = vec(vertices, idx);
        if (p)
            landmarks[key] = p;
    }
    return { status: 'ok', landmarks, confidence: 'medium', landmark_source: 'template' };
}
function boundaryLoops(vertices, indices) {
    if (!indices || indices.length < 3)
        return [];
    const edgeCounts = new Map();
    const directed = new Map();
    const addEdge = (a, b) => {
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        const key = `${lo}:${hi}`;
        edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
        directed.set(key, [a, b]);
    };
    for (let i = 0; i + 2 < indices.length; i += 3) {
        const a = indices[i], b = indices[i + 1], c = indices[i + 2];
        if (!Number.isInteger(a) || !Number.isInteger(b) || !Number.isInteger(c))
            continue;
        addEdge(a, b);
        addEdge(b, c);
        addEdge(c, a);
    }
    const adjacency = new Map();
    for (const [key, count] of edgeCounts) {
        if (count !== 1)
            continue;
        const [a, b] = directed.get(key);
        if (!adjacency.has(a))
            adjacency.set(a, []);
        if (!adjacency.has(b))
            adjacency.set(b, []);
        adjacency.get(a).push(b);
        adjacency.get(b).push(a);
    }
    const loops = [];
    const visited = new Set();
    const edgeKey = (a, b) => `${Math.min(a, b)}:${Math.max(a, b)}`;
    for (const start of adjacency.keys()) {
        const nexts = adjacency.get(start) || [];
        for (const firstNext of nexts) {
            if (visited.has(edgeKey(start, firstNext)))
                continue;
            const ids = [start];
            let prev = start;
            let cur = firstNext;
            for (let guard = 0; guard < 10000; guard++) {
                visited.add(edgeKey(prev, cur));
                if (cur === start)
                    break;
                ids.push(cur);
                const options = (adjacency.get(cur) || []).filter((n) => n !== prev);
                if (options.length === 0)
                    break;
                prev = cur;
                cur = options[0];
            }
            if (ids.length < 4)
                continue;
            const points = ids.map((id) => vec(vertices, id)).filter((p) => !!p);
            if (points.length < 4)
                continue;
            const c = points.reduce((acc, p) => add(acc, p), { x: 0, y: 0, z: 0 });
            const centroid = mul(c, 1 / points.length);
            const ex = extent(points);
            loops.push({ points, centroid, xSpan: ex.width, ySpan: ex.height, length: points.length });
        }
    }
    // De-duplicate traversal starts by near-identical centroids/spans.
    const unique = [];
    for (const loop of loops) {
        if (!unique.some((u) => distance(u.centroid, loop.centroid) < 1e-6 && Math.abs(u.length - loop.length) < 1))
            unique.push(loop);
    }
    return unique.sort((a, b) => b.length - a.length);
}
function classifyFeatureLoops(loops, faceHeight) {
    if (loops.length < 4)
        return {};
    const nonOuter = loops.slice(1);
    const eyeCandidates = nonOuter
        .filter((l) => l.centroid.y > -0.01 && l.xSpan > 0 && l.ySpan > 0 && l.xSpan / Math.max(l.ySpan, 1e-9) > 1.1)
        .sort((a, b) => Math.abs(a.centroid.y - b.centroid.y) - Math.abs(a.centroid.y - b.centroid.y));
    const eyes = eyeCandidates.slice(0, 2).sort((a, b) => a.centroid.x - b.centroid.x);
    const mouth = nonOuter
        .filter((l) => { var _a, _b; return l.centroid.y < ((_b = (_a = eyes[0]) === null || _a === void 0 ? void 0 : _a.centroid.y) !== null && _b !== void 0 ? _b : 0) - faceHeight * 0.18; })
        .sort((a, b) => b.xSpan - a.xSpan)[0];
    return { leftEye: eyes[0], rightEye: eyes[1], mouth };
}
function loopExtremes(loop) {
    return {
        minX: pickMin(loop.points, (p) => p.x), maxX: pickMax(loop.points, (p) => p.x),
        minY: pickMin(loop.points, (p) => p.y), maxY: pickMax(loop.points, (p) => p.y),
    };
}
function pickByBand(points, predicate, score) {
    return pickMax(points.filter(predicate), score);
}
function deriveLandmarksFromMesh(vertices, indices) {
    var _a, _b;
    const points = allVertices(vertices);
    if (points.length < 3 || isDegenerateMesh(vertices))
        return { status: 'no_face', landmarks: {}, confidence: 'low', landmark_source: 'derived' };
    const ex = extent(points);
    const width = Math.max(ex.width, 1e-9);
    const height = Math.max(ex.height, 1e-9);
    const midX = ex.centerX;
    const profileEps = Math.max(width * 0.035, 0.003);
    const profile = points.filter((p) => Math.abs(p.x - midX) <= profileEps);
    if (profile.length < 5)
        return { status: 'no_face', landmarks: {}, confidence: 'low', landmark_source: 'derived' };
    const menton = pickMin(profile, (p) => p.y);
    const trichion = pickMax(profile, (p) => p.y);
    const pronasale = pickMax(profile, (p) => p.z);
    if (!menton || !trichion || !pronasale)
        return { status: 'no_face', landmarks: {}, confidence: 'low', landmark_source: 'derived' };
    const browBand = profile.filter((p) => p.y > menton.y + height * 0.58 && p.y < menton.y + height * 0.82);
    const glabella = pickMax(browBand.length ? browBand : profile, (p) => p.z);
    const recessionCandidates = profile
        .filter((p) => p.y < pronasale.y - height * 0.03 && p.y > menton.y + height * 0.35)
        .filter((p) => p.z < pronasale.z - Math.max(ex.depth * 0.18, 0.006))
        .sort((a, b) => b.y - a.y);
    const subnasale = recessionCandidates[0] || pickByBand(profile, (p) => p.y < pronasale.y && p.y > menton.y + height * 0.45, (p) => -p.z);
    if (!glabella || !subnasale)
        return { status: 'no_face', landmarks: {}, confidence: 'low', landmark_source: 'derived' };
    const loops = boundaryLoops(vertices, indices);
    const { leftEye, rightEye, mouth } = classifyFeatureLoops(loops, height);
    const missingLoops = !(leftEye && rightEye && mouth);
    const canthusY = (((_a = leftEye === null || leftEye === void 0 ? void 0 : leftEye.centroid.y) !== null && _a !== void 0 ? _a : 0) + ((_b = rightEye === null || rightEye === void 0 ? void 0 : rightEye.centroid.y) !== null && _b !== void 0 ? _b : 0)) / (leftEye && rightEye ? 2 : 1) || (glabella.y * 0.7 + subnasale.y * 0.3);
    const zygBand = points.filter((p) => p.y >= subnasale.y && p.y <= canthusY + height * 0.04);
    const zygion_L = pickMin(zygBand, (p) => p.x);
    const zygion_R = pickMax(zygBand, (p) => p.x);
    const gonBand = points.filter((p) => p.y < subnasale.y - height * 0.12 && p.y > menton.y + height * 0.12);
    const gonion_L = pickMin(gonBand, (p) => p.x);
    const gonion_R = pickMax(gonBand, (p) => p.x);
    const tragBand = points.filter((p) => Math.abs(p.y - canthusY) < height * 0.06 && Math.abs(p.x - midX) > width * 0.35);
    const tragion_L = pickByBand(tragBand, (p) => p.x < midX, (p) => -p.z);
    const tragion_R = pickByBand(tragBand, (p) => p.x > midX, (p) => -p.z);
    const pogonion = pickByBand(profile, (p) => p.y > menton.y + height * 0.04 && p.y < subnasale.y - height * 0.12, (p) => p.z);
    const landmarks = { trichion, glabella, pronasale, subnasale, menton, pogonion, zygion_L, zygion_R, gonion_L, gonion_R, tragion_L, tragion_R };
    if (missingLoops && zygion_L && zygion_R) {
        // Without eye holes we still need a left-right axis to put the face in a
        // stable local frame. These proxy canthi are used only for orientation;
        // periorbital and mouth metrics stay omitted while `missingLoops` is true.
        const proxyZ = glabella.z;
        landmarks.inner_canthus_L = { x: midX - width * 0.12, y: canthusY, z: proxyZ };
        landmarks.inner_canthus_R = { x: midX + width * 0.12, y: canthusY, z: proxyZ };
    }
    const noseBand = points.filter((p) => p.y < glabella.y && p.y > subnasale.y - height * 0.03 && p.z > subnasale.z + Math.max((pronasale.z - subnasale.z) * 0.2, ex.depth * 0.08));
    landmarks.alar_L = pickByBand(noseBand, (p) => p.x < midX, (p) => -Math.abs(p.x - midX));
    landmarks.alar_R = pickByBand(noseBand, (p) => p.x > midX, (p) => -Math.abs(p.x - midX));
    if (leftEye && rightEye) {
        const le = loopExtremes(leftEye);
        const re = loopExtremes(rightEye);
        landmarks.outer_canthus_L = le.minX;
        landmarks.inner_canthus_L = le.maxX;
        landmarks.inner_canthus_R = re.minX;
        landmarks.outer_canthus_R = re.maxX;
        landmarks.upper_eyelid_L = le.maxY;
        landmarks.lower_eyelid_L = le.minY;
        landmarks.upper_eyelid_R = re.maxY;
        landmarks.lower_eyelid_R = re.minY;
        landmarks.iris_L = leftEye.centroid;
        landmarks.iris_R = rightEye.centroid;
        const browBandL = points.filter((p) => p.x < midX && p.y > leftEye.centroid.y && p.y < leftEye.centroid.y + height * 0.20);
        const browBandR = points.filter((p) => p.x > midX && p.y > rightEye.centroid.y && p.y < rightEye.centroid.y + height * 0.20);
        landmarks.brow_apex_L = pickMax(browBandL, (p) => p.y);
        landmarks.brow_apex_R = pickMax(browBandR, (p) => p.y);
        landmarks.brow_inner_L = pickByBand(browBandL, (p) => p.x > leftEye.centroid.x, (p) => -Math.abs(p.x - midX));
        landmarks.brow_inner_R = pickByBand(browBandR, (p) => p.x < rightEye.centroid.x, (p) => -Math.abs(p.x - midX));
    }
    if (mouth) {
        const me = loopExtremes(mouth);
        landmarks.cheilion_L = me.minX;
        landmarks.cheilion_R = me.maxX;
        landmarks.upper_lip_top = me.maxY;
        landmarks.lower_lip_bot = me.minY;
        landmarks.stomion = mouth.centroid;
    }
    const bizygomatic = zygion_L && zygion_R ? Math.abs(zygion_R.x - zygion_L.x) : 0;
    const bigonial = gonion_L && gonion_R ? Math.abs(gonion_R.x - gonion_L.x) : 0;
    const signsOK = zygion_L && zygion_R && gonion_L && gonion_R && zygion_L.x < midX && zygion_R.x > midX && gonion_L.x < midX && gonion_R.x > midX;
    if (!(menton.y < subnasale.y && subnasale.y < glabella.y) || !(bizygomatic > bigonial && bigonial > 0) || !signsOK) {
        return { status: 'no_face', landmarks: {}, confidence: 'low', landmark_source: 'derived' };
    }
    return { status: 'ok', landmarks, confidence: missingLoops ? 'medium' : 'high', landmark_source: 'derived', missingLoops };
}
function buildFaceFrameFromLandmarks(L) {
    const glabella = L.glabella;
    const subnasale = L.subnasale;
    const menton = L.menton;
    const innerCL = L.inner_canthus_L;
    const innerCR = L.inner_canthus_R;
    if (!glabella || !subnasale || !menton || !innerCL || !innerCR)
        return null;
    const origin = midpoint(glabella, subnasale);
    const right = norm(sub(innerCR, innerCL));
    const downRaw = norm(sub(menton, glabella));
    const forward = norm(cross(right, downRaw));
    const up = norm(cross(forward, right));
    return { origin, right, up, forward };
}
function buildFaceFrame(vertices, L) {
    const landmarks = {};
    for (const [key, idx] of Object.entries(L)) {
        const p = vec(vertices, idx);
        if (p)
            landmarks[key] = p;
    }
    return buildFaceFrameFromLandmarks(landmarks);
}
function toLocal(frame, p) {
    const d = sub(p, frame.origin);
    return { x: dot(d, frame.right), y: dot(d, frame.up), z: dot(d, frame.forward) };
}
function expressionIsNonNeutral(blendShapes) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    if (!blendShapes)
        return false;
    const jawOpen = (_a = blendShapes.jawOpen) !== null && _a !== void 0 ? _a : 0;
    const smile = Math.max((_c = (_b = blendShapes.mouthSmile_L) !== null && _b !== void 0 ? _b : blendShapes.mouthSmileLeft) !== null && _c !== void 0 ? _c : 0, (_e = (_d = blendShapes.mouthSmile_R) !== null && _d !== void 0 ? _d : blendShapes.mouthSmileRight) !== null && _e !== void 0 ? _e : 0);
    const blink = Math.max((_g = (_f = blendShapes.eyeBlink_L) !== null && _f !== void 0 ? _f : blendShapes.eyeBlinkLeft) !== null && _g !== void 0 ? _g : 0, (_j = (_h = blendShapes.eyeBlink_R) !== null && _h !== void 0 ? _h : blendShapes.eyeBlinkRight) !== null && _j !== void 0 ? _j : 0);
    return jawOpen > 0.25 || smile > 0.4 || blink > 0.5;
}
function resolveLandmarks(vertices, source, indices) {
    if (isDegenerateMesh(vertices))
        return { status: 'no_face', landmarks: {}, confidence: 'low', landmark_source: source === 'arkit' ? 'derived' : 'template' };
    const vertexCount = Math.floor(vertices.length / 3);
    const coherent = isSourceCoherent(source, vertexCount, indices);
    if (!coherent.ok)
        return { status: 'no_face', landmarks: {}, confidence: 'low', landmark_source: source === 'arkit' ? 'derived' : 'template' };
    if (source === 'arkit')
        return deriveLandmarksFromMesh(vertices, indices);
    return indexedLandmarks(vertices, source);
}
// ---------------------------------------------------------------------------
// Metric computation
// ---------------------------------------------------------------------------
function computeMetrics3D(vertices, blendShapes, sex, source = 'arkit', indices) {
    void sex;
    const resolvedSource = normalizeSource(source);
    const resolution = resolveLandmarks(vertices, resolvedSource, indices);
    if (resolution.status !== 'ok')
        return null;
    return computeMetricsFromLandmarks(resolution.landmarks, blendShapes, resolution.confidence, resolution.missingLoops === true);
}
function computeMetricsFromLandmarks(sourceLandmarks, blendShapes, confidence, missingLoops) {
    const frame = buildFaceFrameFromLandmarks(sourceLandmarks);
    if (!frame)
        return null;
    const lp = (key) => sourceLandmarks[key] ? toLocal(frame, sourceLandmarks[key]) : null;
    const trichion = lp('trichion');
    const glabella = lp('glabella');
    const subnasale = lp('subnasale');
    const menton = lp('menton');
    const pogonion = lp('pogonion');
    const upperLip = lp('upper_lip_top');
    const stomion = lp('stomion');
    const lowerLip = lp('lower_lip_bot');
    const pronasale = lp('pronasale');
    const innerCL = lp('inner_canthus_L');
    const innerCR = lp('inner_canthus_R');
    const outerCL = lp('outer_canthus_L');
    const outerCR = lp('outer_canthus_R');
    const upperLidL = lp('upper_eyelid_L');
    const upperLidR = lp('upper_eyelid_R');
    const lowerLidL = lp('lower_eyelid_L');
    const lowerLidR = lp('lower_eyelid_R');
    const irisL = lp('iris_L');
    const irisR = lp('iris_R');
    const browApexL = lp('brow_apex_L');
    const browApexR = lp('brow_apex_R');
    const browInnerL = lp('brow_inner_L');
    const browInnerR = lp('brow_inner_R');
    const alarL = lp('alar_L');
    const alarR = lp('alar_R');
    const zygionL = lp('zygion_L');
    const zygionR = lp('zygion_R');
    const tragionL = lp('tragion_L');
    const tragionR = lp('tragion_R');
    const gonionL = lp('gonion_L');
    const gonionR = lp('gonion_R');
    const cheilionL = lp('cheilion_L');
    const cheilionR = lp('cheilion_R');
    const expressionLocked = expressionIsNonNeutral(blendShapes);
    const suppressExpressive = expressionLocked || confidence === 'low';
    const metrics = {};
    // --- Symmetry domain ---
    if (trichion && glabella && subnasale && menton) {
        const t1 = Math.abs(trichion.y - glabella.y);
        const t2 = Math.abs(glabella.y - subnasale.y);
        const t3 = Math.abs(subnasale.y - menton.y);
        const total = t1 + t2 + t3;
        if (total > 0) {
            const mean = total / 3;
            const dev = (Math.abs(t1 - mean) + Math.abs(t2 - mean) + Math.abs(t3 - mean)) / (3 * mean);
            metrics.facial_thirds = { value: 1 - dev, raw: { t1, t2, t3 } };
        }
    }
    if (!suppressExpressive && tragionL && outerCL && innerCL && innerCR && outerCR && tragionR) {
        const fifths = [
            Math.abs(outerCL.x - tragionL.x),
            Math.abs(innerCL.x - outerCL.x),
            Math.abs(innerCR.x - innerCL.x),
            Math.abs(outerCR.x - innerCR.x),
            Math.abs(tragionR.x - outerCR.x),
        ];
        const total = fifths.reduce((a, b) => a + b, 0);
        if (total > 0) {
            const mean = total / 5;
            const dev = fifths.reduce((acc, f) => acc + Math.abs(f - mean), 0) / (5 * mean);
            metrics.facial_fifths = { value: 1 - dev, raw: { fifths } };
        }
    }
    const mirrorPairs = [
        [innerCL, innerCR], [outerCL, outerCR], [upperLidL, upperLidR], [lowerLidL, lowerLidR],
        [browApexL, browApexR], [browInnerL, browInnerR], [alarL, alarR], [zygionL, zygionR],
        [tragionL, tragionR], [gonionL, gonionR], [cheilionL, cheilionR],
    ];
    const midline = [trichion, glabella, pronasale, subnasale, menton, pogonion, upperLip, stomion, lowerLip].filter((p) => !!p);
    const mirrorX = midline.length ? midline.reduce((s, p) => s + p.x, 0) / midline.length : 0;
    const bizygomatic = zygionL && zygionR ? distance(zygionL, zygionR) : 1;
    let asymSum = 0;
    let asymCount = 0;
    for (const [l, r] of mirrorPairs) {
        if (!l || !r)
            continue;
        const mirrored = { x: 2 * mirrorX - r.x, y: r.y, z: r.z };
        asymSum += distance(l, mirrored);
        asymCount++;
    }
    if (asymCount > 0 && bizygomatic > 0)
        metrics.fluctuating_asymmetry = { value: (asymSum / asymCount) / bizygomatic, raw: { pairs: asymCount, mirrorX } };
    // --- Periorbital domain ---
    if (!suppressExpressive && !missingLoops) {
        if (innerCL && outerCL && innerCR && outerCR) {
            const tiltL = Math.atan2(outerCL.y - innerCL.y, Math.abs(outerCL.x - innerCL.x)) * 180 / Math.PI;
            const tiltR = Math.atan2(outerCR.y - innerCR.y, Math.abs(outerCR.x - innerCR.x)) * 180 / Math.PI;
            metrics.canthal_tilt = { value: (tiltL + tiltR) / 2, raw: { tiltL, tiltR } };
        }
        // Scleral show is lid geometry only. Gaze blendshapes describe eye rotation,
        // not lower-lid position, so they are intentionally never used as fallback.
        if (irisL && irisR && lowerLidL && lowerLidR && upperLidL && upperLidR) {
            const eyeHeightL = Math.abs(upperLidL.y - lowerLidL.y);
            const eyeHeightR = Math.abs(upperLidR.y - lowerLidR.y);
            const inferiorLimbusL = irisL.y - eyeHeightL / 2;
            const inferiorLimbusR = irisR.y - eyeHeightR / 2;
            const showL = inferiorLimbusL - lowerLidL.y;
            const showR = inferiorLimbusR - lowerLidR.y;
            metrics.scleral_show = { value: (showL + showR) / 2, raw: { showL, showR } };
        }
        if (upperLidL && lowerLidL && innerCL && outerCL && upperLidR && lowerLidR && innerCR && outerCR) {
            const hL = Math.abs(upperLidL.y - lowerLidL.y);
            const wL = distance(innerCL, outerCL);
            const hR = Math.abs(upperLidR.y - lowerLidR.y);
            const wR = distance(innerCR, outerCR);
            if (wL > 0 && wR > 0)
                metrics.palpebral_fissure_ratio = { value: ((hL / wL) + (hR / wR)) / 2, raw: { hL, wL, hR, wR } };
        }
        if (irisL && irisR && innerCL && outerCL) {
            const ipd = distance(irisL, irisR);
            const eyeWidth = distance(innerCL, outerCL);
            if (eyeWidth > 0)
                metrics.ipd_ratio = { value: ipd / eyeWidth, raw: { ipd, eyeWidth } };
        }
        else if (innerCL && innerCR && outerCL && outerCR) {
            const pupilL = midpoint(innerCL, outerCL);
            const pupilR = midpoint(innerCR, outerCR);
            const ipd = distance(pupilL, pupilR);
            const eyeWidth = distance(innerCL, outerCL);
            if (eyeWidth > 0)
                metrics.ipd_ratio = { value: ipd / eyeWidth, raw: { ipd, eyeWidth, source: 'canthus_proxy' } };
        }
    }
    // --- Mandibular domain ---
    if (!suppressExpressive) {
        if (gonionL && pogonion && tragionL && gonionR && tragionR) {
            const angL = angleDeg(sub(tragionL, gonionL), sub(pogonion, gonionL));
            const angR = angleDeg(sub(tragionR, gonionR), sub(pogonion, gonionR));
            metrics.gonial_angle = { value: (angL + angR) / 2, raw: { angL, angR } };
        }
        if (gonionL && gonionR && zygionL && zygionR) {
            const bigonial = distance(gonionL, gonionR);
            const bz = distance(zygionL, zygionR);
            if (bz > 0)
                metrics.bigonial_bizygomatic_ratio = { value: bigonial / bz, raw: { bigonial, bizygomatic: bz } };
        }
        if (pogonion && subnasale && pronasale && zygionL && zygionR) {
            const baseline = (subnasale.z + pronasale.z) / 2;
            const faceWidth = distance(zygionL, zygionR);
            metrics.chin_projection = { value: (pogonion.z - baseline) / Math.max(faceWidth, 1e-6), raw: { pogZ: pogonion.z, baseline } };
        }
    }
    // --- Midface domain ---
    if (tragionL && tragionR && zygionL && zygionR) {
        const bitemporal = distance(tragionL, tragionR);
        const bz = distance(zygionL, zygionR);
        if (bz > 0)
            metrics.bitemporal_bizygomatic_ratio = { value: bitemporal / bz, raw: { bitemporal, bizygomatic: bz } };
    }
    if (zygionL && zygionR && tragionL && tragionR) {
        const zygZ = (zygionL.z + zygionR.z) / 2;
        const tragZ = (tragionL.z + tragionR.z) / 2;
        const bz = distance(zygionL, zygionR);
        if (bz > 0)
            metrics.zygomatic_projection = { value: (zygZ - tragZ) / bz, raw: { zygZ, tragZ, bizygomatic: bz } };
    }
    if (glabella && menton && zygionL && zygionR) {
        const faceHeight = Math.abs(glabella.y - menton.y);
        const bz = distance(zygionL, zygionR);
        if (bz > 0)
            metrics.facial_index = { value: faceHeight / bz, raw: { faceHeight, bizygomatic: bz } };
    }
    if (!suppressExpressive && upperLip && stomion && lowerLip) {
        const upper = Math.abs(upperLip.y - stomion.y);
        const lower = Math.abs(stomion.y - lowerLip.y);
        if (lower > 0)
            metrics.lip_ratio = { value: upper / lower, raw: { upper, lower } };
    }
    // --- Nose domain ---
    if (alarL && alarR && zygionL && zygionR) {
        const alar = distance(alarL, alarR);
        const bz = distance(zygionL, zygionR);
        if (bz > 0)
            metrics.alar_bizygomatic_ratio = { value: alar / bz, raw: { alar, bizygomatic: bz } };
    }
    if (!suppressExpressive && cheilionL && cheilionR && alarL && alarR) {
        const mouth = distance(cheilionL, cheilionR);
        const alar = distance(alarL, alarR);
        if (alar > 0)
            metrics.mouth_nose_ratio = { value: mouth / alar, raw: { mouth, alar } };
    }
    if (subnasale && pronasale && upperLip) {
        metrics.nasolabial_angle = { value: angleDeg(sub(pronasale, subnasale), sub(upperLip, subnasale)), raw: {} };
    }
    // --- Brow domain ---
    if (!suppressExpressive && browApexL && upperLidL && browApexR && upperLidR && innerCL && innerCR) {
        const intercanthal = distance(innerCL, innerCR) || 1;
        const offsetL = (browApexL.y - upperLidL.y) / intercanthal;
        const offsetR = (browApexR.y - upperLidR.y) / intercanthal;
        metrics.brow_position = { value: (offsetL + offsetR) / 2, raw: { offsetL, offsetR } };
    }
    if (!suppressExpressive && browApexL && browInnerL && outerCL && browApexR && browInnerR && outerCR) {
        const lenL = distance(browInnerL, outerCL) || 1;
        const apexFracL = distance(browInnerL, browApexL) / lenL;
        const lenR = distance(browInnerR, outerCR) || 1;
        const apexFracR = distance(browInnerR, browApexR) / lenR;
        metrics.brow_apex_lateral_third = { value: (apexFracL + apexFracR) / 2, raw: { apexFracL, apexFracR } };
    }
    return metrics;
}
// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------
function isSexAware(cfg) {
    const v = cfg;
    return v.male != null || v.female != null || v.unisex != null;
}
function isRangeIdeal(cfg) {
    const v = cfg;
    return v.idealMin != null && v.idealMax != null;
}
function isPointIdeal(cfg) {
    const v = cfg;
    return v.target != null && v.halfWidth != null;
}
function resolveIdeal(metricKey, sex) {
    const cfg = IDEALS[metricKey];
    if (!cfg)
        return null;
    if (isSexAware(cfg)) {
        if (sex === 'male' && cfg.male)
            return cfg.male;
        if (sex === 'female' && cfg.female)
            return cfg.female;
        return cfg.unisex || cfg.male || cfg.female || null;
    }
    return cfg;
}
function scoreFromIdeal(value, ideal) {
    var _a;
    if (value == null || !Number.isFinite(value) || !ideal)
        return null;
    if (isRangeIdeal(ideal)) {
        const { idealMin, idealMax, hardMin, hardMax } = ideal;
        if (value >= idealMin && value <= idealMax)
            return 100;
        if (value <= hardMin || value >= hardMax)
            return 0;
        if (value < idealMin)
            return Math.round(85 * (value - hardMin) / (idealMin - hardMin));
        return Math.round(85 * (hardMax - value) / (hardMax - idealMax));
    }
    if (isPointIdeal(ideal)) {
        const { target, halfWidth } = ideal;
        const fallToZero = (_a = ideal.fallToZero) !== null && _a !== void 0 ? _a : halfWidth * 5;
        const dev = Math.abs(value - target);
        if (dev <= halfWidth)
            return Math.round(100 - 15 * (dev / halfWidth));
        if (dev >= fallToZero)
            return 0;
        return Math.round(85 * (1 - (dev - halfWidth) / (fallToZero - halfWidth)));
    }
    return null;
}
function scoreMetrics(metrics, sex = null) {
    const scored = {};
    for (const [key, entry] of Object.entries(metrics || {})) {
        const ideal = resolveIdeal(key, sex);
        const score = scoreFromIdeal(entry === null || entry === void 0 ? void 0 : entry.value, ideal);
        if (score != null)
            scored[key] = score;
    }
    return scored;
}
// ---------------------------------------------------------------------------
// Composite Harmony score
// ---------------------------------------------------------------------------
function composeHarmonyScore(scored, confidence = 'high') {
    let total = 0;
    let weightUsed = 0;
    let presentDomains = 0;
    const domainScores = {};
    for (const [domain, weight] of Object.entries(DOMAIN_WEIGHTS)) {
        const present = (METRICS_BY_DOMAIN[domain] || []).map((k) => scored[k]).filter((s) => Number.isFinite(s));
        if (present.length === 0) {
            domainScores[domain] = null;
            continue;
        }
        const avgScore = present.reduce((a, b) => a + b, 0) / present.length;
        domainScores[domain] = Math.round(avgScore);
        total += avgScore * weight;
        weightUsed += weight;
        presentDomains++;
    }
    if (confidence === 'low' || presentDomains < 4 || weightUsed === 0)
        return { harmony: null, domainScores, presentDomains };
    return { harmony: Math.round(total / weightUsed), domainScores, presentDomains };
}
const FINDING_RULES = [
    { metric: 'canthal_tilt', direction: 'low', code: 'canthal_tilt_negative' },
    { metric: 'canthal_tilt', direction: 'high', code: 'canthal_tilt_excess' },
    { metric: 'scleral_show', direction: 'high', code: 'scleral_show_inferior' },
    { metric: 'palpebral_fissure_ratio', direction: 'low', code: 'palpebral_fissure_narrow' },
    { metric: 'ipd_ratio', direction: 'either', code: 'ipd_atypical' },
    { metric: 'gonial_angle', direction: 'high', code: 'gonial_angle_obtuse' },
    { metric: 'gonial_angle', direction: 'low', code: 'gonial_angle_acute' },
    { metric: 'bigonial_bizygomatic_ratio', direction: 'high', code: 'lower_face_wide' },
    { metric: 'bigonial_bizygomatic_ratio', direction: 'low', code: 'lower_face_narrow' },
    { metric: 'chin_projection', direction: 'low', code: 'chin_recessed' },
    { metric: 'chin_projection', direction: 'high', code: 'chin_excess' },
    { metric: 'bitemporal_bizygomatic_ratio', direction: 'low', code: 'bitemporal_narrow' },
    { metric: 'bitemporal_bizygomatic_ratio', direction: 'high', code: 'bitemporal_wide' },
    { metric: 'zygomatic_projection', direction: 'low', code: 'midface_flat' },
    { metric: 'facial_index', direction: 'high', code: 'face_long' },
    { metric: 'facial_index', direction: 'low', code: 'face_short' },
    { metric: 'lip_ratio', direction: 'high', code: 'lip_ratio_high' },
    { metric: 'lip_ratio', direction: 'low', code: 'lip_ratio_low' },
    { metric: 'alar_bizygomatic_ratio', direction: 'high', code: 'alar_wide' },
    { metric: 'mouth_nose_ratio', direction: 'low', code: 'mouth_narrow' },
    { metric: 'mouth_nose_ratio', direction: 'high', code: 'mouth_wide' },
    { metric: 'nasolabial_angle', direction: 'low', code: 'nasolabial_acute' },
    { metric: 'nasolabial_angle', direction: 'high', code: 'nasolabial_obtuse' },
    { metric: 'brow_position', direction: 'low', code: 'brow_low' },
    { metric: 'brow_position', direction: 'high', code: 'brow_high' },
    { metric: 'brow_apex_lateral_third', direction: 'either', code: 'brow_apex_misplaced' },
    { metric: 'facial_thirds', direction: 'low', code: 'thirds_uneven' },
    { metric: 'facial_fifths', direction: 'low', code: 'fifths_uneven' },
    { metric: 'fluctuating_asymmetry', direction: 'high', code: 'asymmetry_elevated' },
];
const SEVERITY_THRESHOLDS = { mild: 75, moderate: 55, marked: 0 };
const FINDING_THRESHOLD = SEVERITY_THRESHOLDS.mild;
function severityFromScore(score) {
    if (score >= SEVERITY_THRESHOLDS.mild)
        return 'mild';
    if (score >= SEVERITY_THRESHOLDS.moderate)
        return 'moderate';
    return 'marked';
}
function findingsFromScores(metrics, scored, sex) {
    const findings = [];
    for (const rule of FINDING_RULES) {
        const metric = metrics[rule.metric];
        const score = scored[rule.metric];
        if (!metric || score == null || score >= FINDING_THRESHOLD)
            continue;
        const ideal = resolveIdeal(rule.metric, sex);
        if (!ideal)
            continue;
        let side = 'either';
        if (isRangeIdeal(ideal))
            side = metric.value < ideal.idealMin ? 'low' : metric.value > ideal.idealMax ? 'high' : 'either';
        else if (isPointIdeal(ideal))
            side = metric.value < ideal.target ? 'low' : metric.value > ideal.target ? 'high' : 'either';
        if (rule.direction !== 'either' && rule.direction !== side)
            continue;
        findings.push({ findingCode: rule.code, metric: rule.metric, value: metric.value, score, severity: severityFromScore(score) });
    }
    findings.sort((a, b) => a.score - b.score);
    return findings;
}
function analyzeBoneStructure({ vertices, indices = null, blendShapes = null, sex = null, source = 'arkit' }) {
    const normalized = normalizeSource(source);
    if (isDegenerateMesh(vertices)) {
        return { harmony: null, status: 'no_face', metrics: {}, scored: {}, findings: [], domainScores: {}, dominantDriver: null, source: normalized, sex: sex || null, estimate: normalized !== 'arkit', confidence: 'low', landmark_source: normalized === 'arkit' ? 'derived' : 'template' };
    }
    const resolution = resolveLandmarks(vertices, normalized, indices);
    if (resolution.status !== 'ok') {
        return { harmony: null, status: 'no_face', metrics: {}, scored: {}, findings: [], domainScores: {}, dominantDriver: null, source: normalized, sex: sex || null, estimate: normalized !== 'arkit', confidence: resolution.confidence, landmark_source: resolution.landmark_source };
    }
    let confidence = resolution.confidence;
    if (expressionIsNonNeutral(blendShapes)) {
        // Expression blendshapes move eyelids, mouth corners, and jaw angle; scoring
        // them as neutral bone structure would punish a smile/blink instead of anatomy.
        confidence = 'low';
    }
    const metrics = computeMetricsFromLandmarks(resolution.landmarks, blendShapes, confidence, resolution.missingLoops === true);
    if (!metrics) {
        return { harmony: null, status: 'no_face', metrics: {}, scored: {}, findings: [], domainScores: {}, dominantDriver: null, source: normalized, sex: sex || null, estimate: normalized !== 'arkit', confidence, landmark_source: resolution.landmark_source };
    }
    const scored = scoreMetrics(metrics, sex);
    const { harmony, domainScores, presentDomains } = composeHarmonyScore(scored, confidence);
    const findings = findingsFromScores(metrics, scored, sex);
    let dominantDriver = null;
    let lowest = Infinity;
    for (const [domain, score] of Object.entries(domainScores)) {
        if (score != null && score < lowest) {
            lowest = score;
            dominantDriver = domain;
        }
    }
    const status = harmony == null || confidence === 'low' || presentDomains < 4 ? 'insufficient' : 'ok';
    return { harmony, status, metrics, scored, domainScores, findings, dominantDriver, source: normalized, sex: sex || null, estimate: normalized !== 'arkit', confidence, landmark_source: resolution.landmark_source };
}


module.exports = {
  MEDIAPIPE_LANDMARKS,
  LANDMARK_TABLES,
  DOMAIN_WEIGHTS,
  METRICS_BY_DOMAIN,
  IDEALS,
  FINDING_RULES,
  FINDING_THRESHOLD,
  SEVERITY_THRESHOLDS,
  isDegenerateMesh,
  isSourceCoherent,
  deriveLandmarksFromMesh,
  buildFaceFrameFromLandmarks,
  buildFaceFrame,
  toLocal,
  computeMetrics3D,
  resolveIdeal,
  scoreFromIdeal,
  scoreMetrics,
  composeHarmonyScore,
  findingsFromScores,
  analyzeBoneStructure,
  vec,
};
