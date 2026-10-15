# body-arcade

Camera body-tracking fitness games for a phone or tablet, built on one shared movement engine (rep-engine). No accessories; the living room preset is a phone propped about 4 ft away with knees-up framing.

## Layout

| Folder | What it is |
| --- | --- |
| `engine/` | rep-engine: camera, MediaPipe Pose, calibration, body-unit signals, demo mode, recorder, debug overlay |
| `lab/` | Engine test bench: start the camera, calibrate, watch the signals, record and replay clips |
| `stomp-city/` | Kaiju game (milestone 3) |
| `manhattan-miles/` | Open-world city game (milestone 5) |
| `build/` | Inlines `engine/` into one self-contained HTML file per game |
| `dist/` | Build output: `dist/<game>.html`, ready to host |
| `test/` | Node tests, including the portrait vs landscape clip test |

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
await engine.calibrate();                // framing check, 3 s baseline, saved profile
engine.on('step', ({ leg }) => { ... }); // events
const s = engine.signals();              // lean, squat_depth, confidence, ... every frame
```

Games include the engine with a `<!-- rep-engine:inline -->` placeholder in their `index.html`; the build step replaces it. Edit `engine/`, never the inlined copy in `dist/`.

## Milestone status

1. Foundation: done. Calibration, normalization, smoothing, overlay, demo mode and clip recording.
2. Locomotion detectors (march, high knees, lean, point, turn around, wave): next.
3. stomp-city on the engine.
4. Combat module.
5. manhattan-miles hookup.

## Testing on a phone

The camera needs https. Host `dist/lab.html` on any https static host, open it on the phone, tap Start camera, then Calibrate. Record a 30 s clip in portrait and another in landscape doing the same moves, starting each clip standing still, then replay both in the lab: the stats table should show matching lean, squat and knee numbers.
