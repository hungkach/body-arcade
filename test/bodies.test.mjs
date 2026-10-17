// Robustness across bodies (roadmap: the engine has to work for players other
// than Mark). Eight builds (short, tall, broad, narrow, long and short arms,
// long legs, long torso) in three framings run every locomotion gesture and
// a fight combination. Each player stands where the framing check puts them,
// so the camera distance scales with their size. 0.6.1 fixed what this sweep
// found: waves of tall or long-armed players leaving the frame, and hooks of
// smaller players falling under thresholds set in meters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moves, scriptMotion, BODIES } from './helpers/synth.mjs';
import { runScript, VARIANTS } from './helpers/run-clip.mjs';

const LOCO = scriptMotion([
  moves.march(5, 15), moves.highKnees(16, 24), moves.holdTurn(25, 28, 50), moves.holdTurn(29, 32, -50),
  moves.point(33, 34.2, 'left'), moves.turnAround(35, 36.6), moves.wave(37.5, 39.5, 'right'), moves.wave(40.5, 42.5, 'left'),
]);
const fight = (scale) => {
  const segs = [moves.stance(5, 17.5, 'orthodox')];
  let t = 6.5;
  for (const [hand, type] of [['left', 'straight'], ['right', 'straight'], ['left', 'hook'], ['right', 'hook'], ['left', 'uppercut'], ['right', 'uppercut']]) { segs.push(moves.punch(t, hand, type)); t += 1.2; }
  // a squat and a shot as deep as this body squats
  segs.push(moves.squat(19, 0.3 * scale, 0.6, 0.6, 2.0), moves.shot(23, 0.3 * scale));
  return scriptMotion(segs);
};
const WANT = ['left-jab', 'right-cross', 'left-hook', 'right-overhand', 'left-uppercut', 'right-uppercut'];

for (const [body, b] of Object.entries(BODIES)) {
  test(`${body} body: every gesture and the fight combination, in three framings`, () => {
    const scale = b.scale || 1;
    const F = fight(scale);
    for (const vn of ['portrait', 'livingRoom', 'landscape']) {
      const v = Object.assign({}, VARIANTS[vn], { body: b, distance: (VARIANTS[vn].distance || 2.0) * scale });
      const tag = `${body} ${vn}`;
      const r = runScript(LOCO, v);
      assert.ok(r.count('step') >= Math.ceil(0.95 * LOCO.expected.step), `${tag}: ${r.count('step')} of ${LOCO.expected.step} steps`);
      assert.equal(r.count('run_start'), 1, `${tag}: run`);
      assert.equal(r.count('turn_left'), 1, `${tag}: turn left`);
      assert.equal(r.count('turn_right'), 1, `${tag}: turn right`);
      assert.equal(r.count('point', { side: 'left' }), 1, `${tag}: point`);
      assert.equal(r.count('turn_around'), 1, `${tag}: turn around`);
      assert.equal(r.count('bound'), 0, `${tag}: no bound from walking and gestures`);
      assert.equal(r.count('wave', { hand: 'right' }), 1, `${tag}: wave right`);
      assert.equal(r.count('wave', { hand: 'left' }), 1, `${tag}: wave left`);
      const f = runScript(F, v);
      assert.equal(f.count('bound'), 0, `${tag}: no bound from the fight combination`);
      assert.deepEqual(f.events.filter((e) => e.name === 'strike').map((e) => `${e.payload.hand}-${e.payload.type}`), WANT, `${tag}: strikes`);
      assert.equal(f.count('squat'), 2, `${tag}: squats`);
      assert.equal(f.count('drive_up'), 1, `${tag}: drive ups`);
    }
  });
}
