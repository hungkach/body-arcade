// Engine 0.3.0: the four-cue step trigger (after Homecoming Hero), warm-up
// tuning, rails points that wait for the next intersection, the TV camera
// preset, and the quiet (speech: false) option.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RE } from './helpers/engine.mjs';
import { moves, scriptMotion } from './helpers/synth.mjs';
import { runScript, VARIANTS } from './helpers/run-clip.mjs';

const cfg = RE.defaultConfig();
const stepsBetween = (r, a, b) => r.events.filter((e) => e.name === 'step' && e.t > a && e.t <= b).length;
const expectedBetween = (script, a, b) => scriptMotion(script.segments.filter((s) => s.start >= a / 1000 && s.end <= b / 1000)).expected.step;

// Two marching blocks: a warm-up round, then play.
const segments = [moves.march(5, 13), moves.march(15, 30)];
const TWO = Object.assign(scriptMotion(segments), { segments });

// Freeze world knees (and ankles) at their first-frame position: a source
// whose 3D landmarks never show the knee coming up.
function flatWorld() {
  let first = null;
  return (f) => {
    if (!f.wl) return;
    if (!first) first = [25, 26, 27, 28].map((i) => f.wl[i].slice());
    [25, 26, 27, 28].forEach((i, k) => { f.wl[i] = first[k].slice(); });
  };
}
// Freeze image knees at their first-frame position: the 2D picture never shows them rise.
function flatImage() {
  let first = null;
  return (f) => {
    if (!f.lm) return;
    if (!first) first = [25, 26].map((i) => f.lm[i].slice());
    [25, 26].forEach((i, k) => { f.lm[i] = first[k].slice(); });
  };
}
// Capture round 1 over the warm-up block, then apply the tuning.
function warmUp(extra) {
  return (f, engine) => {
    if (extra) extra(f);
    if (f.t >= 5300 && f.t < 5340) engine.capture_start('step', 1);
    if (f.t >= 13000 && f.t < 13040) { engine.capture_stop(); engine.apply_capture(); }
  };
}

test('3D cues alone carry a march at the default thresholds', () => {
  // the 2D cues alone sit right at their defaults on a normal march (the
  // camera foreshortens a knee coming toward it), which is what warm-up
  // tuning is for: see the next test
  for (const [name, v] of Object.entries(VARIANTS)) {
    const r = runScript(TWO, v, { onFrame: flatImage() });
    const want = TWO.expected.step;
    assert.ok(r.count('step') >= Math.ceil(0.95 * want), `${name}, image knees frozen: ${r.count('step')} of ${want}`);
  }
});

test('warm-up tuning rescues a march the default thresholds miss', () => {
  const play = expectedBetween(TWO, 15000, 30000);
  for (const name of Object.keys(VARIANTS)) {
    const before = runScript(TWO, VARIANTS[name], { onFrame: flatWorld() });
    const tuned = runScript(TWO, VARIANTS[name], { onFrame: warmUp(flatWorld()) });
    const got = stepsBetween(tuned, 15000, 30500);
    assert.ok(got >= Math.ceil(0.95 * play), `${name}: ${got} of ${play} steps after tuning (untuned ${stepsBetween(before, 15000, 30500)})`);
    assert.ok(got <= play, `${name}: ${got} steps, more than the ${play} taken`);
    assert.equal(tuned.count('run_start'), 0, `${name}: tuning made a false run`);
    const cues = tuned.engine.debug().cal.cues;
    assert.ok(cues && cues.left.rise && cues.left.rise.on < cfg.march.cues.rise.on, `${name}: rise was not tuned down`);
  }
});

test('tuning gives portrait and landscape the same step counts', () => {
  const p = runScript(TWO, VARIANTS.portrait, { onFrame: warmUp(flatWorld()) });
  const l = runScript(TWO, VARIANTS.landscape, { onFrame: warmUp(flatWorld()) });
  assert.ok(Math.abs(p.count('step') - l.count('step')) <= 1, `portrait ${p.count('step')}, landscape ${l.count('step')}`);
});

