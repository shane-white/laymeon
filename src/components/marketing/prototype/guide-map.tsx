"use client";

import { useEffect, useRef } from "react";
import styles from "../landing.module.css";

/*
 * PROTOTYPE (throwaway): a copy of ../guide-map.tsx for /prototype/landing.
 * Do not import from production code.
 *
 * Rings are parallel offset curves, so the gap is the same all the way round.
 * layout: "ring" = monorail loop around the dome; when the page scrolls the
 *         car runs on to the junction at the front of the ring and hands off
 *         to the scroll capsule (see ride.tsx).
 *         "tunnel" = a colored line to each pavilion and a door in the dome
 *         where the scroll capsule waits.
 */

export type MapLayout = "ring" | "tunnel";

export const VIEW = { x: 0, y: 40, w: 800, h: 540 };
/** The dome door's threshold, in viewBox units. */
export const DOOR = { x: 400, y: 401, w: 50, h: 46 };
/** Scroll distance over which the ring car runs on to the junction. */
export const HANDOFF_PX = 160;
const CX = 400;
const CY = 350;
const TRACK_Z = 26;
const TRACK_COLORS = ["var(--rust)", "var(--amber)", "var(--sage)", "var(--cyan)"];
const CAR_RADIUS = 172;
const LOOP_SECONDS = 22;
const PITCH = 8;
/** Where the tour track leaves the ring: the front of the car's ellipse, in viewBox units. */
export const JUNCTION = { x: CX, y: CY - TRACK_Z + CAR_RADIUS * 0.7071 };

type Pt = readonly [number, number];

function iso(x: number, y: number, z = 0): Pt {
  return [CX + (x - y) * 0.866, CY + (x + y) * 0.5 - z];
}

function poly(...p: Pt[]) {
  return p.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" ");
}

/** A ground circle of radius r projects to an ellipse with these radii. */
function ellipseRadii(r: number) {
  return { rx: r * 1.2247, ry: r * 0.7071 };
}

function Prism(props: {
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  z?: number;
  top: string;
  left: string;
  right: string;
}) {
  const { x, y, w, d, h, z = 0, top, left, right } = props;
  const x1 = x + w;
  const y1 = y + d;
  return (
    <g>
      <polygon
        points={poly(iso(x, y1, z), iso(x1, y1, z), iso(x1, y1, z + h), iso(x, y1, z + h))}
        fill={left}
      />
      <polygon
        points={poly(iso(x1, y, z), iso(x1, y1, z), iso(x1, y1, z + h), iso(x1, y, z + h))}
        fill={right}
      />
      <polygon
        points={poly(iso(x, y, z + h), iso(x1, y, z + h), iso(x1, y1, z + h), iso(x, y1, z + h))}
        fill={top}
      />
    </g>
  );
}

function Cylinder(props: {
  gx: number;
  gy: number;
  r: number;
  h: number;
  body: string;
  shade: string;
  top: string;
  id: string;
  bands?: { at: number; color: string }[];
}) {
  const { gx, gy, r, h, body, shade, top, id, bands = [] } = props;
  const [cx, by] = iso(gx, gy, 0);
  const ty = by - h;
  const { rx, ry } = ellipseRadii(r);
  const d = `M${cx - rx},${ty} L${cx - rx},${by} A${rx},${ry} 0 0 0 ${cx + rx},${by} L${cx + rx},${ty} Z`;
  return (
    <g>
      <clipPath id={id}>
        <path d={d} />
      </clipPath>
      <path d={d} fill={body} />
      <rect x={cx + rx * 0.15} y={ty - 1} width={rx} height={h + ry + 2} fill={shade} clipPath={`url(#${id})`} />
      {bands.map((b) => (
        <path
          key={b.at}
          d={`M${cx - rx},${by - b.at} A${rx},${ry} 0 0 0 ${cx + rx},${by - b.at}`}
          fill="none"
          stroke={b.color}
          strokeWidth={5}
          clipPath={`url(#${id})`}
        />
      ))}
      <ellipse cx={cx} cy={ty} rx={rx} ry={ry} fill={top} />
    </g>
  );
}

