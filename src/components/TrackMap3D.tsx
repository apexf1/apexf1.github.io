import { useEffect, useMemo, useRef, useState } from "react";
import { Layers, Maximize2, Mountain, RotateCcw, Target, Video } from "lucide-react";
import {
  buildFaces,
  cameraBasis,
  defaultCamera,
  fitCamera,
  placeCars,
  pointAt,
  projectIn,
  type Camera,
  type CarInput,
  type Face,
  type TrackGeometry,
} from "../lib/track3d";
import { useI18n } from "../lib/i18n";

type Preset = "tv" | "top" | "low" | "follow";

interface Props {
  geo: TrackGeometry;
  cars?: CarInput[];
  /** duração real de uma volta, usada para converter gaps em distância */
  lapSeconds?: number;
  /** muda quando a volta do replay avança (reinicia a animação) */
  lapKey?: number;
  playing?: boolean;
  /** duração de uma volta do replay em ms */
  lapMs?: number;
  focus?: string | null;
  onFocus?: (code: string | null) => void;
  compact?: boolean;
  height?: number;
  className?: string;
  theme?: "dark" | "light";
}

interface Hit {
  code: string;
  x: number;
  y: number;
}

const FOV = 42;

interface Palette {
  bgTop: readonly [number, number, number];
  bgBottom: readonly [number, number, number];
  asphalt: readonly [number, number, number];
  wall: readonly [number, number, number];
  fog: readonly [number, number, number];
  kerbRed: readonly [number, number, number];
  kerbWhite: readonly [number, number, number];
  grid: string;
  shadow: string;
  faceStroke: string;
  sfDark: string;
  sfLight: string;
  carShadow: string;
  carRing: string;
  carStroke: string;
  trackEdge: string;
  labelLine: string;
  labelLineIdle: string;
  labelBg: string;
  labelText: string;
}

const DARK: Palette = {
  bgTop: [10, 11, 14],
  bgBottom: [17, 18, 22],
  asphalt: [52, 55, 64],
  wall: [78, 80, 92],
  fog: [10, 11, 14],
  kerbRed: [198, 54, 40],
  kerbWhite: [226, 228, 234],
  grid: "rgba(255,255,255,0.04)",
  shadow: "rgba(0,0,0,0.42)",
  faceStroke: "rgba(255,255,255,0.05)",
  sfDark: "rgba(18,19,23,0.95)",
  sfLight: "rgba(235,238,245,0.95)",
  carShadow: "rgba(0,0,0,0.55)",
  carRing: "#fff",
  carStroke: "rgba(8,9,12,0.85)",
  trackEdge: "rgba(232,236,244,0.22)",
  labelLine: "rgba(255,255,255,0.5)",
  labelLineIdle: "rgba(255,255,255,0.14)",
  labelBg: "rgba(14,15,19,0.88)",
  labelText: "rgba(226,230,238,0.96)",
};

