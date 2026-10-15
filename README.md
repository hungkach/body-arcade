# body-arcade

Camera body-tracking fitness games for a phone or tablet, built on one shared movement engine (rep-engine). No accessories; the living room preset is a phone propped about 4 ft away with knees-up framing.

## Layout

| Folder | What it is |
| --- | --- |
| `engine/` | rep-engine: camera, MediaPipe Pose, calibration, body-unit signals, locomotion detectors and state machine, demo mode, recorder, debug overlay |
| `lab/` | Engine test bench: start the camera, calibrate, watch the signals, record and replay clips |
| `stomp-city/` | Kaiju game (milestone 3) |
| `manhattan-miles/` | Open-world city game (milestone 5) |
| `build/` | Inlines `engine/` into one self-contained HTML file per game (any top-level folder whose `index.html` has the placeholder) |
| `dist/` | Build output: `dist/<game>.html`, ready to host |
| `test/` | Node tests: portrait vs landscape clip parity, locomotion acceptance checks on synthetic clips |

## Commands

```
npm run build   # writes dist/<game>.html
npm test        # builds, then runs every test in test/
```

No dependencies to install; Node 20 or newer.

## How a game uses the engine

```js
const engine = RepEngine.create({ video, preset: 'living_room' });
await engine.start();                    // camera + pose
await engine.calibrate();                // framing check, 3 s baseline, move test, saved profile
engine.set_movement({ rails: false });   // free movement: lean sets the turn rate
engine.on('step', ({ leg }) => { ... }); // also run_start, run_end, point, turn_around, wave
const s = engine.signals();              // cadence_spm, effort, speed, lean, squat_depth, confidence
const m = engine.locomotion();           // state (idle, walk, run), speed, facing, lateral
```

On rails (`set_movement({ rails: true, at_intersection, branch_bearing })`) lean slides the player across the path and a point at an intersection takes that street. Speeds are in world units per second (walk 1.4, run 3.5 by default); games scale them.

Games include the engine with a `<!-- rep-engine:inline -->` placeholder in their `index.html`; the build step replaces it. Edit `engine/`, never the inlined copy in `dist/`.

## Milestone status

1. Foundation: done. Calibration, normalization, smoothing, overlay, demo mode and clip recording.
2. Locomotion: done. March, high knees, lean steer, point turn, turn around, wave, the locomotion state machine, build folder discovery, smoothing lag cut to about 50 ms.
3. stomp-city on the engine: next.
4. Combat module.
5. manhattan-miles hookup.

## Testing on a phone

The camera needs https. Host `dist/lab.html` on any https static host, open it on the phone, tap Start camera, then Calibrate. Calibration ends with the move test (march, high knees, lean left and right, point left and right); Skip prompt moves past one that never registers. Profiles saved before milestone 2 are ignored, so calibrate again once.

Record a 30 s clip in portrait and another in landscape doing the same moves, starting each clip standing still, then replay both in the lab: the stats table shows lean, squat and knee numbers plus event counts (steps, runs, points, turn arounds, waves) side by side, which should match.
