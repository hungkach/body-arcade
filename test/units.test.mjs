import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RE, ROOT } from './helpers/engine.mjs';
import { synthClip } from './helpers/synth.mjs';
import { build, gameFolders } from '../build/build.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

test('square-pixel conversion keeps distances equal across aspect ratios', () => {
  // the same 100 px diagonal segment in a portrait and a landscape frame
  const seg = (w, h) => {
    const a = RE.toPixels([300 / w, 400 / h, 0, 1], w, h);
    const b = RE.toPixels([360 / w, 480 / h, 0, 1], w, h);
    return RE.dist(a, b);
  };
  assert.ok(Math.abs(seg(720, 1280) - 100) < 1e-9);
  assert.ok(Math.abs(seg(1280, 720) - 100) < 1e-9);
});

test('One Euro filter settles on a constant and cuts jitter', () => {
  const f = new RE.OneEuroFilter({ minCutoff: 1, beta: 0.02 });
  let out = 0;
  for (let i = 0; i < 120; i++) out = f.filter(5, i / 30);
  assert.ok(Math.abs(out - 5) < 1e-6);

  const g = new RE.OneEuroFilter({ minCutoff: 1, beta: 0.02 });
  let rawVar = 0, outVar = 0;
  for (let i = 0; i < 300; i++) {
    const noise = Math.sin(i * 12.9898) * 0.5; // deterministic jitter around 0
    const y = g.filter(noise, i / 30);
    if (i > 30) { rawVar += noise * noise; outVar += y * y; }
  }
  assert.ok(outVar < rawVar * 0.25, `filtered variance ${outVar} vs raw ${rawVar}`);
});

test('smoother holds the last value when visibility drops', () => {
  const s = new RE.LandmarkSmoother({ minCutoff: 1, beta: 0.02, dCutoff: 1 }, 0.5);
  s.update([{ x: 10, y: 20, v: 0.9 }], null, 0);
  const r = s.update([{ x: 500, y: 500, v: 0.2 }], null, 0.033);
  assert.equal(r.points[0].x, 10);
  assert.ok(r.points[0].held);
  assert.ok(r.held.has(0));
});

test('framing fails with knees out of frame and asks to step back', () => {
  const cfg = RE.defaultConfig();
  const clip = synthClip({ w: 720, h: 1280, seconds: 1 });
  const points = RE.framePixels(clip.frames[0]);
  assert.equal(RE.framingProblem(points, 720, 1280, cfg), null);
  const noKnees = points.map((p, i) => (i === 25 || i === 26 ? Object.assign({}, p, { v: 0.1 }) : p));
  assert.equal(RE.framingProblem(noKnees, 720, 1280, cfg).code, 'step_back');
  const faceAway = points.map((p, i) => (i === 11 ? Object.assign({}, p, { v: 0.3 }) : p));
  assert.equal(RE.framingProblem(faceAway, 720, 1280, cfg).code, 'low_visibility');
  assert.equal(RE.framingProblem(null, 720, 1280, cfg).code, 'no_person');
});

test('calibration restarts baseline when framing is lost', () => {
  const cfg = RE.defaultConfig();
  const cal = new RE.Calibrator(cfg, 'living_room');
  const clip = synthClip({ w: 720, h: 1280, seconds: 6 });
  const pts = (k) => RE.framePixels(clip.frames[k]);
  let k = 0;
  // 2 s of good framing reaches baseline
  for (; k < 60; k++) cal.update({ points: pts(k), w: 720, h: 1280, t: clip.frames[k].t });
  assert.equal(cal.state, 'baseline');
  // step out of frame
  cal.update({ points: null, w: 720, h: 1280, t: 2100 });
  assert.equal(cal.state, 'framing');
  assert.equal(cal.samples.length, 0);
});

