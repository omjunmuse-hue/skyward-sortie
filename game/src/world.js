// world.js — the island of Kestrel Bay: a deterministic heightfield, one
// runway, and the six-ring sortie course. No randomness at run time: the
// terrain is a fixed sum of ridges, so every pilot flies the same island.

/** Deterministic 2D value noise from integer lattice hashes. */
function hash2(ix, iz) {
  let n = ix * 374761393 + iz * 668265263;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967295;
}

function smoothNoise(x, z, cell) {
  const ix = Math.floor(x / cell), iz = Math.floor(z / cell);
  const fx = x / cell - ix, fz = z / cell - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

/** The runway: a flat strip on the island's west coast, heading north. */
export const RUNWAY = {
  x: -780, // centre line
  zFrom: -460,
  zTo: 460,
  width: 46,
  y: 14,
};

/** Six target rings, flown in order; each is a circle in a vertical plane. */
export const RINGS = [
  { x: -780, z: -1050, y: 120, r: 34, face: 0 },
  { x: -150, z: -1450, y: 210, r: 34, face: 0.6 },
  { x: 620, z: -980, y: 260, r: 32, face: 1.4 },
  { x: 880, z: -120, y: 190, r: 32, face: 2.2 },
  { x: 320, z: 720, y: 150, r: 34, face: 2.9 },
  { x: -420, z: 980, y: 110, r: 34, face: 3.6 },
];

/** Puffy cloud anchors, fixed so the sky is the same on every flight. */
export const CLOUDS = [];
for (let i = 0; i < 26; i++) {
  const a = hash2(i, 7) * Math.PI * 2;
  const d = 900 + hash2(i, 13) * 3200;
  CLOUDS.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, y: 340 + hash2(i, 29) * 160, s: 90 + hash2(i, 41) * 150 });
}

const ISLAND_R = 2100;

/** Raw island height before the runway flattening. The dome's centre sits
 * east of the origin, so the west coast — where the runway lies — is a
 * low shelf with clear approaches along the shore, and the high ground
 * is the island's eastern spine. */
function islandHeight(x, z) {
  const d = Math.hypot(x - 420, z);
  const falloff = Math.max(0, 1 - d / ISLAND_R);
  const dome = Math.pow(falloff, 1.7) * 205;
  const hills = smoothNoise(x + 5000, z + 5000, 620) * 66 + smoothNoise(x, z, 190) * 16;
  const ridge = Math.max(0, smoothNoise(x - 3000, z + 9000, 900) - 0.45) * 170;
  return Math.max(0, dome + (hills + ridge) * Math.min(1, falloff * 2.4) - 22);
}

/** Ground height at a point, with the runway strip blended flat. */
export function groundHeight(x, z) {
  let h = islandHeight(x, z);
  const dx = Math.abs(x - RUNWAY.x);
  const inZ = z > RUNWAY.zFrom - 130 && z < RUNWAY.zTo + 130;
  if (inZ) {
    const blend = Math.max(0, 1 - Math.max(0, dx - RUNWAY.width / 2) / 130);
    const endBlend = Math.min(1, (z - (RUNWAY.zFrom - 130)) / 130, ((RUNWAY.zTo + 130) - z) / 130);
    const b = Math.min(blend, Math.max(0, endBlend));
    h = h + (RUNWAY.y - h) * Math.min(1, b * 1.6);
  }
  return h;
}

/** True when a point is over the runway strip itself. */
export function overRunway(x, z) {
  return Math.abs(x - RUNWAY.x) <= RUNWAY.width / 2 + 4 && z >= RUNWAY.zFrom && z <= RUNWAY.zTo;
}

/** Water level; the sea is the ground truth outside the island. */
export const SEA_Y = 0;