test('tuning keeps defaults for cues that never showed, and stays within bounds', () => {
  const r = runScript(TWO, VARIANTS.portrait, { onFrame: warmUp(flatWorld()) });
  const cues = r.engine.debug().cal.cues;
  for (const leg of ['left', 'right']) {
    // frozen world knees never lift: pitch and lift keep their defaults
    assert.equal(cues[leg].pitch, undefined, `${leg} pitch tuned from a frozen source`);
    assert.equal(cues[leg].lift, undefined, `${leg} lift tuned from a frozen source`);
    for (const id of ['rise', 'lead']) {
      const def = cfg.march.cues[id];
      assert.ok(cues[leg][id].on >= cfg.march.tune.minFrac * def.on - 1e-9 && cues[leg][id].on <= cfg.march.tune.maxFrac * def.on + 1e-9, `${leg} ${id} on ${cues[leg][id].on}`);
      assert.ok(cues[leg][id].off < cues[leg][id].on, `${leg} ${id} off above on`);
    }
  }
  assert.deepEqual(r.engine.moves_seen(), { step: true });
});

test('a warm-up that never marches tunes nothing', () => {
  const STILL = scriptMotion([moves.march(15, 25)]);
  const r = runScript(STILL, VARIANTS.portrait, { onFrame: warmUp() });
  assert.equal(r.engine.debug().cal.cues, undefined);
  assert.deepEqual(r.engine.moves_seen(), { step: false });
});

test('tuned thresholds are saved and carried into the next calibration', () => {
  const r = runScript(TWO, VARIANTS.portrait, { onFrame: warmUp(flatWorld()) });
  const saved = RE.profiles.load('living_room', 'portrait');
  assert.ok(saved && saved.cues && saved.cues.left.rise, 'cues not saved with the profile');
  // a fresh calibration on the same setup keeps them (runScript clears the profile first, so calibrate by hand)
  const e = RE.create({ headless: true, preset: 'living_room' });
  e.calibrate(undefined, { moveTest: false }).catch(() => {});
  RE.replaySync({ format: 'rep-engine-clip', version: 1, frames: r.clip.frames.slice(0, 150) }, (f) => e._ingest(f));
  assert.deepEqual(e.debug().cal.cues, saved.cues);
  e.clear_tuning();
  assert.equal(e.debug().cal.cues, undefined);
});

test('a half squat moves both legs together and never steps', () => {
  const squat = {
    start: 6, end: 14, kind: 'squat', expected: {},
    apply(t, m) {
      const k = Math.sin(Math.PI * ((t - 6) % 2) / 2) ** 2;
      m.drop = 0.07 * k;
      m.thighL = m.thighR = 0.7 * k;
    },
  };
  const script = scriptMotion([squat]);
  for (const [name, v] of Object.entries(VARIANTS)) {
    const r = runScript(script, v);
    assert.equal(r.count('step'), 0, `${name}: a squat stepped`);
  }
});

test('the four-cue trigger keeps its marching and run behavior in every framing', () => {
  const script = scriptMotion([moves.march(5, 15), moves.highKnees(15, 23)]);
  for (const [name, v] of Object.entries(VARIANTS)) {
    const r = runScript(script, v);
    assert.ok(r.count('step') >= Math.ceil(0.95 * script.expected.step), `${name}: ${r.count('step')} of ${script.expected.step}`);
    assert.equal(r.count('run_start'), 1, `${name}: run_start ${r.count('run_start')}`);
    assert.ok(r.events.find((e) => e.name === 'run_start').t > 15000, `${name}: ran while marching`);
  }
});

// ---- rails: points wait for the next intersection ----

