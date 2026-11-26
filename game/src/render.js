// render.js — a hand-rolled 3D renderer on a 2D canvas: project the
// island, the runway and the rings, paint far to near, then put the
// Kestrel in frame (chase view) or the pilot in the cockpit (cockpit view).

import { groundHeight, RUNWAY, RINGS, CLOUDS } from './world.js';

export function createCamera() {
  return { x: 0, y: 60, z: 700, heading: Math.PI, pitch: -0.08, view: 'chase' };
}

/** Advance the camera toward its station behind (or inside) the plane. */
export function followPlane(cam, p, dt) {
  const fx = Math.sin(p.heading), fz = -Math.cos(p.heading);
  if (cam.view === 'cockpit') {
    cam.x = p.x + fx * 1.2;
    cam.y = p.y + 1.7;
    cam.z = p.z + fz * 1.2;
    cam.heading = p.heading;
    cam.pitch = p.pitch * 0.8;
    cam.roll = p.roll;
    return;
  }
  const tx = p.x - fx * 30, tz = p.z - fz * 30, ty = p.y + 10;
  const k = Math.min(1, dt * 4.5);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  cam.z += (tz - cam.z) * k;
  cam.heading = p.heading;
  cam.pitch = -0.06 + p.pitch * 0.35;
  cam.roll = p.roll * 0.45;
}

/** Terrain colour by height: sand, grass, forest, rock, a dusting of snow. */
function terrainColor(h, x, z) {
  if (h <= 0.5) return '#c9b078';
  if (h < 9) return '#cdbb82';
  if (h < 60) return '#69a357';
  if (h < 130) return '#4c8a4f';
  if (h < 210) return '#6d7f6a';
  if (h < 285) return '#8a8578';
  return '#e8e6df';
}

export function drawScene(ctx, w, hgt, cam, p, t) {
  drawSky(ctx, w, hgt, cam);
  const proj = makeProjector(w, hgt, cam);
  drawSea(ctx, w, hgt, proj);
  drawTerrain(ctx, proj, cam);
  drawRunway(ctx, proj);
  drawClouds(ctx, proj, t);
  for (let i = RINGS.length - 1; i >= 0; i--) drawRing(ctx, proj, RINGS[i], i, p.ringsFlown, t);
  drawPlaneShadow(ctx, proj, p);
  if (cam.view === 'chase') drawPlaneSprite(ctx, w, hgt, p, t);
  else drawCockpitFrame(ctx, w, hgt);
}

/** View basis + perspective projection for one frame. */
function makeProjector(w, hgt, cam) {
  const f = (hgt / 2) / Math.tan(0.42);
  const ch = Math.cos(cam.heading), sh = Math.sin(cam.heading);
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  // forward, right, up in world space (roll applied on screen afterwards)
  const fwd = { x: sh * cp, y: sp, z: -ch * cp };
  const right = { x: ch, y: 0, z: sh };
  const up = {
    x: right.y * fwd.z - right.z * fwd.y,
    y: right.z * fwd.x - right.x * fwd.z,
    z: right.x * fwd.y - right.y * fwd.x,
  };
  const cr = Math.cos(cam.roll ?? 0), sr = Math.sin(cam.roll ?? 0);
  return function project(x, y, z) {
    const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
    const cx = dx * right.x + dy * right.y + dz * right.z;
    let cy = dx * up.x + dy * up.y + dz * up.z;
    const cz = dx * fwd.x + dy * fwd.y + dz * fwd.z;
    if (cz < 2) return null;
    let sx = w / 2 + (cx * f) / cz;
    let sy = hgt / 2 - (cy * f) / cz;
    // camera roll rotates the picture around its centre
    const ox = sx - w / 2, oy = sy - hgt / 2;
    sx = w / 2 + ox * cr - oy * sr;
    sy = hgt / 2 + ox * sr + oy * cr;
    return { x: sx, y: sy, z: cz, scale: f / cz };
  };
}

