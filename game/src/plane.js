// plane.js — the Kestrel, a forgiving little prop plane with an honest
// flight model: throttle makes speed, speed makes lift, banks make turns,
// and flying slowly or greedily is punished the way the sky punishes it.

import { groundHeight, overRunway, RINGS } from './world.js';

export const STALL_SPEED = 26; // m/s, below this the wing gives up
export const MAX_SPEED = 92;

export function createPlane() {
  return {
    x: -780, y: 15.4, z: 380, // parked at the runway's south end
    heading: 0, // facing north: forward is (sin h, -cos h), so h=0 flies toward -z
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    vy: 0,
    fuel: 100,
    damage: 0,
    ringsFlown: 0,
    state: 'ready', // ready | flying | landed | crashed | complete
    message: '',
    messageT: 0,
    time: 0,
  };
}

/** Signed smallest angle from a to b. */
function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Advance the flight model one step.
 * input: { pitch: -1..1 (up positive), roll: -1..1, throttleDelta: -1..1 }
 */
export function stepPlane(p, input, dt) {
  if (p.state === 'landed' || p.state === 'crashed' || p.state === 'complete') return;
  p.time += dt;
  if (p.messageT > 0) p.messageT -= dt;

  // Throttle and fuel: an empty tank turns the sortie into a glide home.
  p.throttle = clamp(p.throttle + input.throttleDelta * dt * 0.7, 0, 1);
  const burning = p.fuel > 0 ? p.throttle : 0;
  p.fuel = Math.max(0, p.fuel - burning * dt * 0.55);
  if (p.fuel <= 0 && p.state === 'flying' && p.messageT <= 0) {
    p.message = 'TANK DRY — glide for the runway';
    p.messageT = 3;
  }

  // Controls answer in proportion to airflow: dead stick at a standstill.
  const authority = clamp(p.speed / 30, 0, 1);
  p.roll = approach(p.roll, input.roll * 1.05, dt * 3.2);
  p.pitch = approach(p.pitch, input.pitch * 0.5, dt * 2.4);

  // Turn from bank, climb from pitch and speed.
  p.heading += Math.sin(p.roll) * authority * dt * 0.85;
  const accel = burning * 15 - p.speed * 0.055 - Math.sin(p.pitch) * 9.5;
  p.speed = clamp(p.speed + accel * dt, 0, MAX_SPEED);

  const stalling = p.speed < STALL_SPEED && p.y > groundHeight(p.x, p.z) + 3;
  const lift = clamp(p.speed / STALL_SPEED, 0, 1.15);
  let climb = Math.sin(p.pitch) * p.speed * 0.62 * lift;
  climb -= (1 - Math.min(1, lift)) * 7.5; // sink when the wing is not flying
  if (stalling) climb -= 4.5;
  p.vy = approach(p.vy, climb, dt * 2.2);

  const fx = Math.sin(p.heading), fz = -Math.cos(p.heading);
  p.x += fx * p.speed * dt * Math.cos(p.pitch * 0.6);
  p.z += fz * p.speed * dt * Math.cos(p.pitch * 0.6);
  p.y += p.vy * dt;

  if (p.state === 'ready' && p.speed > 4) p.state = 'flying';

  // The next ring: passing through its disc scores it and lights the next.
  const ring = RINGS[p.ringsFlown];
  if (ring && p.state === 'flying') {
    const dx = p.x - ring.x, dz = p.z - ring.z, dy = p.y - ring.y;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < ring.r + 6) {
      p.ringsFlown += 1;
      p.message = p.ringsFlown >= RINGS.length
        ? 'ALL RINGS FLOWN — bring her home to the runway'
        : `RING ${p.ringsFlown} OF ${RINGS.length} — next ring lit ahead`;
      p.messageT = 3.2;
    }
  }

  // Ground contact: a gentle arrival on the strip is a landing; anything
  // else is the island collecting its toll in damage.
  const ground = Math.max(groundHeight(p.x, p.z), 0);
  if (p.y <= ground + 1.4) {
    const onStrip = overRunway(p.x, p.z);
    const gentle = p.vy > -4.2 && p.speed < 46 && Math.abs(p.roll) < 0.3;
    const aligned = Math.abs(angleDelta(p.heading, Math.PI)) < 0.35 || Math.abs(angleDelta(p.heading, 0)) < 0.35;
    if (onStrip && gentle && aligned && p.state === 'flying') {
      p.y = ground + 1.4;
      p.speed = Math.max(0, p.speed - 26 * dt);
      p.vy = 0;
      if (p.speed < 2) {
        p.state = p.ringsFlown >= RINGS.length ? 'complete' : 'landed';
        p.message = p.state === 'complete' ? 'SORTIE COMPLETE — every ring, and home' : 'DOWN SAFE — fly the rings for the full sortie';
        p.messageT = 99;
      }
    } else if (p.state === 'flying' || p.y < ground) {
      const hard = p.vy < -9 || p.speed > 55 || !onStrip;
      p.damage += hard ? 55 : 22;
      p.y = ground + 1.4;
      p.vy = Math.abs(p.vy) * 0.2;
      p.speed *= 0.45;
      if (p.damage >= 100 || (p.y <= 1.5 && !onStrip && ground <= 0.2)) {
        p.state = 'crashed';
        p.message = ground <= 0.2 ? 'IN THE BAY — the sea keeps what it catches' : 'CRASHED — the island always wins an argument';
        p.messageT = 99;
      } else {
        p.message = 'ROUGH ARRIVAL — airframe damaged';
        p.messageT = 2.6;
      }
    }
  }
  if (p.y < 1.2) p.y = 1.2;
}

export function isStalling(p) {
  return p.state === 'flying' && p.speed < STALL_SPEED && p.y > groundHeight(p.x, p.z) + 3;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function approach(v, target, step) { return v < target ? Math.min(target, v + step) : Math.max(target, v - step); }
