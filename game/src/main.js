// main.js — Skyward Sortie: boot, the game loop, the sortie's states
// (title, flying, down safe, crashed, complete), and the composed scenes
// the screenshots are taken from (?shot=chase / ?shot=cockpit / ?shot=rings).

import { createPlane, stepPlane } from './plane.js';
import { createCamera, followPlane, drawScene } from './render.js';
import { drawHud, roundRect } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { RINGS } from './world.js';

const canvas = document.getElementById('sky');
const ctx = canvas.getContext('2d');
const input = createInput(canvas);
const audio = createAudio();

let plane = createPlane();
let cam = createCamera();
let mode = 'title'; // title | play
let last = performance.now();
let prevRings = 0, prevState = plane.state;

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
if (shot) setupShot(shot);

/** Composed, real in-game scenes for the maker's screenshots. The scene is
 * frozen (the flight model does not step) so each shot is exactly the
 * moment its maker framed; without ?shot the game flies normally. */
function setupShot(name) {
  mode = 'play';
  plane.state = 'flying';
  if (name === 'chase') {
    Object.assign(plane, { x: -350, y: 185, z: -1000, heading: 0.46, pitch: 0.02, roll: -0.15, speed: 54, throttle: 0.72, fuel: 78, ringsFlown: 1 });
  } else if (name === 'cockpit') {
    cam.view = 'cockpit';
    Object.assign(plane, { x: -778, y: 40, z: 900, heading: 0, pitch: -0.06, roll: 0.02, speed: 38, throttle: 0.34, fuel: 41, ringsFlown: 6 });
    plane.message = 'ALL RINGS FLOWN — bring her home to the runway';
    plane.messageT = 99;
  } else if (name === 'rings') {
    Object.assign(plane, { x: 505, y: 256, z: -868, heading: 0.81, pitch: 0.05, roll: 0.34, speed: 58, throttle: 0.8, fuel: 63, ringsFlown: 2 });
  }
  followPlane(cam, plane, 1);
  cam.x = plane.x - Math.sin(plane.heading) * 30;
  cam.z = plane.z + Math.cos(plane.heading) * 30;
  cam.y = plane.y + 10;
  if (cam.view === 'cockpit') followPlane(cam, plane, 1);
}

function reset() {
  plane = createPlane();
  cam = createCamera();
  prevRings = 0;
  prevState = plane.state;
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;

  if (mode === 'play' && !shot) {
    const sampled = input.sample();
    if (sampled.viewToggle) {
      cam.view = cam.view === 'chase' ? 'cockpit' : 'chase';
      input.viewToggle = false;
    }
    if (sampled.restart) { reset(); input.restart = false; }
    if (sampled.anyKey) audio.start();
    stepPlane(plane, sampled, dt);
    if (plane.ringsFlown > prevRings) audio.ring();
    if (plane.state !== prevState) {
      if (plane.state === 'crashed') audio.thud();
      if (plane.state === 'complete' || plane.state === 'landed') audio.home();
    }
    prevRings = plane.ringsFlown;
    prevState = plane.state;
    audio.update(plane);
  } else if (mode === 'title') {
    // title: a slow orbit over the bay while the island shows itself
    const a = t * 0.05;
    cam.x = Math.cos(a) * 1500;
    cam.z = Math.sin(a) * 1500;
    cam.y = 300;
    cam.heading = Math.atan2(-cam.x, cam.z); // forward (sin h, -cos h) aimed at the island
    cam.pitch = -0.16;
    cam.roll = 0;
    if (input.anyKey) { mode = 'play'; audio.start(); }
  }

  if (mode === 'play') followPlane(cam, plane, dt);
  drawScene(ctx, canvas.width, canvas.height, cam, plane, t);
  if (mode === 'play') {
    drawHud(ctx, canvas.width, canvas.height, plane, cam);
    if (plane.state === 'landed' || plane.state === 'crashed' || plane.state === 'complete') drawEndCard(ctx, canvas.width, canvas.height, plane);
  } else {
    drawTitle(ctx, canvas.width, canvas.height, t);
  }
  requestAnimationFrame(frame);
}

function drawTitle(ctx, w, hgt, t) {
  void t;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(8, 16, 26, 0.45)';
  roundRect(ctx, w / 2 - 330, hgt * 0.2, 660, 300, 16);
  ctx.fill();
  ctx.fillStyle = '#ffd873';
  ctx.font = '700 21px system-ui, sans-serif';
  ctx.fillText('K E S T R E L   B A Y', w / 2, hgt * 0.2 + 52);
  ctx.fillStyle = '#f2f5f8';
  ctx.font = '800 58px Georgia, serif';
  ctx.fillText('Skyward Sortie', w / 2, hgt * 0.2 + 118);
  ctx.font = '400 19px system-ui, sans-serif';
  ctx.fillStyle = '#cfe0ee';
  ctx.fillText('Fly all six rings over the island, then land on the strip.', w / 2, hgt * 0.2 + 158);
  ctx.fillText('Mind your fuel, your hull, and the stall.', w / 2, hgt * 0.2 + 186);
  ctx.font = '600 16.5px system-ui, sans-serif';
  ctx.fillStyle = '#e8eef4';
  ctx.fillText('↑ ↓ pitch · ← → bank · W / S throttle · V cockpit view · R restart', w / 2, hgt * 0.2 + 232);
  ctx.fillStyle = '#ffd873';
  ctx.font = '700 18px system-ui, sans-serif';
  ctx.fillText('Press any key to take off', w / 2, hgt * 0.2 + 268);
  ctx.restore();
}

function drawEndCard(ctx, w, hgt, p) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(8, 16, 26, 0.62)';
  roundRect(ctx, w / 2 - 300, hgt * 0.34, 600, 208, 14);
  ctx.fill();
  ctx.fillStyle = p.state === 'crashed' ? '#e5484d' : '#57c46a';
  ctx.font = '800 40px Georgia, serif';
  ctx.fillText(p.state === 'complete' ? 'Sortie Complete' : p.state === 'landed' ? 'Down Safe' : 'Crashed', w / 2, hgt * 0.34 + 62);
  ctx.fillStyle = '#e8eef4';
  ctx.font = '400 18px system-ui, sans-serif';
  ctx.fillText(`Rings flown: ${p.ringsFlown} of ${RINGS.length} · Air time ${Math.floor(p.time / 60)}:${String(Math.floor(p.time % 60)).padStart(2, '0')}`, w / 2, hgt * 0.34 + 102);
  ctx.fillText(`Fuel left ${Math.round(p.fuel)}% · Hull damage ${Math.round(p.damage)}%`, w / 2, hgt * 0.34 + 132);
  ctx.fillStyle = '#ffd873';
  ctx.font = '700 17px system-ui, sans-serif';
  ctx.fillText('Press R to fly again', w / 2, hgt * 0.34 + 172);
  ctx.restore();
}

function resize() {
  canvas.width = Math.min(innerWidth, 1600);
  canvas.height = Math.min(innerHeight, 1000);
}
addEventListener('resize', resize);
resize();
requestAnimationFrame(frame);