/** Career Story: a striped dome on a drum banded in the four line colors. */
function Dome() {
  const r = 72;
  const drumH = 30;
  const [cx, by] = iso(0, 0, 0);
  const ty = by - drumH;
  const { rx, ry } = ellipseRadii(r);
  const domePath = `M${cx - rx},${ty} A${rx},${rx} 0 0 1 ${cx + rx},${ty} A${rx},${ry} 0 0 1 ${cx - rx},${ty} Z`;
  const drumPath = `M${cx - rx},${ty} L${cx - rx},${by} A${rx},${ry} 0 0 0 ${cx + rx},${by} L${cx + rx},${ty} Z`;
  return (
    <g>
      <clipPath id="dome-drum">
        <path d={drumPath} />
      </clipPath>
      <clipPath id="dome-shell">
        <path d={domePath} />
      </clipPath>
      <path d={drumPath} fill="var(--sky-deep)" />
      {TRACK_COLORS.map((c, i) => (
        <path
          key={c}
          d={`M${cx - rx},${by - 4 - i * 7} A${rx},${ry} 0 0 0 ${cx + rx},${by - 4 - i * 7}`}
          fill="none"
          stroke={c}
          strokeWidth={4}
          clipPath="url(#dome-drum)"
        />
      ))}
      <path d={domePath} fill="var(--paper)" />
      <rect x={cx + rx * 0.12} y={ty - rx - 2} width={rx} height={rx + ry + 4} fill="#CFC4AF" clipPath="url(#dome-shell)" />
      {[0.24, 0.48, 0.7].map((k) => {
        const hgt = k * rx;
        const lx = Math.sqrt(rx * rx - hgt * hgt);
        const ly = lx * (ry / rx);
        return (
          <path
            key={k}
            d={`M${cx - lx},${ty - hgt} A${lx},${ly} 0 0 0 ${cx + lx},${ty - hgt}`}
            fill="none"
            stroke="var(--sky)"
            strokeWidth={3.5}
          />
        );
      })}
      <line x1={cx} y1={ty - rx} x2={cx} y2={ty - rx - 26} stroke="var(--paper)" strokeWidth={3} strokeLinecap="round" />
      <circle cx={cx} cy={ty - rx - 30} r={5} fill="var(--amber)" />
    </g>
  );
}

/** Match Report: a pyramid, two faces in flat orange tones. */
function Pyramid({ gx, gy, half, h }: { gx: number; gy: number; half: number; h: number }) {
  const apex = iso(gx, gy, h);
  const b = iso(gx + half, gy - half);
  const c = iso(gx + half, gy + half);
  const d = iso(gx - half, gy + half);
  return (
    <g>
      <polygon points={poly(d, c, apex)} fill="var(--rust)" />
      <polygon points={poly(c, b, apex)} fill="#82362B" />
      <line x1={apex[0]} y1={apex[1]} x2={c[0]} y2={c[1]} stroke="#C9705F" strokeWidth={2} />
    </g>
  );
}

/** Interview Prep: a sphere raised on a slim tower. */
function Tower({ gx, gy }: { gx: number; gy: number }) {
  const [cx, by] = iso(gx, gy, 0);
  const towerTop = by - 128;
  const sr = 36;
  const sy = towerTop - sr + 8;
  return (
    <g>
      <clipPath id="prep-sphere">
        <circle cx={cx} cy={sy} r={sr} />
      </clipPath>
      <polygon
        points={poly([cx - 14, by], [cx + 14, by], [cx + 5, towerTop], [cx - 5, towerTop])}
        fill="#CFC4AF"
      />
      <polygon points={poly([cx, by + 4], [cx + 14, by], [cx + 5, towerTop], [cx, towerTop])} fill="#A89D88" />
      <circle cx={cx} cy={sy} r={sr} fill="var(--amber)" />
      <rect x={cx + sr * 0.15} y={sy - sr} width={sr} height={sr * 2} fill="#B67F1F" clipPath="url(#prep-sphere)" />
      {[-12, 0, 12].map((o) => (
        <line key={o} x1={cx - sr} y1={sy + o} x2={cx + sr} y2={sy + o} stroke="var(--sky)" strokeWidth={3} clipPath="url(#prep-sphere)" />
      ))}
    </g>
  );
}

