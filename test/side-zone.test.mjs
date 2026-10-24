// 0.20.0 (Mark 10/24: "side camera zone should be adjustable on the side camera itself, with buttons;
// get in fighting stance and make sure there is 1.5 fist width front and back"): the side phone
// draws a stance box (RE.SideBox) and sends the room the player set, in fists, with each frame; the
// engine's punch zone uses the same room while the side camera is connected.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RE } from './helpers/engine.mjs';
import { moves, scriptMotion, synthClip } from './helpers/synth.mjs';
import { runScript, VARIANTS } from './helpers/run-clip.mjs';

const punches = (r) => r.events.filter((e) => e.name === 'punch').map((e) => `${e.payload.hand}-${e.payload.arc === 'up' ? 'up' : e.payload.shape}`);
function combo(t0 = 6.5) {
  const segs = [moves.stance(5, t0 + 11, 'orthodox')], want = [];
  let t = t0;
  for (const [hand, type, w] of [['left', 'straight', 'straight'], ['right', 'straight', 'straight'], ['left', 'hook', 'round'], ['right', 'hook', 'round'], ['left', 'uppercut', 'up'], ['right', 'uppercut', 'up']]) {
    segs.push(moves.punch(t, hand, type)); want.push(`${hand}-${w}`); t += 1.2;
  }
  return { script: scriptMotion(segs), want };
}
// the same script seen by a phone at the player's side, two frames behind, sending zf fists
function withSide(script, zf) {
  const side = synthClip({ w: 720, h: 1280, f: 800, distance: 2.4, camHeight: 1.0, seed: 77, camYaw: -Math.PI / 2, motion: script.motion, seconds: script.seconds });
  let i = 0;
  return (f, engine) => {
    const k = i++ - 2;
    if (k < 0) return;
    if (k === 0) engine.side_sync(0);
    const p = RE.sidePack(side.frames[k]);
    if (zf != null) p.zf = zf;
    engine.side_feed(p, f.t);
  };
}

test('the engine takes the room the phone sends: status and the punch zone', () => {
  const { script } = combo();
  const r = runScript(script, VARIANTS.portrait, { onFrame: withSide(script, 2) });
  assert.equal(r.engine.side_status().zoneFists, 2);
  const zm = r.frames.map((f) => f.det && f.det.punchZoneM).filter((v) => v != null);
  assert.ok(zm.length && Math.abs(zm[zm.length - 1] - 2 * RE.defaultConfig().combat.punch.fistM) < 1e-9, `zone ${zm[zm.length - 1]}`);
});

test('1.5 fists reads every punch; a zone bigger than a punch reads none', () => {
  const { script, want } = combo();
  for (const vn of ['portrait', 'livingRoom', 'tablet']) {
    assert.deepEqual(punches(runScript(script, VARIANTS[vn], { onFrame: withSide(script, 1.5) })), want, `${vn} 1.5 fists`);
    assert.deepEqual(punches(runScript(script, VARIANTS[vn], { onFrame: withSide(script, 7) })), [], `${vn} 7 fists`);
  }
});

test('head movement in a guard throws nothing with a tight side zone', () => {
  const script = scriptMotion([moves.stance(5, 28, 'orthodox'), moves.lean(7, 8.5, 'left', 0.35), moves.lean(9.5, 11, 'right', 0.35), moves.squat(16, 0.15, 0.4, 0.3, 0.5), moves.bound(20, 'left'), moves.weave(24, 'left'), moves.weave(26, 'right')]);
  for (const vn of ['portrait', 'livingRoom']) assert.deepEqual(punches(runScript(script, VARIANTS[vn], { onFrame: withSide(script, 0.75) })), [], vn);
});

test('the phone\'s stance box: around the fists in a stance, and a straight leaves through its front', () => {
  const script = scriptMotion([moves.stance(4, 12, 'orthodox'), moves.punch(9, 'left', 'straight')]);
  const side = synthClip({ w: 720, h: 1280, f: 800, distance: 2.4, camHeight: 1.0, seed: 77, camYaw: -Math.PI / 2, motion: script.motion, seconds: script.seconds });
  const box = new RE.SideBox(), get = (lm) => (i) => lm[i] && { x: lm[i][0], y: lm[i][1], v: lm[i][3] == null ? 1 : lm[i][3] };
  let inStance = null, wentOut = false;
  for (const f of side.frames) {
    const b = box.update(get(f.lm), 1.5);
    if (f.t >= 8000 && f.t < 8100 && b.ok) inStance = b;
    if (f.t >= 9000 && f.t < 9400 && b.ok && (b.out.l || b.out.r)) wentOut = true;
  }
  assert.ok(inStance, 'a box in the stance');
  const B = inStance.box;
  assert.ok(B.x1 - B.x0 > 0.05 && B.x1 - B.x0 < 0.8 && B.y1 > B.y0, JSON.stringify(B));
  assert.ok(!inStance.out.l && !inStance.out.r, 'both fists inside at rest');
  assert.ok(wentOut, 'the straight leaves through the front');
  // more room, a bigger box
  const b2 = new RE.SideBox(); let big = null;
  for (const f of side.frames) { const b = b2.update(get(f.lm), 3); if (f.t >= 8000 && f.t < 8100 && b.ok) big = b; }
  assert.ok(big.box.x1 - big.box.x0 > B.x1 - B.x0, 'bigger room, bigger box');
});