function rails(model) {
  const l = new RE.Locomotion(cfg);
  l.setModel(Object.assign({ rails: true }, model));
  l.update(0, { cadence_spm: 0, turn: 0 }, 'explore');
  return l;
}

test('rails: a point between intersections waits for the next one', () => {
  let atCorner = false;
  const l = rails({ at_intersection: () => atCorner, branch_bearing: (side) => (side === 'left' ? 270 : 90) });
  l.onEvent('point', { side: 'left' }, 10);
  l.update(33, { cadence_spm: 0, turn: 0 }, 'explore');
  assert.equal(l.facing, 0);
  assert.equal(l.snapshot().queued, 'left');
  // pointing the other way replaces it
  l.onEvent('point', { side: 'right' }, 50);
  l.update(66, { cadence_spm: 0, turn: 0 }, 'explore');
  assert.equal(l.snapshot().queued, 'right');
  atCorner = true;
  l.update(99, { cadence_spm: 0, turn: 0 }, 'explore');
  assert.equal(l.facing, 90);
  assert.equal(l.snapshot().queued, null);
  l.update(132, { cadence_spm: 0, turn: 0 }, 'explore');
  assert.equal(l.facing, 90, 'took the turn twice');
});

test('rails: turn around clears a waiting point; no street that way keeps it', () => {
  let atCorner = false;
  let street = false;
  const l = rails({ at_intersection: () => atCorner, branch_bearing: (side) => (street ? (side === 'left' ? 270 : 90) : null) });
  l.onEvent('point', { side: 'left' }, 10);
  l.update(33, { cadence_spm: 0, turn: 0 }, 'explore');
  l.onEvent('turn_around', {}, 40);
  l.update(66, { cadence_spm: 0, turn: 0 }, 'explore');
  assert.equal(l.facing, 180);
  assert.equal(l.snapshot().queued, null);
  // an intersection with no street to the left: straight on, still waiting
  l.onEvent('point', { side: 'left' }, 70);
  atCorner = true;
  l.update(99, { cadence_spm: 0, turn: 0 }, 'explore');
  assert.equal(l.facing, 180);
  assert.equal(l.snapshot().queued, 'left');
  street = true;
  l.update(132, { cadence_spm: 0, turn: 0 }, 'explore');
  assert.equal(l.facing, 270);
});

test('set_facing, and locomotion() is safe inside the movement hooks', () => {
  const e = RE.create({ headless: true });
  e.enable_demo();
  e.set_facing(90);
  let inner = null;
  e.set_movement({ rails: true, at_intersection: () => { inner = e.locomotion(); return true; }, branch_bearing: () => 180 });
  e.debug().demo.press('point_left', RE.now());
  const m = e.locomotion();
  assert.ok(inner, 'hook never ran');
  assert.equal(m.facing, 180);
  e.disable_demo();
});

// ---- TV preset: camera selection ----

function fakeCamera({ backLabel = 'Back Camera', ultraWide = true, zoomMin = null, hasBack = true } = {}) {
  const calls = [];
  const devices = [{ kind: 'videoinput', deviceId: 'front', label: 'Front Camera' }];
  if (hasBack) devices.push({ kind: 'videoinput', deviceId: 'back', label: backLabel });
  if (hasBack && ultraWide) devices.push({ kind: 'videoinput', deviceId: 'uw', label: 'Back Ultra Wide Camera' });
  let applied = null;
  const stream = (label, facing) => {
    const track = {
      label, stopped: false,
      stop() { this.stopped = true; },
      getSettings: () => ({ facingMode: facing, zoom: 1 }),
      getCapabilities: () => (zoomMin != null ? { zoom: { min: zoomMin, max: 5 } } : {}),
      applyConstraints: async (c) => { applied = c; },
    };
    return { track, getVideoTracks: () => [track], getTracks: () => [track] };
  };
  const md = {
    calls,
    get applied() { return applied; },
    async getUserMedia(c) {
      calls.push(c.video);
      const v = c.video;
      if (v.deviceId) return stream(devices.find((d) => d.deviceId === v.deviceId.exact).label, 'environment');
      const wantBack = v.facingMode && (v.facingMode === 'environment' || v.facingMode.ideal === 'environment');
      return wantBack && hasBack ? stream(backLabel, 'environment') : stream('Front Camera', 'user');
    },
    async enumerateDevices() { return devices; },
  };
  return md;
}