/** Half an ellipse pushed out along its normal by d screen units: same gap all the way round. */
function offsetArc(d: number, half: "back" | "front") {
  const { rx, ry } = ellipseRadii(CAR_RADIUS);
  const cy = CY - TRACK_Z;
  const t0 = half === "back" ? Math.PI : 0;
  const n = 96;
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + (Math.PI * i) / n;
    const nx = ry * Math.cos(t);
    const ny = rx * Math.sin(t);
    const len = Math.hypot(nx, ny);
    const x = CX + rx * Math.cos(t) + (d * nx) / len;
    const y = cy + ry * Math.sin(t) + (d * ny) / len;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return `M${pts.join("L")}`;
}

function Track({ half }: { half: "back" | "front" }) {
  return (
    <g fill="none" strokeWidth={5} strokeLinecap="round">
      {TRACK_COLORS.map((c, i) => (
        <path key={c} d={offsetArc(PITCH * (1.5 - i), half)} stroke={c} />
      ))}
    </g>
  );
}

/** A colored line from the dome to one pavilion, on a dark walk bed. */
function Spoke({ gx, gy, color }: { gx: number; gy: number; color: string }) {
  const [x1, y1] = iso(0, 0);
  const [x2, y2] = iso(gx, gy);
  return (
    <g strokeLinecap="round">
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1C2742" strokeWidth={16} />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={5} />
    </g>
  );
}

/*
 * Shuttles: one small capsule per pavilion line, running dome -> pavilion ->
 * dome on a staggered loop. Drawn under the dome and pavilions so they vanish
 * into them at each end. Distances are along the ground from the dome centre.
 */
const SHUTTLES = [
  { gx: -1, gy: 0, from: 48, to: 200, offset: 0 },
  { gx: 0, gy: -1, from: 48, to: 214, offset: 0.27 },
  { gx: 1, gy: 0, from: 66, to: 232, offset: 0.55 },
  { gx: 0, gy: 1, from: 66, to: 218, offset: 0.8 },
] as const;
const SHUTTLE_SECONDS = 12;

/** Share of the cycle spent at each step: out, at the pavilion, back, in the dome. */
function shuttleDistance(phase: number, from: number, to: number) {
  const ease = (k: number) => k * k * (3 - 2 * k);
  const OUT = 0.24;
  const STAY = 0.16;
  const BACK = 0.24;
  if (phase < OUT) return from + (to - from) * ease(phase / OUT);
  if (phase < OUT + STAY) return to;
  if (phase < OUT + STAY + BACK) return to - (to - from) * ease((phase - OUT - STAY) / BACK);
  return from;
}

const Shuttle = ({ innerRef }: { innerRef: (el: SVGGElement | null) => void }) => (
  <g ref={innerRef} visibility="hidden">
    <rect x={-12} y={-5} width={24} height={9} rx={4.5} fill="var(--paper)" />
    <rect x={-7} y={-3} width={14} height={3} rx={1.5} fill="var(--sky)" />
  </g>
);

/** The tunnel mouth in the front of the drum, where the capsule waits. */
function Door() {
  const { x, y, w, h } = DOOR;
  const r = w / 2;
  const d = `M${x - r},${y} L${x - r},${y - h + r} A${r},${r} 0 0 1 ${x + r},${y - h + r} L${x + r},${y} Z`;
  return (
    <g>
      <path d={d} fill="var(--sky-deep)" stroke="var(--paper)" strokeWidth={3} strokeLinejoin="round" />
      <path
        d={`M${x - r + 7},${y} L${x - r + 7},${y - h + r} A${r - 7},${r - 7} 0 0 1 ${x + r - 7},${y - h + r} L${x + r - 7},${y}`}
        fill="none"
        stroke="#1C2742"
        strokeWidth={3}
      />
      <circle cx={x} cy={y - h - 8} r={4} fill="var(--amber)" />
    </g>
  );
}

