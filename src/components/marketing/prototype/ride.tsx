"use client";

/*
 * PROTOTYPE (throwaway): the scroll capsule's track from the fair down the tour.
 *
 * from "tunnel": the capsule waits inside the dome door and slides out as the
 *   page scrolls.
 * from "ring": the track leaves the monorail ring at a subway-map junction dot;
 *   after the ring car runs on to the junction (HANDOFF_PX of scroll), the
 *   capsule takes over there, growing from map scale to full size on the way
 *   down.
 *
 * The track is a centre path with right-angle turns (down, left along the top
 * of the tour, down the rail) sampled every few px; the four lines are offsets
 * of it, so the gap is the same everywhere. The capsule's place comes from a
 * "virtual y" (y plus a share of horizontal travel) that only increases along
 * the path, so the left run takes some scroll and the capsule ends at mid-screen.
 */

import { useEffect, useRef, useState } from "react";
import { DOOR, HANDOFF_PX, JUNCTION, VIEW } from "./guide-map";
import proto from "./prototype.module.css";

const COLORS = ["var(--rust)", "var(--amber)", "var(--sage)", "var(--cyan)"];
const PITCH = 8;
const RADIUS = 52;
const STEP = 3;
const EMERGE_PX = 420;
const RUN_SHARE = 0.2;

type Sample = { x: number; y: number; a: number; v: number };
type Geo = { w: number; h: number; clipY: number; lines: string[]; dot: { x: number; y: number } | null };

