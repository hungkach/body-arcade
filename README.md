# body-arcade

Camera body-tracking fitness games for a phone or tablet, built on one shared movement engine (rep-engine). No accessories; the living room preset is a phone propped about 4 ft away with knees-up framing.

## Layout

| Folder | What it is |
| --- | --- |
| `engine/` | rep-engine: camera, MediaPipe Pose, calibration, body-unit signals, demo mode, recorder, debug overlay |
| `lab/` | Engine test bench: start the camera, calibrate, watch the signals, record and replay clips |
| `build/` | Inlines `engine/` into the lab page |
| `dist/` | Build output: `dist/lab.html`, ready to host |
| `test/` | Node tests, including the portrait vs landscape clip test |

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
await engine.calibrate();                // framing check, 3 s baseline, saved profile
engine.on('step', ({ leg }) => { ... }); // events
const s = engine.signals();              // lean, squat_depth, confidence, ... every frame
```

## Games

Each game lives in its own repo with a locked copy of this engine, and takes engine updates only when you run its update script:

| Game | Repo | Play |
| --- | --- | --- |
| Stomp City | [hungkach/stomp-city](https://github.com/hungkach/stomp-city) | https://hungkach.github.io/stomp-city/ |
| Manhattan Miles | [hungkach/manhattan-miles](https://github.com/hungkach/manhattan-miles) | https://hungkach.github.io/manhattan-miles/ |

In a game repo: `npm run update-engine ../body-arcade`, then `npm test` and a play-through before pushing. Edit the engine here, never the copies in game repos.

## Milestone status

1. Foundation: done. Calibration, normalization, smoothing, overlay, demo mode and clip recording.
2. Locomotion detectors (march, high knees, torso turn steering, point, turn around, wave): next.
3. Stomp City detectors (strikes, stomp) and wiring in the stomp-city repo.
4. Combat module.
5. Manhattan Miles hookup in the manhattan-miles repo.

## Testing on a phone

The camera needs https. Host `dist/lab.html` on any https static host, open it on the phone, tap Start camera, then Calibrate. Record a 30 s clip in portrait and another in landscape doing the same moves, starting each clip standing still, then replay both in the lab: the stats table should show matching lean, squat and knee numbers.
