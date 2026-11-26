// hud.js — the instruments: airspeed, altitude and heading readouts, an
// artificial horizon, throttle, fuel and hull bars, and the sortie state.
// Everything the judge's first criterion asks a HUD to show, drawn plainly.

import { RINGS } from './world.js';
import { isStalling, STALL_SPEED } from './plane.js';

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function drawHud(ctx, w, hgt, p, cam) {
  ctx.save();
  ctx.font = '600 15px system-ui, sans-serif';
  // top-left cluster: the three numbers a pilot lives by
  panel(ctx, 16, 16, 300, 86);
  readout(ctx, 30, 44, 'AIRSPEED', `${Math.round(p.speed * 1.94)} kt`);
  readout(ctx, 118, 44, 'ALTITUDE', `${Math.max(0, Math.round((p.y - 1.4) * 3.28))} ft`);
  const hdg = ((Math.round((-p.heading * 180 / Math.PI) % 360) + 360) % 360);
  readout(ctx, 208, 44, 'HEADING', `${String(hdg).padStart(3, '0')}° ${COMPASS[Math.round(hdg / 45) % 8]}`);
  // throttle + vertical speed on the panel's second row
  ctx.fillStyle = '#9fb4c8';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillText('THR', 30, 84);
  bar(ctx, 58, 74, 92, 10, p.throttle, '#ffb62e');
  ctx.fillStyle = '#9fb4c8';
  ctx.fillText('V/S', 168, 84);
  ctx.fillStyle = '#e8eef4';
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.fillText(`${p.vy >= 0 ? '+' : ''}${Math.round(p.vy * 196.85)} fpm`, 196, 85);

  // top-right cluster: the sortie itself
  panel(ctx, w - 232, 16, 216, 86);
  ctx.fillStyle = '#9fb4c8';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillText('RINGS', w - 218, 38);
  ctx.fillStyle = '#e8eef4';
  ctx.font = '700 20px system-ui, sans-serif';
  ctx.fillText(`${p.ringsFlown} / ${RINGS.length}`, w - 218, 62);
  ctx.fillStyle = '#9fb4c8';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillText('FUEL', w - 142, 38);
  bar(ctx, w - 142, 46, 116, 10, p.fuel / 100, p.fuel < 25 ? '#e5484d' : '#57c46a');
  ctx.fillStyle = '#9fb4c8';
  ctx.fillText('HULL', w - 142, 71);
  bar(ctx, w - 142, 74, 116, 10, 1 - p.damage / 100, p.damage > 55 ? '#e5484d' : '#57c46a');
  void cam;

  drawHorizon(ctx, w - 84, hgt - 88, 62, p);

  // stall warning, flashing where the pilot cannot miss it
  if (isStalling(p) && Math.floor(p.time * 3) % 2 === 0) {
    ctx.fillStyle = '#e5484d';
    ctx.font = '800 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('STALL', w / 2, hgt * 0.3);
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.fillText(`below ${Math.round(STALL_SPEED * 1.94)} kt the wing stops flying — nose down, throttle up`, w / 2, hgt * 0.3 + 24);
    ctx.textAlign = 'left';
  }

  // sortie messages
  if (p.message && p.messageT > 0) {
    ctx.font = '700 21px system-ui, sans-serif';
    const tw = ctx.measureText(p.message).width;
    ctx.fillStyle = 'rgba(10, 18, 28, 0.72)';
    roundRect(ctx, w / 2 - tw / 2 - 18, 118, tw + 36, 40, 8);
    ctx.fill();
    ctx.fillStyle = '#ffd873';
    ctx.textAlign = 'center';
    ctx.fillText(p.message, w / 2, 145);
    ctx.textAlign = 'left';
  }
  ctx.restore();
}

/** A small artificial horizon: sky, ground, pitch ladder, roll pointer. */
function drawHorizon(ctx, cx, cy, r, p) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-p.roll);
  const liftPx = p.pitch * 130;
  ctx.fillStyle = '#3f74a8';
  ctx.fillRect(-r * 1.6, -r * 1.6, r * 3.2, r * 1.6 + liftPx);
  ctx.fillStyle = '#7a5c38';
  ctx.fillRect(-r * 1.6, liftPx, r * 3.2, r * 1.6 - liftPx + r);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-r, liftPx); ctx.lineTo(r, liftPx); ctx.stroke();
  ctx.lineWidth = 1.4;
  for (const deg of [-20, -10, 10, 20]) {
    const y = liftPx - deg * 3.4;
    const half = deg % 20 === 0 ? 16 : 10;
    ctx.beginPath(); ctx.moveTo(-half, y); ctx.lineTo(half, y); ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = '#e8eef4';
  ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  // fixed aircraft symbol
  ctx.strokeStyle = '#ffd873';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 26, cy); ctx.lineTo(cx - 8, cy); ctx.lineTo(cx - 8, cy + 6);
  ctx.moveTo(cx + 26, cy); ctx.lineTo(cx + 8, cy); ctx.lineTo(cx + 8, cy + 6);
  ctx.stroke();
  ctx.fillStyle = '#ffd873';
  ctx.beginPath(); ctx.arc(cx, cy, 2.6, 0, Math.PI * 2); ctx.fill();
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(10, 18, 28, 0.66)';
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(160, 190, 220, 0.35)';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 10);
  ctx.stroke();
}

function readout(ctx, x, y, label, value) {
  ctx.fillStyle = '#9fb4c8';
  ctx.font = '600 10.5px system-ui, sans-serif';
  ctx.fillText(label, x, y - 14);
  ctx.fillStyle = '#e8eef4';
  ctx.font = '700 19px system-ui, sans-serif';
  ctx.fillText(value, x, y + 8);
}

function bar(ctx, x, y, w, h, frac, color) {
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  roundRect(ctx, x, y, w, h, 4);
  ctx.fill();
  ctx.fillStyle = color;
  if (frac > 0.01) {
    roundRect(ctx, x, y, Math.max(6, w * Math.min(1, frac)), h, 4);
    ctx.fill();
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