export function Ride({ from }: { from: "tunnel" | "ring" }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const carRef = useRef<SVGGElement>(null);
  const bodyRef = useRef<SVGRectElement>(null);
  const windowRef = useRef<SVGRectElement>(null);
  const samples = useRef<Sample[]>([]);
  const info = useRef({ startV: 0, runV: 0, growTo: 0, startY: 0, mapScale: 1 });
  const [geo, setGeo] = useState<Geo | null>(null);

  useEffect(() => {
    const page = svgRef.current?.closest<HTMLElement>("[data-proto-page]");
    if (!page) return;

    const measure = () => {
      const map = page.querySelector("[data-proto-map] svg");
      const rail = page.querySelector("[data-proto-rail]");
      const tour = page.querySelector("[data-proto-tour]");
      if (!map || !rail || !tour) return;

      const base = page.getBoundingClientRect();
      const m = map.getBoundingClientRect();
      const r = rail.getBoundingClientRect();
      const t = tour.getBoundingClientRect();
      const toPage = (vx: number, vy: number) => ({
        x: m.left - base.left + ((vx - VIEW.x) / VIEW.w) * m.width,
        y: m.top - base.top + ((vy - VIEW.y) / VIEW.h) * m.height,
      });

      const anchor = from === "tunnel" ? toPage(DOOR.x, DOOR.y) : toPage(JUNCTION.x, JUNCTION.y);
      const x0 = anchor.x;
      const y0 = from === "tunnel" ? anchor.y - 50 : anchor.y;
      const rx = r.left - base.left + r.width / 2;
      const yT = Math.max(t.top - base.top + PITCH * 1.5 + 2, anchor.y + RADIUS + 20);
      const end = t.bottom - base.top - 40;
      const R = RADIUS;

      const d = [
        `M${x0},${y0}`,
        `L${x0},${yT - R}`,
        `A${R},${R} 0 0 1 ${x0 - R},${yT}`,
        `L${rx + R},${yT}`,
        `A${R},${R} 0 0 0 ${rx},${yT + R}`,
        `L${rx},${end}`,
      ].join(" ");

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      svgRef.current!.appendChild(path);
      const total = path.getTotalLength();
      const pts: Sample[] = [];
      let run = 0;
      let prevX = x0;
      for (let l = 0; l <= total; l += STEP) {
        const p = path.getPointAtLength(l);
        const q = path.getPointAtLength(Math.min(total, l + 1));
        const o = path.getPointAtLength(Math.max(0, l - 1));
        run += Math.abs(p.x - prevX);
        prevX = p.x;
        pts.push({ x: p.x, y: p.y, a: Math.atan2(q.y - o.y, q.x - o.x), v: p.y + run * RUN_SHARE });
      }
      path.remove();
      samples.current = pts;
      info.current = {
        startV: from === "tunnel" ? anchor.y - 40 : anchor.y,
        runV: run * RUN_SHARE,
        growTo: yT - R,
        startY: y0,
        mapScale: m.width / VIEW.w,
      };

      const lines = COLORS.map((_, i) => {
        // Rust leftmost going down, so it's outermost at the tour's top-left corner.
        const off = PITCH * (i - 1.5);
        return (
          "M" +
          pts
            .map((s) => {
              const nx = Math.sin(s.a);
              const ny = -Math.cos(s.a);
              return `${(s.x + nx * off).toFixed(1)},${(s.y + ny * off).toFixed(1)}`;
            })
            .join("L")
        );
      });

      setGeo({
        w: base.width,
        h: base.height,
        clipY: anchor.y,
        lines,
        dot: from === "ring" ? anchor : null,
      });
      requestAnimationFrame(place);
    };

    const place = () => {
      const pts = samples.current;
      const car = carRef.current;
      if (!pts.length || !car) return;
      const { startV, runV, growTo, startY, mapScale } = info.current;
      const narrow = window.innerWidth <= 560;
      const cw = narrow ? 30 : 36;
      const ch = narrow ? 50 : 60;

      let s = window.scrollY;
      if (from === "ring") {
        car.setAttribute("visibility", s < HANDOFF_PX ? "hidden" : "visible");
        s = Math.max(0, s - HANDOFF_PX);
      }
      const vh = window.innerHeight;
      const k = Math.min(1, s / EMERGE_PX);
      const finalV = vh * 0.5 + runV;
      const target = s + startV + (finalV - startV) * k;

      let lo = 0;
      let hi = pts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (pts[mid].v < target) lo = mid + 1;
        else hi = mid;
      }
      const p = pts[lo];
      const deg = (p.a * 180) / Math.PI - 90;
      car.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${deg.toFixed(1)})`);

      // Ring: grow from the map car's size to full size by the first turn.
      const g = from === "ring" ? Math.min(1, Math.max(0, (p.y - startY) / (growTo - startY))) : 1;
      const w = 14 * mapScale + (cw - 14 * mapScale) * g;
      const h = 40 * mapScale + (ch - 40 * mapScale) * g;
      const body = bodyRef.current!;
      body.setAttribute("x", `${-w / 2}`);
      body.setAttribute("y", `${-h / 2}`);
      body.setAttribute("width", `${w}`);
      body.setAttribute("height", `${h}`);
      body.setAttribute("rx", `${w / 2}`);
      const win = windowRef.current!;
      const ww = w * 0.44;
      const wh = h * 0.34;
      win.setAttribute("x", `${-ww / 2}`);
      win.setAttribute("y", `${h / 2 - h * 0.2 - wh}`);
      win.setAttribute("width", `${ww}`);
      win.setAttribute("height", `${wh}`);
      win.setAttribute("rx", `${Math.min(7, ww / 2)}`);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(page);
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", measure);
    };
  }, [from]);

  return (
    <svg ref={svgRef} className={proto.ride} width={geo?.w ?? 0} height={geo?.h ?? 0} aria-hidden>
      {geo && (
        <>
          <defs>
            <clipPath id="ride-out">
              <rect x={0} y={geo.clipY} width={geo.w} height={geo.h} />
            </clipPath>
          </defs>
          <g clipPath="url(#ride-out)">
            <g fill="none" strokeWidth={4} strokeLinejoin="round">
              {geo.lines.map((d, i) => (
                <path key={COLORS[i]} d={d} stroke={COLORS[i]} />
              ))}
            </g>
          </g>
          {geo.dot && (
            <circle
              cx={geo.dot.x}
              cy={geo.dot.y}
              r={17}
              fill="var(--paper)"
              stroke="var(--sky-deep)"
              strokeWidth={5}
            />
          )}
          <g clipPath={geo.dot ? undefined : "url(#ride-out)"}>
            <g ref={carRef}>
              <g style={{ filter: "drop-shadow(0 8px 10px rgb(0 0 0 / 0.5))" }}>
                <rect ref={bodyRef} fill="var(--paper)" />
                <rect ref={windowRef} fill="var(--sky)" />
              </g>
            </g>
          </g>
        </>
      )}
    </svg>
  );
}
