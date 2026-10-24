// 0.21.0 (Mark 10/25: "lower rounds do not pick up at all"; "the player is a pillar, any hands that
// leave their body outside of a deadzone are strikes; both cameras work out if it is a straight or a
// round"): the punch zone is a column around the body, the guard's depth plus the room in front and
// the shoulders plus the room at the sides. A fist moving inside it is part of the body; one that
// leaves it is a punch, wherever it was thrown from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RE } from './helpers/engine.mjs';
import { moves, scriptMotion, synthClip } from './helpers/synth.mjs';
import { runScript, VARIANTS } from './helpers/run-clip.mjs';

const runAll = (script, opts) => Object.fromEntries(Object.entries(VARIANTS).map(([name, v]) => [name, runScript(script, v, opts)]));
const squashDepth = (k) => (f) => {
  for (const [s, e, w] of [[11, 13, 15], [12, 14, 16]]) {
    const z0 = f.wl[s][2];
    for (const i of [e, w]) f.wl[i][2] = z0 + (f.wl[i][2] - z0) * k;
  }
};
const punchesOf = (r) => r.events.filter((e) => e.name === 'punch').map((e) => e.payload);
function thrown(stance, types, t0 = 6.5) {
  const segs = [], want = [];
  let t = t0;
  for (const type of types) for (const hand of ['left', 'right']) { segs.push(moves.punch(t, hand, type)); want.push([hand, type]); t += 1.3; }
  segs.unshift(moves.stance(5, t + 1, stance));
  return { script: scriptMotion(segs), want };
}

for (const stance of ['orthodox', 'southpaw']) {
  test(`${stance}: low rounds that drop first, and body hooks, are rounds that went low, in every framing and with depth squashed`, () => {
    const { script, want } = thrown(stance, ['lowRound', 'bodyHook']);
    for (const opts of [{}, { onFrame: squashDepth(0.3) }]) {
      for (const [name, r] of Object.entries(runAll(script, opts))) {
        const ps = punchesOf(r), tag = `${name}${opts.onFrame ? ' squashed' : ''}`;
        assert.deepEqual(ps.map((p) => p.hand), want.map(([h]) => h), `${tag}: ${JSON.stringify(ps.map((p) => [p.hand, p.shape, p.arc, p.low]))}`);
        for (const p of ps) {
          assert.equal(p.shape, 'round', `${tag}: ${JSON.stringify(p)}`);
          assert.ok(p.low < -0.3, `${tag}: went low ${p.low}`);
          assert.ok(p.exit === 'front' || p.exit === 'side', `${tag}: left the pillar ${p.exit}`);
        }
      }
    }
  });
}

test('head punches stay up: straights and hooks never go as low as a body round', () => {
  const { script } = thrown('orthodox', ['straight', 'hook']);
  for (const [name, r] of Object.entries(runAll(script))) {
    const ps = punchesOf(r);
    assert.equal(ps.length, 4, name);
    for (const p of ps) assert.ok(p.low > -0.3, `${name}: ${p.hand} ${p.shape} low ${p.low}`);
  }
});

test('a fist moving fast inside the pillar is part of the body: tucked to the ribs, across the face', () => {
  const segs = [moves.stance(5, 16, 'orthodox')];
  let t = 6.5;
  for (const type of ['tuck', 'across']) for (const hand of ['left', 'right']) { segs.push(moves.inside(t, hand, type)); t += 1.2; }
  const script = scriptMotion(segs);
  // (with world depth squashed to 30% a fist tucked fast toward the camera foreshortens like a short body
  // punch, and in the far and living room framings it reads as one: the side camera settles that)
  for (const [name, r] of Object.entries(runAll(script))) assert.deepEqual(punchesOf(r).map((p) => `${p.hand}-${p.shape}`), [], name);
  for (const [name, r] of Object.entries(runAll(script, { onFrame: squashDepth(0.3) }))) {
    if (name !== 'landscapeFar' && name !== 'livingRoom') assert.deepEqual(punchesOf(r).map((p) => `${p.hand}-${p.shape}`), [], `${name} squashed`);
  }
});

test('the pillar: in front of the guard by the room, out past the shoulders, and the room follows the side phone', () => {
  const { script } = thrown('orthodox', ['straight']);
  const r = runScript(script, VARIANTS.portrait);
  const pill = r.frames.map((f) => f.det && f.det.punchPillar).filter(Boolean);
  assert.ok(pill.length, 'the pillar is reported');
  const last = pill[pill.length - 1];
  assert.ok(last.front > 0.25 && last.front < 0.5 && last.side > 0.25 && last.side < 0.45, JSON.stringify(last));
});

// with the side phone (1.5 fists of room): it sees the depth, so low rounds read and a tuck is not a punch,
// with the main camera's depth squashed too
function withSide(script, zf) {
  const side = synthClip({ w: 720, h: 1280, f: 800, distance: 2.4, camHeight: 1.0, seed: 77, camYaw: -Math.PI / 2, motion: script.motion, seconds: script.seconds });
  const sq = squashDepth(0.3);
  let i = 0;
  return (f, engine) => {
    sq(f);
    const k = i++ - 2;
    if (k < 0) return;
    if (k === 0) engine.side_sync(0);
    const p = RE.sidePack(side.frames[k]);
    p.zf = zf;
    engine.side_feed(p, f.t);
  };
}
test('with the side phone: low rounds read and a tuck to the ribs does not, depth squashed on the main camera', () => {
  const { script, want } = thrown('orthodox', ['lowRound', 'bodyHook']);
  const segs = [moves.stance(5, 10, 'orthodox')];
  let t = 6.5;
  for (const hand of ['left', 'right']) { segs.push(moves.inside(t, hand, 'tuck')); t += 1.2; }
  const tuck = scriptMotion(segs);
  for (const vn of ['portrait', 'livingRoom', 'landscapeFar']) {
    const ps = punchesOf(runScript(script, VARIANTS[vn], { onFrame: withSide(script, 1.5) }));
    assert.deepEqual(ps.map((p) => `${p.hand}-${p.shape}`), want.map(([h]) => `${h}-round`), `${vn}: ${JSON.stringify(ps.map((p) => [p.hand, p.shape, p.low]))}`);
    assert.deepEqual(punchesOf(runScript(tuck, VARIANTS[vn], { onFrame: withSide(tuck, 1.5) })), [], `${vn}: tuck`);
  }
});
