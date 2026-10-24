import circuitsJson from "../data/circuits.json";

export type Vec3 = [number, number, number];

interface RawTrack {
  round: number;
  name: string;
  widthM: number;
  lengthM: number;
  geoLengthM: number | null;
  elevationM: number;
  source: string;
  sessionKey?: number;
  year?: number;
  lap?: number;
  samples?: number;
  points: number[][];
}

export interface TrackMeta {
  id: string;
  round: number;
  widthM: number;
  lengthM: number;
  elevationM: number;
  source: string;
  year?: number;
  sessionKey?: number;
}

export interface TrackGeometry extends TrackMeta {
  /** centrelines em metros, eixo Z = elevação real */
  points: Vec3[];
  /** perpendicular horizontal unitária em cada ponto */
  normals: [number, number][];
  /** curvatura assinada em 1/m */
  curvature: number[];
  box: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
    cx: number;
    cy: number;
    cz: number;
    span: number;
  };
}

const raw = circuitsJson.tracks as unknown as Record<string, RawTrack>;

const cache = new Map<string, TrackGeometry>();

export function buildGeometry(id: string): TrackGeometry | null {
  const source = raw[id];
  if (!source) return null;
  const cached = cache.get(id);
  if (cached) return cached;

  const points: Vec3[] = source.points.map((p) => [p[0], p[1], p[2]]);
  const n = points.length;
  const normals: [number, number][] = [];
  const curvature: number[] = [];

  for (let i = 0; i < n; i += 1) {
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    normals.push([-dy / len, dx / len]);
  }

  for (let i = 0; i < n; i += 1) {
    const a = points[(i - 1 + n) % n];
    const b = points[i];
    const c = points[(i + 1) % n];
    const h1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const h2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
    let delta = h2 - h1;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const ds = (Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - b[0], c[1] - b[1])) / 2 || 1;
    curvature.push(delta / ds);
  }

  // suaviza a curvatura para desenhar zebras apenas em curvas reais
  const smooth = curvature.map((_, i) => {
    const a = curvature[(i - 1 + n) % n];
    const b = curvature[i];
    const c = curvature[(i + 1) % n];
    return (a + b * 2 + c) / 4;
  });

  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const zs = points.map((p) => p[2]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  const geo: TrackGeometry = {
    id,
    round: source.round,
    widthM: source.widthM,
    lengthM: source.lengthM,
    elevationM: source.elevationM,
    source: source.source,
    year: source.year,
    sessionKey: source.sessionKey,
    points,
    normals,
    curvature: smooth,
    box: {
      minX,
      maxX,
      minY,
      maxY,
      minZ,
      maxZ,
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      cz: (minZ + maxZ) / 2,
      span: Math.max(maxX - minX, maxY - minY),
    },
  };
  cache.set(id, geo);
  return geo;
}

export function getTrack(id: string | undefined | null): TrackGeometry | null {
  if (!id) return null;
  return buildGeometry(id);
}

export const trackIds = Object.keys(raw);

const wrap = (value: number) => ((value % 1) + 1) % 1;

export interface TrackPoint {
  point: Vec3;
  heading: number;
  index: number;
}

/** posição no traçado a partir da fração de volta (0 = linha de chegada) */
export function pointAt(geo: TrackGeometry, s: number): TrackPoint {
  const n = geo.points.length;
  const wrapped = wrap(s);
  const raw = wrapped * n;
  const i = Math.floor(raw) % n;
  const j = (i + 1) % n;
  const t = raw - Math.floor(raw);
  const a = geo.points[i];
  const b = geo.points[j];
  return {
    point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
    heading: Math.atan2(b[1] - a[1], b[0] - a[0]),
    index: i,
  };
}

export interface CarInput {
  code: string;
  pos: number;
  gap: number | null;
  lapped?: boolean;
  color: string;
  compound?: string;
  stops?: number;
  bestLap?: string | null;
  /** posição explícita na volta (0..1); sobrepõe o cálculo por gap */
  s?: number;
}

export interface PlacedCar extends CarInput {
  s: number;
  point: Vec3;
  heading: number;
  /** deslocamento lateral em metros (para não sobrepor carros colados) */
  lateral: number;
}

/**
 * Distribui os carros pelo traçado real usando os gaps reais da corrida.
 * A velocidade média vem da volta do líder, então um gap de 10s equivale
 * à distância física percorrida em 10s naquele circuito.
 */
