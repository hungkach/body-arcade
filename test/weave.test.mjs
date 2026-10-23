// 0.13.0, Mark: head movement like Fight Night Champion: the head moves in an arc; left and right
// are slips, straight down is a duck, a U is a weave; while weaving it is a level change and a
// jump at any time is the double.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moves, scriptMotion, BODIES } from './helpers/synth.mjs';
import { runScript, VARIANTS } from './helpers/run-clip.mjs';

const runAll = (script, opts) => Object.fromEntries(Object.entries(VARIANTS).map(([name, v]) => [name, runScript(script, v, opts)]));
const weaves = (r) => r.events.filter((e) => e.name === 'weave').map((e) => `${e.payload.from}-${e.payload.to}`);
const strikes = (r) => r.events.filter((e) => e.name === 'strike').map((e) => `${e.payload.hand}-${e.payload.type}`);

test('a weave each way, in every framing; it throws nothing and is not a squat', () => {
  const script = scriptMotion([moves.stance(5, 16, 'orthodox'), moves.weave(7, 'left'), moves.weave(10.5, 'right')]);
  for (const [name, r] of Object.entries(runAll(script))) {
    assert.deepEqual(weaves(r), ['left-right', 'right-left'], name);
    assert.deepEqual(strikes(r), [], `${name}: strikes`);
    assert.equal(r.count('squat'), 0, `${name}: squats`);
    const w = r.events.find((e) => e.name === 'weave').payload;
    assert.ok(w.depth >= 0.15 && w.width >= 0.6, `${name}: depth ${w.depth} width ${w.width}`);
    // weaving shows in the snapshot during the U
    assert.ok(r.frames.some((f) => f.t > 7400 && f.t < 8600 && f.snap.weaving), `${name}: weaving`);
    assert.ok(!r.frames.some((f) => f.t > 6000 && f.t < 6900 && f.snap.weaving), `${name}: weaving before`);
  }
});

test('slips, a duck straight down, and a slip that dips and comes back the same side are not weaves', () => {
  const script = scriptMotion([moves.stance(5, 20, 'orthodox'), moves.lean(7, 8.5, 'left', 0.35), moves.lean(9.5, 11, 'right', 0.35),
    moves.squat(12, 0.12, 0.4, 0.3, 0.5), moves.lean(13, 14.8, 'left', 0.35), moves.squat(13.5, 0.12, 0.3, 0.2, 0.3),
    moves.weave(16, 'left')]);
  // the last one is a real weave; everything before it is not
  for (const [name, r] of Object.entries(runAll(script))) {
    assert.deepEqual(weaves(r), ['left-right'], name);
    assert.ok(r.events.filter((e) => e.name === 'weave').every((e) => e.t > 16000), `${name}: a weave before the real one`);
  }
});

test('in a fight: a jump out of a weave is the double, a jump from standing is not (requireJump)', () => {
  const script = scriptMotion([moves.stance(5, 22, 'orthodox'), moves.weave(8, 'left', { jumpAt: 0.5 }), moves.weave(13, 'right', { jumpAt: 0.3 }), moves.weave(18, 'left')]);
  const config = { combat: { fight: { requireJump: true } } };
  for (const name of ['portrait', 'landscape', 'livingRoom']) {
    let entered = false;
    const r = runScript(script, VARIANTS[name], { config, onFrame: (f, engine) => { if (!entered && f.t > 6000) { entered = true; engine.enter_combat({ open: () => true, shot: () => ({ takedown: true, topMs: 1000 }) }); } } });
    const shots = r.events.filter((e) => e.name === 'shot');
    assert.equal(shots.length, 2, `${name}: shots ${shots.map((e) => e.t)}`);
    assert.ok(shots.every((e) => e.payload.weave), `${name}: from the weave`);
    assert.equal(r.count('takedown'), 2, `${name}: takedowns`);
  }
  // a hop from standing in a fight is only a jump
  const hop = scriptMotion([moves.stance(5, 12, 'orthodox'), moves.weave(8, 'left', { jumpAt: 0, angle: 0, depth: 0 })]);
  let entered = false;
  const r = runScript(hop, VARIANTS.portrait, { config, onFrame: (f, engine) => { if (!entered && f.t > 6000) { entered = true; engine.enter_combat({ open: () => true }); } } });
  assert.ok(r.count('jump') >= 1, 'the hop is a jump');
  assert.equal(r.count('shot'), 0, 'not a shot');
});

test('every body build weaves both ways', () => {
  const script = scriptMotion([moves.stance(5, 16, 'orthodox'), moves.weave(7, 'left'), moves.weave(10.5, 'right')]);
  for (const [body, b] of Object.entries(BODIES)) {
    for (const vn of ['portrait', 'livingRoom']) {
      const v = Object.assign({}, VARIANTS[vn], { body: b, distance: (VARIANTS[vn].distance || 2) * (b.scale || 1) });
      assert.deepEqual(weaves(runScript(script, v)), ['left-right', 'right-left'], `${body} ${vn}`);
    }
  }
});