test('move test runs the prompts whose detectors exist', () => {
  const cfg = RE.defaultConfig();
  // every prompt has a detector now that the combat module brings squat and strike
  const c1 = new RE.Calibrator(cfg, 'living_room');
  assert.deepEqual(c1.tests.map((t) => t.id), ['march', 'high_knees', 'turn_left', 'turn_right', 'point_left', 'point_right', 'squat', 'jab_cross']);
  assert.equal(c1.skippedTests, 0);
  const quick = new RE.Calibrator(cfg, 'living_room', { moveTest: false });
  assert.equal(quick.tests.length, 0);
  assert.equal(quick.skippedTests, 0);

  RE.detectors.delete('strike');
  try {
    const c2 = new RE.Calibrator(cfg, 'living_room');
    assert.equal(c2.tests.length, 7);
    assert.equal(c2.skippedTests, 1);
    c2.tests = c2.tests.filter((t) => t.id === 'squat');
    c2.state = 'move_test';
    c2.onEvent('step', {});
    assert.equal(c2.state, 'move_test');
    c2.onEvent('squat', { depth: 1 });
    assert.equal(c2.state, 'done');
  } finally {
    RE.detectors.add('strike');
  }
});

test('profiles save and load per preset and orientation', () => {
  const cal = { version: RE.PROFILE_VERSION, preset: 'garage', orientation: 'portrait', shoulderWidth: 120, torsoLength: 200 };
  RE.profiles.save(cal);
  assert.deepEqual(RE.profiles.load('garage', 'portrait'), cal);
  assert.equal(RE.profiles.load('garage', 'landscape'), null);
  RE.profiles.clear('garage', 'portrait');
  assert.equal(RE.profiles.load('garage', 'portrait'), null);
  // profiles from before world landmark baselines are ignored
  RE.profiles.save(Object.assign({}, cal, { version: 1 }));
  assert.equal(RE.profiles.load('garage', 'portrait'), null);
  RE.profiles.clear('garage', 'portrait');
});

test('drift monitor fires once after 3 s out of range', () => {
  const d = new RE.DriftMonitor(RE.defaultConfig());
  assert.equal(d.update(1.2, 0), false);
  assert.equal(d.update(1.2, 2900), false);
  assert.equal(d.update(1.2, 3000), true);
  assert.equal(d.update(1.2, 4000), false);
  assert.equal(d.update(1.0, 4100), false);
  assert.equal(d.update(0.8, 5000), false);
  assert.equal(d.update(0.8, 8000), true);
});

test('engine loads a saved profile and switches when the device rotates', () => {
  RE.profiles.clear('living_room', 'portrait');
  RE.profiles.clear('living_room', 'landscape');
  // calibrate in portrait
  const a = RE.create({ headless: true });
  a.calibrate(undefined, { moveTest: false });
  RE.replaySync(synthClip({ w: 720, h: 1280, seconds: 6 }), a._ingest);
  assert.ok(a.is_calibrated());

  // a fresh session picks the portrait profile up without calibrating
  const b = RE.create({ headless: true });
  const seen = [];
  b.on('*', (name) => seen.push(name));
  RE.replaySync(synthClip({ w: 720, h: 1280, seconds: 1 }), b._ingest);
  assert.ok(b.is_calibrated());
  // rotating to landscape with no landscape profile asks for calibration
  RE.replaySync(synthClip({ w: 1280, h: 720, seconds: 1 }), b._ingest);
  assert.equal(b.is_calibrated(), false);
  assert.ok(seen.includes('orientation_change'));
  assert.ok(seen.includes('recalibrate_needed'));
});

test('low confidence events fire on transitions only', () => {
  const e = RE.create({ headless: true });
  const seen = [];
  e.on('low_confidence', (p) => seen.push(['low', p.missing.length]));
  e.on('confidence_ok', () => seen.push(['ok']));
  const clip = synthClip({ w: 720, h: 1280, seconds: 1 });
  for (const f of clip.frames.slice(0, 5)) e._ingest(f);
  e._ingest({ t: 200, w: 720, h: 1280, lm: null, wl: null });
  e._ingest({ t: 233, w: 720, h: 1280, lm: null, wl: null });
  for (const f of clip.frames.slice(8, 12)) e._ingest(f);
  assert.deepEqual(seen, [['low', 6], ['ok']]);
});

test('recorder output replays to the same frames', () => {
  const e = RE.create({ headless: true });
  const clip = synthClip({ w: 720, h: 1280, seconds: 2 });
  e.start_recording({ note: 'test' });
  RE.replaySync(clip, e._ingest);
  const rec = e.stop_recording();
  assert.equal(rec.format, 'rep-engine-clip');
  assert.equal(rec.meta.orientation, 'portrait');
  assert.equal(rec.frames.length, clip.frames.length);
  assert.ok(Math.abs(rec.frames[10].lm[11][0] - clip.frames[10].lm[11][0]) < 1e-4);
  assert.doesNotThrow(() => RE.validateClip(JSON.parse(JSON.stringify(rec))));
});

