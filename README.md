# body-arcade

Camera body-tracking fitness games for a phone or tablet, built on one shared movement engine (rep-engine). No accessories; the living room preset is a phone propped about 4 ft away with knees-up framing.

## Layout

| Folder | What it is |
| --- | --- |
| `engine/` | rep-engine: camera, MediaPipe Pose, calibration, body-unit signals, locomotion detectors and state machine, demo mode, recorder, debug overlay |
| `lab/` | Engine test bench: start the camera, calibrate, watch the signals, record and replay clips |
| `build/` | Inlines `engine/` into the lab page |
| `dist/` | Build output: `dist/lab.html`, ready to host |
| `test/` | Node tests: portrait vs landscape clip parity, locomotion acceptance checks on synthetic clips |

## Commands

```
npm run build   # writes dist/lab.html
npm test        # builds, then runs every test in test/
```

No dependencies to install; Node 20 or newer.

## How a game uses the engine

```js
const engine = RepEngine.create({ video, preset: 'living_room' }); // speech: false if the game voices its own prompts
await engine.start();                    // camera + pose
await engine.calibrate();                // framing check, 3 s baseline, move test, saved profile
engine.set_movement({ rails: false });   // free movement: torso turn sets the turn rate
engine.on('step', ({ leg }) => { ... }); // also run_start, run_end, point, turn_around, wave
const s = engine.signals();              // cadence_spm, effort, speed, turn, lean, squat_depth, confidence
const m = engine.locomotion();           // state (idle, walk, run), speed, facing, lateral, queued
// warm-up tuning: record the player's own steps, then set thresholds from them
engine.capture_start('step', 1); /* march */ engine.capture_stop();
engine.apply_capture();                  // {seen: {step}, cues}; saved with the profile
```

Steps use a four-cue trigger after Homecoming Hero's: thigh angle and knee height from 3D world landmarks, knee rise and knee lead from the 2D image, two of four to fire, with hysteresis and per-knee visibility (a hidden or badly read cue is unknown, not off). At default thresholds the 3D cues carry a march; the 2D cues mostly need warm-up tuning, because a camera near hip height foreshortens a knee coming toward it. `apply_capture()` sets each cue to half of the player's weakest captured round (bounded around the default) and keeps defaults for cues that never showed.

Presets: `living_room` (default, front camera, about 4 ft), `garage`, `custom`, and `tv` (back camera, ultra-wide lens or widest zoom, falling back to the main back camera and then the front camera; `engine.camera()` says which opened). `new RepEngine.DebugOverlay(canvas, engine, { panel: false })` draws just the stick figure, for a player-facing camera view.

Steering is a torso turn while still facing the screen: `turn` is -1 to 1, 0 inside 15 degrees, full at 45. Yaw comes from shoulder width over torso length against calibration (distance independent), direction from shoulder depth cross-checked with the nose. Lean is still measured but does not steer. On rails (`set_movement({ rails: true, at_intersection, branch_bearing })`) turn slides the player across the path and a point takes the next intersection's street: a point made mid-block waits (`locomotion().queued`), pointing the other way replaces it, turn around clears it, and `branch_bearing` returning null means no street that way. `set_facing(deg)` sets the heading, for example at the start of a walk. Speeds are in world units per second (walk 1.4, run 3.5 by default); games scale them.

## Games

Each game lives in its own repo with a locked copy of this engine, and takes engine updates only when you run its update script:

| Game | Repo | Play |
| --- | --- | --- |
| Stomp City | [hungkach/stomp-city](https://github.com/hungkach/stomp-city) | https://hungkach.github.io/stomp-city/ |
| Manhattan Miles | [hungkach/manhattan-miles](https://github.com/hungkach/manhattan-miles) | https://hungkach.github.io/manhattan-miles/ |

In a game repo: `npm run update-engine ../body-arcade`, then `npm test` and a play-through before pushing. Edit the engine here, never the copies in game repos.

## Milestone status

1. Foundation: done. Calibration, normalization, smoothing, overlay, demo mode and clip recording.
2. Locomotion: done. March, high knees, torso turn steering, point, turn around, wave, the locomotion state machine, smoothing lag cut to about 50 ms, demo button choice.
   Engine 0.3.0 (after the first real-phone test missed marching): four-cue step trigger and warm-up tuning, TV back-camera preset, rails points that wait for the next intersection, `set_facing`, `speech: false`, a stick-figure-only overlay, and the overlay no longer stalls on a finished recording.
3. Stomp City detectors (strikes, stomp) and wiring in the stomp-city repo.
4. Combat module.
5. Manhattan Miles hookup in the manhattan-miles repo.

## Testing on a phone

The camera needs https. Host `dist/lab.html` on any https static host, open it on the phone, tap Start camera, then Calibrate. Calibration ends with the move test (march, high knees, turn your body left and right, point left and right); Skip prompt moves past one that never registers. Profiles saved before engine 0.3.0 are ignored, so calibrate again once.

Record a 30 s clip in portrait and another in landscape doing the same moves, starting each clip standing still, then replay both in the lab: the stats table shows lean, squat and knee numbers plus event counts (steps, runs, turns, points, turn arounds, waves) side by side, which should match.
