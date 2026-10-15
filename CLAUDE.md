# body-arcade: notes for Claude

Mark's camera body-tracking fitness games for a phone or tablet. All games share one movement engine, rep-engine, in `engine/`. The full design spec (gestures, thresholds, state machines, API, milestones) is the "rep-engine spec" doc: https://claude.ai/code/artifact/a394f929-94ab-43c0-b06c-4d4b2cc50559. Read it before starting a milestone.

## Hard constraints

- Phone or iPad only, no accessories. TV mirroring is a bonus, never required.
- Default play space: living room preset, phone propped about 4 ft away, knees-up framing (ankles not required).
- Every game ships as one self-contained HTML file and has a touch demo mode that emits the same events as the camera.
- Games are fitness first: every concept names its S&C payoff, matches the sport's work-to-rest rhythm, and keeps sessions to 10 to 20 minutes.
- Repo, file and game names stay neutral and fitness oriented.

## Layout and build

- `engine/`: plain scripts, each an IIFE that adds to `globalThis.RepEngine`. Load order is `engine/manifest.json`. No ES module syntax and no `</script` anywhere in engine source (the build inlines it).
- `lab/`: engine test bench. `stomp-city/`, `manhattan-miles/`: games.
- `build/build.mjs`: replaces `<!-- rep-engine:inline -->` in the `index.html` of every top-level folder that has one and writes `dist/<folder>.html`. Commit `dist/`; GitHub Pages serves it at `https://hungkach.github.io/body-arcade/dist/<folder>.html`.
- `npm test` builds, then runs `node --test test/*.test.mjs`. No dependencies. Keep it green before every push.
- `test/helpers/synth.mjs` generates synthetic clips of a scripted 3D movement in any framing (`moves` and `scriptMotion` compose them); `test/helpers/run-clip.mjs` runs one through a headless engine across the standard framings. New detectors get a synthetic-clip test plus portrait vs landscape parity.

## Engine rules

- Games never touch landmarks: they read `engine.signals()` and subscribe with `engine.on(event)`. Event and signal names follow the spec's API section.
- All thresholds live in `engine/config.js`; profiles store only overrides.
- Body units: S = calibrated shoulder width, T = calibrated torso length, +x = player's right (read from the shoulders, so mirroring never flips it), +y = up.
- A new detector registers its event name in `RepEngine.detectors` so the calibration move test picks it up.
- MediaPipe: `@mediapipe/tasks-vision@1.1.1` from jsdelivr, `pose_landmarker_lite` model, GPU with CPU fallback.

## Milestones

1. Foundation: done (calibration, normalization, smoothing, overlay, demo mode, clip recorder).
2. Locomotion: done (march, high knees, lean steer, point turn, turn around, wave, locomotion state machine, build folder discovery, smoothing lag about 50 ms). Step lift reads world landmarks; confirm on a real phone clip, and `march.liftSource: 'image'` is the fallback.
3. stomp-city on the engine.
4. Combat module.
5. manhattan-miles hookup.

## Working with Mark

- He tests on his phone and often works from mobile: keep replies short, lead with the answer, give committed recommendations rather than option menus.
- Decision logic and pseudocode as Python if/elif/else blocks with instructions in comments.
- No em dashes and no all-caps emphasis in docs or chat; sentence case.
- Do one milestone per session; stop and report when its done-when test passes.
