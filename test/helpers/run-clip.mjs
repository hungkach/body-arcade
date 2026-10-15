// Runs a synthetic clip through a headless engine: calibrates on the first
// seconds of standing (no move test), then collects events and snapshots.
import { RE } from './engine.mjs';
import { synthClip } from './synth.mjs';

export const VARIANTS = {
  portrait: { w: 720, h: 1280 },
  landscape: { w: 1280, h: 720, offsetX: 180, seed: 99 },
  portraitMirrored: { w: 720, h: 1280, mirrored: true, seed: 31 },
  landscapeFar: { w: 1280, h: 720, distance: 2.6, offsetX: -120, seed: 5 },
  tablet: { w: 1024, h: 768, f: 760, seed: 12 },
  // living room preset: phone propped about 4 ft away, a little below hip height
  livingRoom: { w: 720, h: 1280, f: 700, distance: 1.25, camHeight: 0.9, seed: 21 },
};

export function runScript(script, variant, opts = {}) {
  const clip = synthClip(Object.assign({}, variant, { motion: script.motion, seconds: script.seconds }));
  RE.profiles.clear('living_room', clip.meta.orientation);
  const engine = RE.create({ headless: true, preset: 'living_room', config: opts.config });
  if (opts.movement) engine.set_movement(opts.movement);
  engine.calibrate(undefined, { moveTest: opts.moveTest === true ? undefined : false }).catch(() => {});
  const events = [];
  const frames = [];
  let calibratedAt = null;
  engine.on('*', (name, payload) => {
    if (name === 'frame' || name === 'calibration') return;
    if (name === 'calibrated' && calibratedAt === null) calibratedAt = engine.debug().raw.t;
    events.push({ t: engine.debug().raw.t, name, payload });
  });
  RE.replaySync(clip, (f) => {
    if (opts.onFrame) opts.onFrame(f, engine);
    engine._ingest(f);
    const d = engine.debug();
    frames.push({ t: f.t, snap: d.signals, raw: d.rawSignals, det: d.detectors, loco: d.locomotion });
  });
  const count = (name, match) => events.filter((e) => e.name === name && (!match || Object.keys(match).every((k) => e.payload[k] === match[k]))).length;
  return { engine, clip, events, frames, count, calibratedAt };
}