test('recorder stops itself at 30 seconds', () => {
  const r = new RE.Recorder(RE.defaultConfig());
  r.start();
  let stopped = false;
  for (let t = 0; t <= 31000 && !stopped; t += 33) stopped = r.push({ t, w: 10, h: 10, lm: null, wl: null });
  assert.ok(stopped);
  assert.ok(r.elapsedMs <= 30000);
});

test('demo cadence matches tap rhythm and decays when tapping stops', () => {
  const taps = [];
  for (let i = 0; i < 6; i++) taps.push(1000 + i * 500); // 120 steps per minute
  assert.equal(RE.cadenceFromSteps(taps, 3500, 3000), 120);
  assert.ok(RE.cadenceFromSteps(taps, 5000, 3000) < 120);
  assert.equal(RE.cadenceFromSteps(taps, 9000, 3000), 0);
});

test('demo input emits the spec event shapes', () => {
  const events = [];
  const d = new RE.DemoInput(RE.defaultConfig(), (n, p) => events.push([n, p]));
  d.leftDown(0); d.leftUp();
  d.leftDown(600); d.leftUp();
  d.press('point_left', 700);
  d.press('jab', 710);
  d.press('squat', 720);
  d.setTurn(3);
  const s = d.signals(800);
  assert.deepEqual(events.map((e) => e[0]), ['step', 'step', 'point', 'strike', 'punch', 'squat']);
  events.splice(4, 1);
  assert.deepEqual(events[0][1], { leg: 'left' });
  assert.deepEqual(events[1][1], { leg: 'right' });
  assert.deepEqual(events[2][1], { side: 'left' });
  assert.deepEqual(events[3][1], { hand: 'left', type: 'jab', power: 1, speed: 5 });
  assert.equal(s.turn, 1);
  assert.equal(s.lean, 0);
  assert.equal(s.squat_depth, 1);
  d.destroy();
});

test('build inlines the engine into a single HTML file', () => {
  const outputs = build({ quiet: true });
  assert.ok(outputs.some((p) => p.endsWith('lab.html')));
  const html = readFileSync(join(ROOT, 'dist', 'lab.html'), 'utf8');
  assert.ok(!html.includes('<!-- rep-engine:inline -->'));
  assert.ok(html.includes('RE.version = '));
  assert.ok(html.includes('// ---- engine/engine.js ----'));
});

test('build discovers game folders by their placeholder', () => {
  const root = mkdtempSync(join(tmpdir(), 'body-arcade-build-'));
  try {
    const page = (dir, html) => { mkdirSync(join(root, dir), { recursive: true }); writeFileSync(join(root, dir, 'index.html'), html); };
    page('new-game', '<!doctype html><title>x</title><!-- rep-engine:inline -->');
    page('notes', '<!doctype html><title>no engine</title>');
    page('engine', '<!-- rep-engine:inline -->');
    mkdirSync(join(root, 'empty'));
    assert.deepEqual(gameFolders(root), ['new-game']);
    const out = build({ quiet: true, root });
    assert.deepEqual(out, [join(root, 'dist', 'new-game.html')]);
    assert.ok(existsSync(join(root, 'dist', 'new-game.html')));
    assert.ok(!existsSync(join(root, 'dist', 'notes.html')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  // the repo's own games
  assert.ok(gameFolders().includes('lab'));
});

test('games choose which demo buttons show', () => {
  assert.equal(RE.demoButtons().length, RE.DEMO_BUTTONS.length);
  // standard order whatever order the game lists them in
  assert.deepEqual(RE.demoButtons({ buttons: ['stomp', 'jab', 'hook'] }).map((b) => b[0]), ['jab', 'hook', 'stomp']);
  assert.deepEqual(RE.demoButtons({ buttons: [] }), []);
  assert.throws(() => RE.demoButtons({ buttons: ['jab', 'kick'] }), /unknown demo button kick/);
  // waves (0.5.3): the same 'wave' event as the camera, with the hand
  const e = RE.create({ headless: true });
  e.enable_demo();
  const got = [];
  e.on('wave', (p) => got.push(p.hand));
  e.debug().demo.press('wave_right', RE.now());
  e.debug().demo.press('wave_left', RE.now());
  assert.deepEqual(got, ['right', 'left']);
  e.disable_demo();
});
