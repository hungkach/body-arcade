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
const engine = RepEngine.create({ video, preset: 'living_room' });
await engine.start();                    // camera + pose
await engine.calibrate();                // framing check, 3 s baseline, move test, saved profile
engine.set_movement({ rails: false });   // free movement: torso turn sets the turn rate
engine.on('step', ({ leg }) => { ... }); // also run_start, run_end, point, turn_around, wave
const s = engine.signals();              // cadence_spm, effort, speed, turn, lean, squat_depth, confidence
const m = engine.locomotion();           // state (idle, walk, run), speed, facing, lateral
```

Steering is a torso turn while still facing the screen: `turn` is -1 to 1, 0 inside 15 degrees, full at 45. Yaw comes from shoulder width over torso length against calibration (distance independent), direction from shoulder depth cross-checked with the nose. Lean is still measured but does not steer. On rails (`set_movement({ rails: true, at_intersection, branch_bearing })`) turn slides the player across the path and a point at an intersection takes that street. Speeds are in world units per second (walk 1.4, run 3.5 by default); games scale them.

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
3. Stomp City detectors (strikes, stomp) and wiring in the stomp-city repo.
4. Combat module.
5. Manhattan Miles hookup in the manhattan-miles repo.

## Testing on a phone

The camera needs https. Host `dist/lab.html` on any https static host, open it on the phone, tap Start camera, then Calibrate. Calibration ends with the move test (march, high knees, turn your body left and right, point left and right); Skip prompt moves past one that never registers. Profiles saved before milestone 2 are ignored, so calibrate again once.

Record a 30 s clip in portrait and another in landscape doing the same moves, starting each clip standing still, then replay both in the lab: the stats table shows lean, squat and knee numbers plus event counts (steps, runs, turns, points, turn arounds, waves) side by side, which should match.