function Pylons({ half }: { half: "back" | "front" }) {
  const angles = [0, 45, 90, 135, 180, 225, 270, 315].filter((a) =>
    half === "back" ? a > 180 : a > 0 && a < 180,
  );
  const { rx, ry } = ellipseRadii(CAR_RADIUS);
  return (
    <g stroke="#2F3B5C" strokeWidth={4}>
      {angles.map((a) => {
        const t = (a * Math.PI) / 180;
        const x = CX + rx * Math.cos(t);
        const y = CY + ry * Math.sin(t);
        return <line key={a} x1={x} y1={y} x2={x} y2={y - TRACK_Z + 6} />;
      })}
    </g>
  );
}

const Car = ({ innerRef }: { innerRef: React.Ref<SVGGElement> }) => (
  <g ref={innerRef}>
    <rect x={-20} y={-8} width={40} height={14} rx={7} fill="var(--paper)" />
    <rect x={-13} y={-5} width={26} height={5} rx={2.5} fill="var(--sky)" />
  </g>
);

const LABELS = [
  { name: "Documents", x: 179, y: 392, color: "var(--sage)" },
  { name: "Match Report", x: 150, y: 98, color: "var(--rust)" },
  { name: "Career Story", x: 400, y: 168, color: "var(--paper)" },
  { name: "Tailoring", x: 660, y: 70, color: "var(--cyan)" },
  { name: "Interview Prep", x: 640, y: 258, color: "var(--amber)" },
];