test('tv preset opens the back ultra-wide, else zooms out, else falls back to the front camera', async () => {
  const c = cfg;
  let r = await RE.openCamera(RE.presets.tv, c, fakeCamera());
  assert.deepEqual([r.info.facing, r.info.lens, r.info.fallback], ['environment', 'ultrawide', false]);
  r = await RE.openCamera(RE.presets.tv, c, fakeCamera({ ultraWide: false, zoomMin: 0.5 }));
  assert.deepEqual([r.info.facing, r.info.lens], ['environment', 'wide_zoom']);
  r = await RE.openCamera(RE.presets.tv, c, fakeCamera({ ultraWide: false }));
  assert.deepEqual([r.info.facing, r.info.lens], ['environment', 'main']);
  r = await RE.openCamera(RE.presets.tv, c, fakeCamera({ hasBack: false }));
  assert.deepEqual([r.info.facing, r.info.lens, r.info.fallback], ['user', 'front', true]);
  r = await RE.openCamera(RE.presets.living_room, c, fakeCamera());
  assert.deepEqual([r.info.facing, r.info.fallback], ['user', false]);
});

// 0.17.0 (Mark: the iPad's front camera is an ultra-wide; why not use its widest view?)
test('front_wide asks the front camera for its whole 4:3 picture and zooms out where it can', async () => {
  let md = fakeCamera({ zoomMin: 0.5 });
  let r = await RE.openCamera(RE.presets.front_wide, cfg, md);
  assert.deepEqual([r.info.facing, r.info.lens, r.info.fallback], ['user', 'front_wide_zoom', false]);
  const v = md.calls[0];
  assert.equal(v.facingMode, 'user');
  assert.equal(v.aspectRatio.ideal, 4 / 3);
  assert.ok(v.width.ideal / v.height.ideal === 4 / 3 && v.width.ideal >= 1440, JSON.stringify(v));
  assert.deepEqual(md.applied, { advanced: [{ zoom: 0.5 }] });
  r = await RE.openCamera(RE.presets.front_wide, cfg, fakeCamera());
  assert.deepEqual([r.info.facing, r.info.lens], ['user', 'front_wide']);
  // the plain front preset is unchanged: 16:9, no zoom
  md = fakeCamera({ zoomMin: 0.5 });
  r = await RE.openCamera(RE.presets.living_room, cfg, md);
  assert.equal(r.info.lens, 'front');
  assert.equal(md.calls[0].aspectRatio, undefined);
  assert.equal(md.applied, null);
});

// ---- speech ----

test('speech: false keeps calibration quiet; the default speaks', () => {
  const said = [];
  globalThis.speechSynthesis = { cancel() {}, speak(u) { said.push(u.text); } };
  globalThis.SpeechSynthesisUtterance = function (text) { this.text = text; };
  try {
    const clip = runScript(scriptMotion([moves.march(5, 6)]), VARIANTS.portrait).clip;
    for (const [opts, loud] of [[{ speech: false }, false], [{}, true]]) {
      said.length = 0;
      RE.profiles.clear('living_room', 'portrait');
      const e = RE.create(opts);
      e.calibrate(undefined, { moveTest: false }).catch(() => {});
      RE.replaySync(clip, (f) => e._ingest(f));
      assert.equal(said.length > 0, loud, `${JSON.stringify(opts)} said ${JSON.stringify(said)}`);
    }
  } finally {
    delete globalThis.speechSynthesis;
    delete globalThis.SpeechSynthesisUtterance;
  }
});