const LIGHT: Palette = {
  bgTop: [246, 247, 250],
  bgBottom: [225, 229, 237],
  asphalt: [118, 126, 141],
  wall: [96, 104, 118],
  fog: [238, 241, 246],
  kerbRed: [206, 58, 42],
  kerbWhite: [252, 253, 255],
  grid: "rgba(15,20,30,0.06)",
  shadow: "rgba(20,26,36,0.16)",
  faceStroke: "rgba(15,20,30,0.08)",
  sfDark: "rgba(20,23,30,0.95)",
  sfLight: "rgba(252,253,255,0.96)",
  carShadow: "rgba(20,26,36,0.2)",
  carRing: "#101319",
  carStroke: "rgba(255,255,255,0.85)",
  trackEdge: "rgba(20,26,36,0.28)",
  labelLine: "rgba(15,20,30,0.55)",
  labelLineIdle: "rgba(15,20,30,0.2)",
  labelBg: "rgba(255,255,255,0.93)",
  labelText: "rgba(14,18,26,0.95)",
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const mix = (a: readonly [number, number, number], b: readonly [number, number, number], t: number) =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(
    a[2] + (b[2] - a[2]) * t,
  )})`;

export default function TrackMap3D({
  geo,
  cars = [],
  lapSeconds = 95,
  lapKey = 0,
  playing = false,
  lapMs = 3600,
  focus = null,
  onFocus,
  compact = false,
  height,
  className,
  theme = "dark",
}: Props) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const camRef = useRef<Camera>(defaultCamera(geo));
  const phaseRef = useRef(0);
  const dirtyRef = useRef(true);
  const hitsRef = useRef<Hit[]>([]);
  const hoverRef = useRef<string | null>(null);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number; moved: number } | null>(null);
  /** dedos ativos no canvas, para o gesto de pinça */
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ gap: number; dist: number } | null>(null);

  const [preset, setPreset] = useState<Preset>("tv");
  const [labels, setLabels] = useState(!compact);
  const [relief, setRelief] = useState(1.4);
  const fitRef = useRef(true);

  const faces = useMemo(() => buildFaces(geo, 14), [geo]);
  const propsRef = useRef({ geo, cars, lapSeconds, playing, lapMs, focus, labels, relief, preset, theme });
  propsRef.current = { geo, cars, lapSeconds, playing, lapMs, focus, labels, relief, preset, theme };

  useEffect(() => {
    dirtyRef.current = true;
  }, [theme]);

  useEffect(() => {
    camRef.current = defaultCamera(geo);
    fitRef.current = true;
    phaseRef.current = 0;
    dirtyRef.current = true;
  }, [geo]);

  useEffect(() => {
    phaseRef.current = 0;
    dirtyRef.current = true;
  }, [lapKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();
    let width = 0;
    let heightPx = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = canvas.clientWidth;
      heightPx = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(heightPx * dpr));
      fitRef.current = true;
      dirtyRef.current = true;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const draw = () => {
      const p = propsRef.current;
      const w = width;
      const h = heightPx;
      if (!w || !h) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const P = p.theme === "light" ? LIGHT : DARK;
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, `rgb(${P.bgTop.join(",")})`);
      bg.addColorStop(1, `rgb(${P.bgBottom.join(",")})`);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const { box } = p.geo;
      const cam = camRef.current;
      const zs = p.relief;

      if (fitRef.current) {
        const fitted = fitCamera(p.geo, cam, w, h, zs);
        camRef.current = fitted;
        fitRef.current = false;
      }

      if (p.preset === "follow" && p.cars.length) {
        const leader = [...p.cars].sort((a, b) => a.pos - b.pos)[0];
        const at = pointAt(p.geo, leader.s ?? phaseRef.current);
        const k = 0.14;
        cam.target = [
          cam.target[0] + (at.point[0] - cam.target[0]) * k,
          cam.target[1] + (at.point[1] - cam.target[1]) * k,
          cam.target[2] + (at.point[2] - cam.target[2]) * k,
        ];
      }

      const basis = cameraBasis(cam, h, zs, FOV);
      const proj = (x: number, y: number, z: number) => projectIn(basis, w, h, [x, y, z]);

      // grade de referência no chão
      const groundZ = box.minZ - 16;
      const step = Math.max(200, Math.round(box.span / 7 / 100) * 100);
      const reach = step * 7;
      ctx.lineWidth = 1;
      ctx.strokeStyle = P.grid;
      for (let i = -reach; i <= reach; i += step) {
        const a = proj(box.cx + i, box.cy - reach, groundZ);
        const b = proj(box.cx + i, box.cy + reach, groundZ);
        if (a && b) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        const c = proj(box.cx - reach, box.cy + i, groundZ);
        const d = proj(box.cx + reach, box.cy + i, groundZ);
        if (c && d) {
          ctx.beginPath();
          ctx.moveTo(c.x, c.y);
          ctx.lineTo(d.x, d.y);
          ctx.stroke();
        }
      }

      type Layer = { depth: number; render: () => void };
      const layers: Layer[] = [];
      const fogSpan = cam.dist * 1.7;

      // sombra projetada no chão: dá a sensação de pista suspensa em 3D
      const shadowOffset = Math.max(12, box.span * 0.02);
      ctx.fillStyle = P.shadow;
      for (const face of faces as Face[]) {
        if (face.kind !== "track") continue;
        const pts: { x: number; y: number }[] = [];
        let ok = true;
        for (const v of face.vertices) {
          const s = proj(v[0] + shadowOffset, v[1] + shadowOffset * 1.4, groundZ + 0.5);
          if (!s) {
            ok = false;
            break;
          }
          pts.push(s);
        }
        if (!ok) continue;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
        ctx.fill();
      }

      for (const face of faces as Face[]) {
        const pts: { x: number; y: number }[] = [];
        let sum = 0;
        let ok = true;
        for (const v of face.vertices) {
          const s = proj(v[0], v[1], v[2]);
          if (!s) {
            ok = false;
            break;
          }
          pts.push(s);
          sum += s.depth;
        }
        if (!ok) continue;
        const depth = sum / face.vertices.length;
        const fog = clamp((depth - cam.dist * 0.5) / fogSpan, 0, 1);
        let base: readonly [number, number, number] = P.asphalt;
        if (face.kind === "wall") base = P.wall;
        if (face.kind === "kerb") base = face.tone > 0.5 ? P.kerbRed : P.kerbWhite;
        const tone = face.kind === "kerb" ? 1 : face.kind === "wall" ? face.tone * 1.25 : face.tone;
        const fill = mix([base[0] * tone, base[1] * tone, base[2] * tone], P.fog, fog);
        const isEdge = face.kind === "kerb";
        layers.push({
          depth,
          render: () => {
            ctx.fillStyle = fill;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = isEdge ? fill : P.faceStroke;
            ctx.lineWidth = 0.7;
            ctx.stroke();
          },
        });
      }

      // linha de largada/chegada
      const half = p.geo.widthM / 2;
      const sf = pointAt(p.geo, 0);
      const nx = -Math.sin(sf.heading);
      const ny = Math.cos(sf.heading);
      const sfA = proj(sf.point[0] + nx * half, sf.point[1] + ny * half, sf.point[2] + 0.5);
      const sfB = proj(sf.point[0] - nx * half, sf.point[1] - ny * half, sf.point[2] + 0.5);
      if (sfA && sfB) {
        const checks: { depth: number; render: () => void }[] = [];
        const cells = 10;
        const along = 2.4;
        const dx = Math.cos(sf.heading) * along;
        const dy = Math.sin(sf.heading) * along;
        for (let i = 0; i < cells; i += 1) {
          const t0 = -half + (i / cells) * half * 2;
          const t1 = -half + ((i + 1) / cells) * half * 2;
          for (let row = 0; row < 2; row += 1) {
            const o0 = row === 0 ? -along : 0;
            const o1 = row === 0 ? 0 : along;
            const quad = [
              proj(sf.point[0] + nx * t0 + dx * (o0 / along), sf.point[1] + ny * t0 + dy * (o0 / along), sf.point[2] + 0.35),
              proj(sf.point[0] + nx * t1 + dx * (o0 / along), sf.point[1] + ny * t1 + dy * (o0 / along), sf.point[2] + 0.35),
              proj(sf.point[0] + nx * t1 + dx * (o1 / along), sf.point[1] + ny * t1 + dy * (o1 / along), sf.point[2] + 0.35),
              proj(sf.point[0] + nx * t0 + dx * (o1 / along), sf.point[1] + ny * t0 + dy * (o1 / along), sf.point[2] + 0.35),
            ];
            if (!quad.every(Boolean)) continue;
            const q = quad as { x: number; y: number; depth: number }[];
            const dark = (i + row) % 2 === 0;
            checks.push({
              depth: (q[0].depth + q[1].depth + q[2].depth + q[3].depth) / 4,
              render: () => {
                ctx.beginPath();
                ctx.moveTo(q[0].x, q[0].y);
                for (let k = 1; k < q.length; k += 1) ctx.lineTo(q[k].x, q[k].y);
                ctx.closePath();
                ctx.fillStyle = dark ? P.sfDark : P.sfLight;
                ctx.fill();
              },
            });
          }
        }
        layers.push(...checks);
      }

      const placed = placeCars(p.cars, p.geo, phaseRef.current, p.lapSeconds);
      hitsRef.current = [];
      type CarScreen = { code: string; x: number; y: number; depth: number; scale: number; color: string; pos: number };
      const carScreen: CarScreen[] = [];

      for (const car of placed) {
        const px = Math.cos(car.heading + Math.PI / 2);
        const py = Math.sin(car.heading + Math.PI / 2);
        const cx = car.point[0] + px * car.lateral;
        const cy = car.point[1] + py * car.lateral;
        const cz = car.point[2];
        const center = proj(cx, cy, cz + 1);
        if (!center) continue;

        const fx = Math.cos(car.heading) * 3.1;
        const fy = Math.sin(car.heading) * 3.1;
        const bx = px * 1.15;
        const by = py * 1.15;
        const corners = [
          proj(cx + fx + bx, cy + fy + by, cz + 1.2),
          proj(cx + fx - bx, cy + fy - by, cz + 1.2),
          proj(cx - fx - bx, cy - fy - by, cz + 1.2),
          proj(cx - fx + bx, cy - fy + by, cz + 1.2),
        ];
        const isFocus = p.focus === car.code;
        const isHover = hoverRef.current === car.code;
        const radius = Math.max(2.2, 2.1 * center.scale);

        layers.push({
          depth: center.depth,
          render: () => {
            ctx.fillStyle = P.carShadow;
            ctx.beginPath();
            ctx.ellipse(center.x, center.y, Math.max(4, 8 * center.scale), Math.max(2, 4 * center.scale), 0, 0, Math.PI * 2);
            ctx.fill();

            if (corners.every(Boolean)) {
              const s = corners as { x: number; y: number }[];
              const area =
                Math.abs((s[0].x - s[2].x) * (s[1].y - s[3].y)) || 0;
              if (area > 40) {
                ctx.beginPath();
                ctx.moveTo(s[0].x, s[0].y);
                for (let i = 1; i < s.length; i += 1) ctx.lineTo(s[i].x, s[i].y);
                ctx.closePath();
                ctx.fillStyle = car.color;
                ctx.fill();
                ctx.lineWidth = isFocus || isHover ? 1.8 : 0.9;
                ctx.strokeStyle = isFocus ? P.carRing : P.carStroke;
                ctx.stroke();
              }
            }

            ctx.beginPath();
            ctx.arc(center.x, center.y - radius * 0.35, radius, 0, Math.PI * 2);
            ctx.fillStyle = car.color;
            ctx.fill();
            ctx.lineWidth = isFocus || isHover ? 1.8 : 1;
            ctx.strokeStyle = isFocus ? P.carRing : P.carStroke;
            ctx.stroke();

            if (car.pos === 1) {
              ctx.beginPath();
              ctx.arc(center.x, center.y, Math.max(6, 7 * center.scale), 0, Math.PI * 2);
              ctx.strokeStyle = "rgba(255,45,18,0.85)";
              ctx.lineWidth = 1.4;
              ctx.stroke();
            }
          },
        });

        carScreen.push({
          code: car.code,
          x: center.x,
          y: center.y,
          depth: center.depth,
          scale: center.scale,
          color: car.color,
          pos: car.pos,
        });
        hitsRef.current.push({ code: car.code, x: center.x, y: center.y });
      }

      layers.sort((a, b) => b.depth - a.depth);
      for (const layer of layers) layer.render();

      // limites da pista
      ctx.lineWidth = 1;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < p.geo.points.length; i += 1) {
          const pt = p.geo.points[i];
          const nm = p.geo.normals[i];
          const s = proj(pt[0] + nm[0] * half * side, pt[1] + nm[1] * half * side, pt[2] + 0.25);
          if (!s) {
            started = false;
            continue;
          }
          if (!started) {
            ctx.moveTo(s.x, s.y);
            started = true;
          } else {
            ctx.lineTo(s.x, s.y);
          }
        }
        ctx.strokeStyle = P.trackEdge;
        ctx.stroke();
      }

      // etiquetas acima de tudo
      carScreen.sort((a, b) => b.depth - a.depth);
      const used: { x0: number; y0: number; x1: number; y1: number }[] = [];
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const car of carScreen) {
        const show = p.labels || p.focus === car.code || hoverRef.current === car.code || car.pos <= 3;
        if (!show) continue;
        const label = { x: car.x, y: car.y - Math.max(16, 30 * car.scale) };
        const isFocus = p.focus === car.code;
        ctx.font = '700 10px "Titillium Web", system-ui, sans-serif';
        const text = car.code;
        const boxW = ctx.measureText(text).width + 11;
        const boxH = 15;
        const rect = {
          x0: label.x - boxW / 2 - 2,
          y0: label.y - boxH / 2 - 2,
          x1: label.x + boxW / 2 + 2,
          y1: label.y + boxH / 2 + 2,
        };
        if (
          !isFocus &&
          used.some((u) => rect.x0 < u.x1 && rect.x1 > u.x0 && rect.y0 < u.y1 && rect.y1 > u.y0)
        )
          continue;
        used.push(rect);
        const isHover = hoverRef.current === car.code;

        ctx.strokeStyle = isFocus || isHover ? P.labelLine : P.labelLineIdle;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(car.x, car.y - 3);
        ctx.lineTo(car.x, label.y + boxH / 2);
        ctx.stroke();

        const rx = label.x - boxW / 2;
        const ry = label.y - boxH / 2;
        const r = 3;
        ctx.beginPath();
        ctx.moveTo(rx + r, ry);
        ctx.lineTo(rx + boxW - r, ry);
        ctx.quadraticCurveTo(rx + boxW, ry, rx + boxW, ry + r);
        ctx.lineTo(rx + boxW, ry + boxH - r);
        ctx.quadraticCurveTo(rx + boxW, ry + boxH, rx + boxW - r, ry + boxH);
        ctx.lineTo(rx + r, ry + boxH);
        ctx.quadraticCurveTo(rx, ry + boxH, rx, ry + boxH - r);
        ctx.lineTo(rx, ry + r);
        ctx.quadraticCurveTo(rx, ry, rx + r, ry);
        ctx.closePath();
        ctx.fillStyle = isFocus ? "rgba(255,45,18,0.94)" : P.labelBg;
        ctx.fill();
        ctx.strokeStyle = isFocus ? "#ff2d12" : `${car.color}99`;
        ctx.stroke();

        ctx.fillStyle = isFocus ? "#fff" : P.labelText;
        ctx.fillText(text, label.x, label.y + 0.5);
      }
      ctx.textBaseline = "alphabetic";
    };

    const tick = (now: number) => {
      const dt = Math.min(120, now - last);
      last = now;
      const p = propsRef.current;
      if (p.playing) {
        phaseRef.current = Math.min(0.996, phaseRef.current + dt / p.lapMs);
        dirtyRef.current = true;
      }
      if (p.preset === "follow") dirtyRef.current = true;
      if (dirtyRef.current) {
        dirtyRef.current = false;
        draw();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const cam = camRef.current;
      const span = Math.max(propsRef.current.geo.box.span, 300);
      cam.dist = clamp(cam.dist * Math.exp(event.deltaY * 0.0011), span * 0.28, span * 4);
      dirtyRef.current = true;
    };
    canvas.addEventListener("wheel", wheel, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("wheel", wheel);
    };
  }, [faces, geo]);

  const applyPreset = (next: Preset) => {
    const cam = camRef.current;
    const { box } = geo;
    if (next === "tv") camRef.current = defaultCamera(geo);
    if (next === "top")
      camRef.current = { ...cam, pitch: 1.44, yaw: -Math.PI / 2, target: [box.cx, box.cy, box.cz] };
    if (next === "low")
      camRef.current = { ...cam, pitch: 0.22, yaw: -2.2, target: [box.cx, box.cy, box.cz] };
    if (next === "follow")
      camRef.current = { ...cam, pitch: 0.5, yaw: -2.1, dist: Math.max(560, box.span * 0.34) };
    fitRef.current = next !== "follow";
    setPreset(next);
    dirtyRef.current = true;
  };

  const reset = () => {
    camRef.current = defaultCamera(geo);
    fitRef.current = true;
    setPreset("tv");
    dirtyRef.current = true;
  };

  const hitTest = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let best: Hit | null = null;
    let bestDist = 24;
    for (const hit of hitsRef.current) {
      const d = Math.hypot(hit.x - x, hit.y - y);
      if (d < bestDist) {
        best = hit;
        bestDist = d;
      }
    }
    return best;
  };

  const zoomBy = (factor: number) => {
    const span = Math.max(geo.box.span, 300);
    camRef.current.dist = clamp(camRef.current.dist * factor, span * 0.28, span * 4);
    dirtyRef.current = true;
  };

  const pinchGap = () => {
    const [a, b] = [...pointersRef.current.values()];
    return a && b ? Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) : 0;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
    if (pointersRef.current.size === 2) {
      // segundo dedo: troca o arrasto por zoom com dois dedos
      pinchRef.current = { gap: pinchGap(), dist: camRef.current.dist };
      dragRef.current = null;
      return;
    }
    dragRef.current = { x: event.clientX, y: event.clientY, yaw: camRef.current.yaw, pitch: camRef.current.pitch, moved: 0 };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    const pinch = pinchRef.current;
    if (pinch && pointersRef.current.size >= 2) {
      const span = Math.max(geo.box.span, 300);
      const gap = pinchGap();
      camRef.current.dist = clamp(pinch.dist * (pinch.gap / gap), span * 0.28, span * 4);
      dirtyRef.current = true;
      return;
    }
    const drag = dragRef.current;
    if (drag) {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
      camRef.current.yaw = drag.yaw + dx * 0.006;
      camRef.current.pitch = clamp(drag.pitch - dy * 0.005, 0.06, 1.46);
      if (preset === "follow") setPreset("tv");
      dirtyRef.current = true;
      return;
    }
    const best = hitTest(event);
    const next = best?.code ?? null;
    event.currentTarget.style.cursor = next ? "pointer" : "grab";
    if (next !== hoverRef.current) {
      hoverRef.current = next;
      dirtyRef.current = true;
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.moved > 5 || !onFocus) return;
    const best = hitTest(event);
    if (best) onFocus(best.code === focus ? null : best.code);
    else onFocus(null);
  };

  return (
    <div className={`map3d${compact ? " is-compact" : ""}${className ? ` ${className}` : ""}`}>
      <canvas
        ref={canvasRef}
        className="map3d-canvas"
        style={height ? { height } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => {
          dragRef.current = null;
          pinchRef.current = null;
          pointersRef.current.clear();
          if (hoverRef.current) {
            hoverRef.current = null;
            dirtyRef.current = true;
          }
        }}
        onDoubleClick={reset}
        aria-label={t("Mapa 3D do traçado real do circuito")}
        role="img"
      />

      <div className="map3d-tools">
        <button className={`map3d-tool${preset === "tv" ? " is-on" : ""}`} onClick={() => applyPreset("tv")} title={t("Câmera de transmissão")}>
          <Video size={13} />
          <span>TV</span>
        </button>
        <button className={`map3d-tool${preset === "top" ? " is-on" : ""}`} onClick={() => applyPreset("top")} title={t("Vista de cima")}>
          <Maximize2 size={13} />
          <span>{t("Topo")}</span>
        </button>
        <button className={`map3d-tool${preset === "low" ? " is-on" : ""}`} onClick={() => applyPreset("low")} title={t("Rasante")}>
          <Layers size={13} />
          <span>{t("Rasante")}</span>
        </button>
        <button className={`map3d-tool${preset === "follow" ? " is-on" : ""}`} onClick={() => applyPreset("follow")} title={t("Seguir o líder")}>
          <Target size={13} />
          <span>{t("Líder")}</span>
        </button>
        <button
          className={`map3d-tool${relief > 1 ? " is-on" : ""}`}
          onClick={() => {
            setRelief((r) => (r > 1 ? 1 : 1.4));
            dirtyRef.current = true;
          }}
          title={t("Escala do relevo")}
        >
          <Mountain size={13} />
          <span>{relief > 1 ? "1,4×" : "1×"}</span>
        </button>
        <button
          className={`map3d-tool${labels ? " is-on" : ""}`}
          onClick={() => {
            setLabels((l) => !l);
            dirtyRef.current = true;
          }}
          title={t("Etiquetas dos pilotos")}
        >
          <span>ABC</span>
        </button>
        <button className="map3d-tool" onClick={reset} title={t("Recentralizar")}>
          <RotateCcw size={13} />
        </button>
      </div>

      <div className="map3d-zoom">
        <button
          type="button"
          onClick={() => zoomBy(0.72)}
          aria-label={t("Aproximar")}
          title={t("Aproximar")}
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1 / 0.72)}
          aria-label={t("Afastar")}
          title={t("Afastar")}
        >
          −
        </button>
      </div>

      <div className="map3d-legend">
        {cars.length > 0 && (
          <span className="map3d-legend-item">
            <i className="map3d-swatch" /> {t("líder")}
          </span>
        )}
        <span className="map3d-legend-item">
          <i className="map3d-swatch map3d-swatch-kerb" /> {t("zebra")}
        </span>
        {geo.elevationM > 1 && (
          <span className="map3d-legend-item">
            <Mountain size={11} /> {t("relevo real {n} m", { n: Math.round(geo.elevationM) })}
          </span>
        )}
        {!compact && (
          <span className="map3d-legend-hint">{t("gaps reais · arraste para girar · pinça para zoom")}</span>
        )}
      </div>
    </div>
  );
}