function drawSky(ctx, w, hgt, cam) {
  const horizon = hgt / 2 + (cam.pitch * hgt * 1.4);
  const g = ctx.createLinearGradient(0, 0, 0, hgt);
  g.addColorStop(0, '#2d5a8f');
  g.addColorStop(Math.max(0, Math.min(1, horizon / hgt)) * 0.98, '#a8c8e8');
  g.addColorStop(Math.max(0, Math.min(1, horizon / hgt)) + 0.01, '#7fb0d8');
  g.addColorStop(1, '#5d8fc0');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, hgt);
  // the sun, high over the bay
  ctx.fillStyle = 'rgba(255, 240, 190, 0.95)';
  ctx.beginPath();
  ctx.arc(w * 0.78, hgt * 0.16, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 240, 190, 0.25)';
  ctx.beginPath();
  ctx.arc(w * 0.78, hgt * 0.16, 52, 0, Math.PI * 2);
  ctx.fill();
}

function drawSea(ctx, w, hgt, proj) {
  ctx.fillStyle = '#2e6da8';
  // Four far corners of a water plane at y=0.
  const pts = [[-6000, -6000], [6000, -6000], [6000, 6000], [-6000, 6000]]
    .map(([x, z]) => proj(x, 0, z));
  if (pts.every(Boolean)) {
    ctx.beginPath();
    pts.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
    ctx.closePath();
    ctx.fill();
    return;
  }
  // A corner sits behind the camera: fill from the sea horizon downward.
  const horizon = proj(0, 0, -6000) ?? proj(-6000, 0, 0) ?? proj(6000, 0, 0);
  const y0 = horizon ? Math.max(0, Math.min(hgt, horizon.y)) : hgt * 0.5;
  ctx.fillRect(0, y0, w, hgt - y0);
}

/** Terrain as distance-graded quad rings around the camera, far first. */
function drawTerrain(ctx, proj, cam) {
  const layers = [
    { cell: 340, reach: 4600 },
    { cell: 130, reach: 2100 },
    { cell: 46, reach: 780 },
  ];
  const quads = [];
  for (const { cell, reach } of layers) {
    const cx = Math.round(cam.x / cell) * cell, cz = Math.round(cam.z / cell) * cell;
    const n = Math.ceil(reach / cell);
    for (let i = -n; i < n; i++) {
      for (let j = -n; j < n; j++) {
        const x0 = cx + i * cell, z0 = cz + j * cell;
        const d = Math.hypot(x0 + cell / 2 - cam.x, z0 + cell / 2 - cam.z);
        if (d > reach + cell) continue;
        if (cell < 300 && d < 700 && cell !== 46) continue; // finer layer owns the near field
        if (cell < 100 && d < 0) continue;
        const hs = [groundHeight(x0, z0), groundHeight(x0 + cell, z0), groundHeight(x0 + cell, z0 + cell), groundHeight(x0, z0 + cell)];
        if (Math.max(...hs) <= 0.4) continue; // open water
        quads.push({ x0, z0, cell, hs, d });
      }
    }
  }
  quads.sort((a, b) => b.d - a.d);
  for (const q of quads) {
    const pts = [
      proj(q.x0, q.hs[0], q.z0),
      proj(q.x0 + q.cell, q.hs[1], q.z0),
      proj(q.x0 + q.cell, q.hs[2], q.z0 + q.cell),
      proj(q.x0, q.hs[3], q.z0 + q.cell),
    ];
    if (pts.some((pt) => pt === null)) continue;
    const avg = (q.hs[0] + q.hs[1] + q.hs[2] + q.hs[3]) / 4;
    ctx.beginPath();
    pts.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
    ctx.closePath();
    ctx.fillStyle = terrainColor(avg, q.x0, q.z0);
    ctx.fill();
  }
}

