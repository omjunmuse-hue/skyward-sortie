// audio.js — procedural sound, no audio files: a two-oscillator engine
// whose pitch follows the throttle, wind that rises with airspeed, and
// short voices for the ring chime, the thud and the homecoming chord.

export function createAudio() {
  let ctx = null;
  let engine = null, engineGain = null, wind = null, windGain = null;

  function start() {
    if (ctx) { ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    engine = ctx.createOscillator();
    engine.type = 'sawtooth';
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engine.connect(engineFilter).connect(engineGain).connect(ctx.destination);
    engine.start();
    // wind: looped noise through a bandpass
    const len = ctx.sampleRate * 1.5;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    wind = ctx.createBufferSource();
    wind.buffer = buf;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    wind.connect(windFilter).connect(windGain).connect(ctx.destination);
    wind.start();
  }

  function tone(freq, dur, type = 'sine', vol = 0.16, when = 0) {
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime + when);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + dur);
    o.connect(g).connect(ctx.destination);
    o.start(ctx.currentTime + when);
    o.stop(ctx.currentTime + when + dur);
  }

  return {
    start,
    /** Call every frame with the plane's state. */
    update(p) {
      if (!ctx) return;
      engine.frequency.value = 55 + p.throttle * 65 + p.speed * 0.22;
      engineGain.gain.value = p.state === 'crashed' ? 0 : 0.028 + p.throttle * 0.03;
      windGain.gain.value = Math.min(0.11, p.speed * 0.0013);
    },
    ring() { tone(880, 0.16, 'sine', 0.18); tone(1318, 0.24, 'sine', 0.16, 0.09); },
    thud() { tone(72, 0.3, 'square', 0.22); tone(48, 0.42, 'sine', 0.2, 0.02); },
    home() { tone(523, 0.3, 'triangle', 0.16); tone(659, 0.3, 'triangle', 0.16, 0.14); tone(784, 0.5, 'triangle', 0.18, 0.28); },
  };
}