export function placeCars(
  cars: CarInput[],
  geo: TrackGeometry,
  progress: number,
  refLapSeconds: number,
): PlacedCar[] {
  const lap = refLapSeconds > 20 ? refLapSeconds : 95;
  const speed = geo.lengthM / lap;
  const sorted = [...cars].sort((a, b) => a.pos - b.pos);
  return sorted.map((car, i) => {
    const gap = car.gap ?? i * 1.1;
    const behind = Math.max(0, gap) * speed;
    const s = car.s !== undefined ? wrap(car.s) : wrap(progress - behind / geo.lengthM);
    const { point, heading } = pointAt(geo, s);
    // carros em disputa ganham um leve offset lateral, como duas linhas de corrida
    const lateral = gap < 0.9 ? (i % 2 === 0 ? 1.5 : -1.5) : 0;
    return { ...car, s, point, heading, lateral };
  });
}

export interface Camera {
  yaw: number;
  pitch: number;
  dist: number;
  target: Vec3;
}

export interface Projected {
  x: number;
  y: number;
  depth: number;
  scale: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export interface Basis {
  eye: Vec3;
  fwd: Vec3;
  right: Vec3;
  up: Vec3;
  focal: number;
  zs: number;
}

/** base ortonormal da câmera; zs é a escala aplicada ao relevo */
export function cameraBasis(cam: Camera, height: number, zs = 1, fovDeg = 42): Basis {
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const target: Vec3 = [cam.target[0], cam.target[1], cam.target[2] * zs];
  const eye: Vec3 = [
    target[0] + cam.dist * cp * Math.cos(cam.yaw),
    target[1] + cam.dist * cp * Math.sin(cam.yaw),
    target[2] + cam.dist * sp,
  ];
  const fwd = norm(sub(target, eye));
  const right = norm(cross(fwd, [0, 0, 1]));
  const up = cross(right, fwd);
  return { eye, fwd, right, up, focal: height / 2 / Math.tan((fovDeg * Math.PI) / 180 / 2), zs };
}

export function projectIn(basis: Basis, width: number, height: number, p: Vec3): Projected | null {
  const dx = p[0] - basis.eye[0];
  const dy = p[1] - basis.eye[1];
  const dz = p[2] * basis.zs - basis.eye[2];
  const depth = dx * basis.fwd[0] + dy * basis.fwd[1] + dz * basis.fwd[2];
  if (depth < 4) return null;
  const sx = dx * basis.right[0] + dy * basis.right[1] + dz * basis.right[2];
  const sy = dx * basis.up[0] + dy * basis.up[1] + dz * basis.up[2];
  return {
    x: width / 2 + (sx * basis.focal) / depth,
    y: height / 2 - (sy * basis.focal) / depth,
    depth,
    scale: basis.focal / depth,
  };
}

export function projectPoint(
  p: Vec3,
  cam: Camera,
  width: number,
  height: number,
  fovDeg = 42,
): Projected | null {
  return projectIn(cameraBasis(cam, height, 1, fovDeg), width, height, p);
}

export function cameraEye(cam: Camera): Vec3 {
  return cameraBasis(cam, 100).eye;
}

export function defaultCamera(geo: TrackGeometry): Camera {
  return {
    yaw: -2.2,
    pitch: 0.74,
    dist: Math.max(geo.box.span, 300) * 1.5,
    target: [geo.box.cx, geo.box.cy, geo.box.cz],
  };
}

/**
 * Enquadra o traçado inteiro no canvas, independente do formato da tela.
 * Projeta os cantos da caixa, ajusta a distância e recentraliza o alvo.
 */
function measure(
  cam: Camera,
  width: number,
  height: number,
  zs: number,
  samples: Vec3[],
) {
  const basis = cameraBasis(cam, height, zs);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  let lost = 0;
  for (const p3 of samples) {
    const p = projectIn(basis, width, height, p3);
    if (!p) {
      lost += 1;
      continue;
    }
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  return { basis, x0, x1, y0, y1, lost };
}

/** enquadra o traçado para um yaw fixo, sempre partindo do centro do circuito */
function fitYaw(geo: TrackGeometry, yaw: number, pitch: number, width: number, height: number, zs: number) {
  const span = Math.max(geo.box.span, 300);
  const samples = geo.points.filter((_, i) => i % 2 === 0);
  const next: Camera = {
    yaw,
    pitch,
    dist: span * 2,
    target: [geo.box.cx, geo.box.cy, geo.box.cz],
  };

  for (let i = 0; i < 5; i += 1) {
    const m = measure(next, width, height, zs, samples);
    if (!Number.isFinite(m.x0) || m.x1 - m.x0 < 1) break;
    if (m.lost > 0) {
      // câmera dentro do volume do traçado: afasta antes de medir de novo
      next.dist *= 1.6;
      continue;
    }
    const bw = Math.max(1, m.x1 - m.x0);
    const bh = Math.max(1, m.y1 - m.y0);
    const scale = Math.min((width * 0.86) / bw, (height * 0.8) / bh);
    next.dist = Math.min(span * 6, Math.max(span * 0.3, next.dist / scale));

    const shiftX = (width / 2 - (m.x0 + m.x1) / 2) * (next.dist / m.basis.focal);
    const shiftY = ((m.y0 + m.y1) / 2 - height / 2) * (next.dist / m.basis.focal);
    next.target = [
      next.target[0] - m.basis.right[0] * shiftX - m.basis.up[0] * shiftY,
      next.target[1] - m.basis.right[1] * shiftX - m.basis.up[1] * shiftY,
      next.target[2] - m.basis.right[2] * shiftX - m.basis.up[2] * shiftY,
    ];
  }

  const m = measure(next, width, height, zs, samples);
  const fill = Math.min((m.x1 - m.x0) / width, (m.y1 - m.y0) / height);
  return { cam: next, fill: Number.isFinite(fill) ? fill : 0 };
}

/**
 * Enquadra o traçado e escolhe o ângulo que melhor aproveita a tela,
 * girando a pista em vez de deixá-la pequena no meio do canvas.
 */
export function fitCamera(geo: TrackGeometry, cam: Camera, width: number, height: number, zs = 1): Camera {
  if (!width || !height) return cam;
  let best = fitYaw(geo, cam.yaw, cam.pitch, width, height, zs);
  for (let step = 1; step < 12; step += 1) {
    const candidate = fitYaw(geo, cam.yaw + (step * Math.PI) / 6, cam.pitch, width, height, zs);
    if (candidate.fill > best.fill + 0.01) best = candidate;
  }
  return best.cam;
}

export type FaceKind = "track" | "kerb" | "wall" | "line";

export interface Face {
  vertices: Vec3[];
  kind: FaceKind;
  /** 0..1 opacidade/tom extra */
  tone: number;
}

/** Malha do circuito: pista extrudada + zebras nas curvas. */
export function buildFaces(geo: TrackGeometry, thickness = 7): Face[] {
  const n = geo.points.length;
  const half = geo.widthM / 2;
  const faces: Face[] = [];

  const edge = (i: number, side: number, extra = 0): Vec3 => {
    const p = geo.points[i];
    const nm = geo.normals[i];
    const w = half + extra;
    return [p[0] + nm[0] * w * side, p[1] + nm[1] * w * side, p[2]];
  };

  const slopeTone = (i: number, j: number) => {
    const a = geo.points[i];
    const b = geo.points[j];
    const climb = (b[2] - a[2]) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1);
    return Math.max(0, Math.min(1, 0.74 + climb * 3.4));
  };

  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const L0 = edge(i, -1);
    const L1 = edge(j, -1);
    const R0 = edge(i, 1);
    const R1 = edge(j, 1);
    faces.push({ vertices: [L0, R0, R1, L1], kind: "track", tone: slopeTone(i, j) });

    const down = (p: Vec3): Vec3 => [p[0], p[1], p[2] - thickness];
    faces.push({ vertices: [L0, L1, down(L1), down(L0)], kind: "wall", tone: 0.38 });
    faces.push({ vertices: [R1, R0, down(R0), down(R1)], kind: "wall", tone: 0.3 });

    const corner = Math.abs(geo.curvature[i]);
    if (corner > 0.012) {
      const outer = geo.curvature[i] < 0 ? -1 : 1;
      const k0 = edge(i, outer, 0.1);
      const k1 = edge(j, outer, 0.1);
      const k0b = edge(i, outer, 2.1);
      const k1b = edge(j, outer, 2.1);
      faces.push({
        vertices: [k0, k0b, k1b, k1],
        kind: "kerb",
        tone: Math.floor(i / 3) % 2 === 0 ? 1 : 0,
      });
    }
  }

  return faces;
}