function drawRunway(ctx, proj) {
  const y = RUNWAY.y + 0.35;
  const x0 = RUNWAY.x - RUNWAY.width / 2, x1 = RUNWAY.x + RUNWAY.width / 2;
  const corners = [proj(x0, y, RUNWAY.zFrom), proj(x1, y, RUNWAY.zFrom), proj(x1, y, RUNWAY.zTo), proj(x0, y, RUNWAY.zTo)];
  if (corners.some((c) => !c)) return;
  ctx.beginPath();
  corners.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
  ctx.closePath();
  ctx.fillStyle = '#3c4148';
  ctx.fill();
  // centreline dashes and threshold bars
  ctx.strokeStyle = '#f2f2e8';
  ctx.lineWidth = Math.max(1.5, corners[0].scale * 1.2);
  ctx.setLineDash([18 * corners[0].scale * 0.14 + 6, 14]);
  const a = proj(RUNWAY.x, y, RUNWAY.zFrom), b = proj(RUNWAY.x, y, RUNWAY.zTo);
  if (a && b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  ctx.setLineDash([]);
  // edge lights
  ctx.fillStyle = '#ffd873';
  for (let z = RUNWAY.zFrom; z <= RUNWAY.zTo; z += 90) {
    for (const x of [x0 - 3, x1 + 3]) {
      const pt = proj(x, y + 0.5, z);
      if (pt) { ctx.beginPath(); ctx.arc(pt.x, pt.y, Math.max(1.2, pt.scale * 0.8), 0, Math.PI * 2); ctx.fill(); }
    }
  }
}

function drawRing(ctx, proj, ring, index, flown, t) {
  const isNext = index === flown;
  const isDone = index < flown;
  const pts = [];
  for (let i = 0; i <= 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    // the ring stands in a vertical plane facing its `face` yaw
    const lx = Math.cos(a) * ring.r, ly = Math.sin(a) * ring.r;
    const wx = ring.x + lx * Math.cos(ring.face);
    const wz = ring.z + lx * Math.sin(ring.face);
    pts.push(proj(wx, ring.y + ly, wz));
  }
  if (pts.some((pt) => !pt)) return;
  const pulse = isNext ? 1 + Math.sin(t * 4) * 0.12 : 1;
  ctx.beginPath();
  pts.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
  ctx.strokeStyle = isDone ? 'rgba(90, 200, 120, 0.5)' : isNext ? '#ffb62e' : 'rgba(140, 220, 235, 0.75)';
  ctx.lineWidth = Math.max(2, pts[0].scale * 2.6 * pulse);
  ctx.stroke();
  // a beacon above the next ring, so the course reads from far away
  if (isNext) {
    const top = proj(ring.x, ring.y + ring.r + 26 + Math.sin(t * 2.2) * 4, ring.z);
    if (top) {
      ctx.fillStyle = '#ffb62e';
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(top.x - 7, top.y - 13);
      ctx.lineTo(top.x + 7, top.y - 13);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawClouds(ctx, proj, t) {
  void t;
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  for (const c of CLOUDS) {
    const pt = proj(c.x, c.y, c.z);
    if (!pt || pt.z > 5200 || pt.z < 160) continue; // never let a cloud swallow the camera
    const s = c.s * pt.scale * 0.06;
    if (s < 3) continue;
    ctx.beginPath();
    ctx.ellipse(pt.x, pt.y, s * 1.7, s * 0.55, 0, 0, Math.PI * 2);
    ctx.ellipse(pt.x - s * 0.7, pt.y + s * 0.12, s, s * 0.42, 0, 0, Math.PI * 2);
    ctx.ellipse(pt.x + s * 0.75, pt.y + s * 0.1, s * 1.05, s * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlaneShadow(ctx, proj, p) {
  const g = Math.max(groundHeight(p.x, p.z), 0);
  const pt = proj(p.x, g + 0.6, p.z);
  if (!pt) return;
  const hgtAbove = Math.max(0, p.y - g);
  const s = Math.max(2, pt.scale * 9 * Math.max(0.25, 1 - hgtAbove / 260));
  ctx.fillStyle = `rgba(10, 20, 10, ${Math.max(0.08, 0.4 - hgtAbove / 700)})`;
  ctx.beginPath();
  ctx.ellipse(pt.x, pt.y, s * 1.5, s * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** The Kestrel from behind, as a chase pilot sees it: wings, fin, canopy. */
function drawPlaneSprite(ctx, w, hgt, p, t) {
  const cx = w / 2, cy = hgt * 0.62 + Math.sin(p.pitch) * -40;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(p.roll * 0.9);
  ctx.scale(1.15, 1.15);
  // main wing, slight dihedral, red tips
  ctx.fillStyle = '#e8dcc0';
  ctx.beginPath();
  ctx.moveTo(-88, 6); ctx.lineTo(-14, -3); ctx.lineTo(14, -3); ctx.lineTo(88, 6);
  ctx.lineTo(88, 13); ctx.lineTo(14, 5); ctx.lineTo(-14, 5); ctx.lineTo(-88, 13);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c8442c';
  ctx.fillRect(-88, 6, 13, 7);
  ctx.fillRect(75, 6, 13, 7);
  // horizontal stabilizer
  ctx.fillStyle = '#e8dcc0';
  ctx.beginPath();
  ctx.moveTo(-34, 14); ctx.lineTo(34, 14); ctx.lineTo(30, 20); ctx.lineTo(-30, 20); ctx.closePath(); ctx.fill();
  // fuselage (rear view) and vertical fin
  const body = ctx.createLinearGradient(0, -26, 0, 20);
  body.addColorStop(0, '#f3e9d2');
  body.addColorStop(1, '#b8a67e');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 2, 13, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c8442c';
  ctx.beginPath();
  ctx.moveTo(-3, -12); ctx.lineTo(0, -34); ctx.lineTo(4, -12); ctx.closePath(); ctx.fill();
  // canopy bulge on top
  ctx.fillStyle = '#274b63';
  ctx.beginPath();
  ctx.ellipse(0, -13, 7.5, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(180,220,240,0.75)';
  ctx.beginPath();
  ctx.ellipse(0, -15, 3.6, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  // nav lights and a strobe
  ctx.fillStyle = '#ff4040';
  ctx.beginPath(); ctx.arc(-88, 9, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#40ff70';
  ctx.beginPath(); ctx.arc(88, 9, 2.6, 0, Math.PI * 2); ctx.fill();
  if (Math.sin(t * 6) > 0.92) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(0, -34, 3.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/** Cockpit view: canopy struts and the nose over the panel. */
function drawCockpitFrame(ctx, w, hgt) {
  ctx.fillStyle = '#23272e';
  // dashboard block
  ctx.beginPath();
  ctx.moveTo(0, hgt);
  ctx.lineTo(0, hgt * 0.8);
  ctx.quadraticCurveTo(w * 0.5, hgt * 0.7, w, hgt * 0.8);
  ctx.lineTo(w, hgt);
  ctx.closePath();
  ctx.fill();
  // nose cowling hint
  ctx.fillStyle = '#c8442c';
  ctx.beginPath();
  ctx.moveTo(w * 0.42, hgt * 0.86);
  ctx.quadraticCurveTo(w * 0.5, hgt * 0.8, w * 0.58, hgt * 0.86);
  ctx.lineTo(w * 0.56, hgt * 0.92);
  ctx.lineTo(w * 0.44, hgt * 0.92);
  ctx.closePath();
  ctx.fill();
  // canopy struts
  ctx.strokeStyle = '#23272e';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(w * 0.06, hgt * 0.78);
  ctx.lineTo(w * 0.3, 0);
  ctx.moveTo(w * 0.94, hgt * 0.78);
  ctx.lineTo(w * 0.7, 0);
  ctx.stroke();
}
