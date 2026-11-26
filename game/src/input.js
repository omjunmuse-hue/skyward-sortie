// input.js — keyboard and mouse flying. Arrows or WASD work the stick,
// W/S and the mouse wheel work the throttle, and dragging the mouse is a
// second stick for pilots who fly that way.

export function createInput(canvas) {
  const keys = new Set();
  const input = { pitch: 0, roll: 0, throttleDelta: 0, viewToggle: false, restart: false, anyKey: false };
  let mouseSteer = null;

  addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    input.anyKey = true;
    if (e.code === 'KeyV') input.viewToggle = true;
    if (e.code === 'KeyR') input.restart = true;
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('wheel', (e) => {
    input.throttleDelta += e.deltaY < 0 ? 0.12 : -0.12;
  }, { passive: true });
  canvas.addEventListener('pointerdown', (e) => { mouseSteer = { x: e.clientX, y: e.clientY }; input.anyKey = true; });
  addEventListener('pointerup', () => { mouseSteer = null; });
  addEventListener('pointermove', (e) => {
    if (!mouseSteer) return;
    input.roll = clamp((e.clientX - mouseSteer.x) / 160, -1, 1);
    input.pitch = clamp((mouseSteer.y - e.clientY) / 160, -1, 1);
  });

  /** Sample the current controls into the shared input object. */
  input.sample = () => {
    let pitch = 0, roll = 0, thr = input.throttleDelta;
    input.throttleDelta = 0;
    if (keys.has('ArrowDown')) pitch -= 1;
    if (keys.has('ArrowUp')) pitch += 1;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) roll -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) roll += 1;
    if (keys.has('KeyW')) thr += 1;
    if (keys.has('KeyS')) thr -= 1;
    if (keys.has('ShiftLeft') || keys.has('ShiftRight')) thr += 1;
    if (keys.has('ControlLeft')) thr -= 1;
    if (!mouseSteer) { input.pitch = pitch; input.roll = roll; }
    else if (pitch !== 0 || roll !== 0) { input.pitch = pitch; input.roll = roll; mouseSteer = null; }
    input.throttleDelta = thr;
    return input;
  };
  return input;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