export function GuideMap({ layout }: { layout: MapLayout }) {
  const backCar = useRef<SVGGElement>(null);
  const frontCar = useRef<SVGGElement>(null);

  useEffect(() => {
    if (layout === "tunnel") return;
    const { rx, ry } = ellipseRadii(CAR_RADIUS);
    const cy = CY - TRACK_Z;
    const place = (t: number, shown = true) => {
      const x = CX + rx * Math.cos(t);
      const y = cy + ry * Math.sin(t) - 5;
      const angle = (Math.atan2(ry * Math.cos(t), -rx * Math.sin(t)) * 180) / Math.PI + 180;
      const onBack = Math.sin(t) < 0;
      const transform = `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle.toFixed(1)})`;
      backCar.current?.setAttribute("transform", transform);
      frontCar.current?.setAttribute("transform", transform);
      backCar.current?.setAttribute("visibility", shown && onBack ? "visible" : "hidden");
      frontCar.current?.setAttribute("visibility", shown && !onBack ? "visible" : "hidden");
    };

    const start = (130 * Math.PI) / 180;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      place(start);
      return;
    }

    // Loops while the page is at the top. Once it scrolls, the car runs on to
    // the junction (angle pi/2) over HANDOFF_PX and disappears there.
    let frame = 0;
    let last = performance.now();
    let t = start;
    let latched = start;
    const tau = Math.PI * 2;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const s = window.scrollY;
      if (s <= 0) {
        t += (dt / LOOP_SECONDS) * tau;
        latched = t;
        place(t);
      } else {
        const toJunction = (((Math.PI / 2 - latched) % tau) + tau) % tau;
        const k = Math.min(1, s / HANDOFF_PX);
        t = latched + toJunction * k;
        place(t, k < 1);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [layout]);

  const shuttles = useRef<(SVGGElement | null)[]>([]);

  useEffect(() => {
    if (layout !== "tunnel") return;
    const place = (seconds: number) => {
      SHUTTLES.forEach((sh, i) => {
        const el = shuttles.current[i];
        if (!el) return;
        const phase = (seconds / SHUTTLE_SECONDS + sh.offset) % 1;
        const dist = shuttleDistance(phase, sh.from, sh.to);
        const [x, y] = iso(sh.gx * dist, sh.gy * dist);
        const [ax, ay] = iso(sh.gx, sh.gy);
        const [ox, oy] = iso(0, 0);
        const angle = (Math.atan2(ay - oy, ax - ox) * 180) / Math.PI;
        el.setAttribute("transform", `translate(${x.toFixed(1)} ${(y - 3).toFixed(1)}) rotate(${angle.toFixed(1)})`);
        el.setAttribute("visibility", "visible");
      });
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      place(SHUTTLE_SECONDS * 0.3);
      return;
    }
    let frame = 0;
    const began = performance.now();
    const tick = (now: number) => {
      place((now - began) / 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [layout]);

  const plaza = ellipseRadii(300);
  const ring = ellipseRadii(236);
  const walk = (gx: number, gy: number) => {
    const [x1, y1] = iso(0, 0);
    const [x2, y2] = iso(gx, gy);
    return <line x1={x1} y1={y1} x2={x2} y2={y2} />;
  };

  return (
    <figure className={styles.map} data-proto-map>
      <svg
        viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
        role="img"
        aria-labelledby="map-title"
      >
        <title id="map-title">
          A guide map of the LayMeOn fair: Documents, Match Report, Tailoring and Interview Prep
          pavilions on a monorail loop around the Career Story dome.
        </title>
        <ellipse cx={CX} cy={CY} rx={plaza.rx} ry={plaza.ry} fill="var(--plaza)" />
        <ellipse cx={CX} cy={CY} rx={ring.rx} ry={ring.ry} fill="none" stroke="var(--line)" strokeWidth={2} strokeDasharray="2 10" strokeLinecap="round" />
        {layout === "ring" ? (
          <g stroke="#1C2742" strokeWidth={10} strokeLinecap="round">
            {walk(0, 255)}
            {walk(-255, 0)}
            {walk(0, -255)}
            {walk(255, 0)}
          </g>
        ) : (
          <g>
            <Spoke gx={-255} gy={0} color="var(--rust)" />
            <Spoke gx={0} gy={-255} color="var(--cyan)" />
            <Spoke gx={255} gy={0} color="var(--amber)" />
            <Spoke gx={0} gy={255} color="var(--sage)" />
            {SHUTTLES.map((sh, i) => (
              <Shuttle
                key={`${sh.gx},${sh.gy}`}
                innerRef={(el) => {
                  shuttles.current[i] = el;
                }}
              />
            ))}
          </g>
        )}

        <Pyramid gx={-255} gy={0} half={58} h={104} />
        <Cylinder
          id="tailoring-body"
          gx={0}
          gy={-255}
          r={42}
          h={112}
          body="var(--cyan)"
          shade="#467884"
          top="#93C2CC"
          bands={[
            { at: 34, color: "var(--amber)" },
            { at: 48, color: "var(--amber)" },
          ]}
        />

        {layout === "ring" ? (
          <>
            <Pylons half="back" />
            <Track half="back" />
            <Car innerRef={backCar} />
            <Dome />
            <Pylons half="front" />
            <Track half="front" />
            <Car innerRef={frontCar} />
          </>
        ) : (
          <>
            <Dome />
            <Door />
          </>
        )}

        <g>
          <Prism x={-45} y={220} w={90} d={70} h={16} top="#9CC296" left="var(--sage)" right="#557C51" />
          <Prism x={-51} y={216} w={90} d={70} h={16} z={18} top="#9CC296" left="var(--sage)" right="#557C51" />
          <Prism x={-41} y={222} w={90} d={70} h={16} z={36} top="var(--paper)" left="#CFC4AF" right="#A89D88" />
        </g>
        <Tower gx={255} gy={0} />
      </svg>

      {LABELS.map((l) => (
        <span
          key={l.name}
          aria-hidden
          className={styles.mapSign}
          style={{
            left: `${((l.x - VIEW.x) / VIEW.w) * 100}%`,
            top: `${((l.y - VIEW.y) / VIEW.h) * 100}%`,
          }}
        >
          <span className={styles.mapSignDot} style={{ background: l.color }} aria-hidden />
          {l.name}
        </span>
      ))}
    </figure>
  );
}
