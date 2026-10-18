# body-arcade: notes for Claude

Mark's camera body-tracking fitness games for a phone or tablet. All games share one movement engine, rep-engine, in `engine/`. The full design spec (gestures, thresholds, state machines, API, milestones) is the "rep-engine spec" doc: https://claude.ai/code/artifact/a394f929-94ab-43c0-b06c-4d4b2cc50559. Read it before starting a milestone.

## Hard constraints

- Phone or iPad only, no accessories. TV mirroring is a bonus, never required.
- Default play space: living room preset, phone propped about 4 ft away, knees-up framing (ankles not required).
- Every game ships as one self-contained HTML file and has a touch demo mode that emits the same events as the camera.
- Games are fitness first: every concept names its S&C payoff, matches the sport's work-to-rest rhythm, and keeps sessions to 10 to 20 minutes.
- Repo, file and game names stay neutral and fitness oriented.

## Design philosophy: honest reps

Every game in the arcade follows this, and it overrides game-specific habits. In one line: every rep counts, better reps count more, and the scoreboard doesn't lie. A minimum honest rep always works, so anyone can play; more effort always pays more, so the people who push get rewarded for it. Nothing is handed out for showing up.

This is a coaching principle, not a social message: write it and voice it the way a good strength coach runs a room. Two jobs, never mixed up: encourage effort out loud, keep the scoreboard honest. The coach is loud and warm during the work and honest about the numbers; encouragement is free, rewards are earned. No slogans, no preaching, never scold.

Encouraging (the voice):

- Cheer effort as it happens, specifically: "Knees up, there it is", "Good depth", "That's work", "Stay with it". Name the rep the player just did; never mock or joke at low effort.
- Pushing through counts. Finishing an interval, holding on in the last minutes, and showing up for a full session get a plain coach line ("20 minutes of work. That counts."). That is acknowledgment, not a prize: no points, badges or grades for it.
- Frame everything forward. Lead with the work done, then the cue: "12 minutes in. Knees are dropping, take 60 seconds and come back strong," not "74% of your early effort".
- Show progress as something to chase: a best to beat, a streak, how close the last effort came.

Accessible (the floor):

- The floor is the player's own weakest honest rep, found in the warm-up (including an easy, tired-pace round), never a fixed athletic standard. A tired rep late in the session still counts.
- Above the floor, the move scales with effort, smoothly and with no cliff: higher, faster, deeper, farther all give more in the game.
- Winning is never punished. Beating an obstacle costs little or nothing, so a great run can keep going.
- Precision that a camera or a tired body can't deliver is automated (paths, aiming, generous timing windows). The player supplies effort and decisions, not fine control.
- Every detector that a game rewards should report a magnitude, not just a yes: the engine already does this with `stride`, `bound` { dist, ms }, strike `power` and shot `power`.

Honest (the scoreboard):

- Minimum reps keep you playing; quality reps win. Wins, sacks, combos, grades, stars, records and bonuses need real quality, never just time spent or reps attempted. No grade inflation and no prize for showing up, but every honest minute still earns some progress (XP and the like), so the effort line between a tired minute and a great one is a gentle slope, not a cliff (about half of the top, not a third).
- Summaries lead with the work done (time, reps, distance, intervals finished), then the highlights and bests, then one forward cue. Early vs late quality is shown as "held strong for the first 10 minutes" or a best to chase, not as a percentage grade.
- Fatigue is information, not failure. When quality drops, respond the way a sideline would (rotate out, rest, go again), credit the work first, and say what changed in one plain line. Never scold, never hide the drop, never make it sound like a grade.
- Measure against the player's own body: calibration and the warm-up set the range, so the bar is fitted, not lowered. Compare players only to their own history.
- Cap the top. Extra effort past the player's range earns a small capped bonus, so nobody is rewarded for unsafe, out-of-control reps.

```python
# how a game turns a detected move into a reward
if not detected:            # below the player's own floor: nothing happens, no penalty
    reward = 0
elif effort <= floor:        # an honest minimum rep (tired, small, slow) still works
    reward = base
else:                        # above it, more effort pays more, capped so it never breaks the game
    reward = base + gain * min(effort - floor, cap)
# never subtract for success: beating a defender, a block, or a level costs little or nothing
```

Homecoming Hero is the reference: knee height and cadence set speed (a tired jog still runs), bound distance and speed set the juke (1.2 to 2.6 yards), squat depth sets truck power and the pass pro anchor, and a deep squat into a pile allows a breakout.

## Layout and build

- `engine/`: plain scripts, each an IIFE that adds to `globalThis.RepEngine`. Load order is `engine/manifest.json`. No ES module syntax and no `</script` anywhere in engine source (the build inlines it).
- `lab/`: engine test bench. `build/build.mjs` inlines the engine into `lab/index.html` and writes `dist/lab.html`. Commit `dist/`; GitHub Pages serves it at `https://hungkach.github.io/body-arcade/dist/lab.html`.
- Games live in their own repos (`hungkach/stomp-city`, `hungkach/manhattan-miles`, `hungkach/homecoming-hero`), each with a locked copy of `engine/` and `scripts/update-engine.mjs` to take a newer one (Homecoming Hero is the exception for now: its own tracker, see milestone 6). Do not add game folders here. Engine changes never reach a game until that game's repo runs its update script, so note in your report which game repos should update and why.
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
2. Locomotion: done (march, high knees, torso turn steering with lean kept as a signal, point turn, turn around, wave, locomotion state machine, smoothing lag about 50 ms, demo button choice). Both game repos should run their update script to take it.
   Engine 0.3.0: the first real-phone test missed marching, so steps now use a four-cue trigger after Homecoming Hero's (thigh angle and knee height from world landmarks, knee rise and lead from the image, 2 of 4, per-knee visibility) plus warm-up tuning (`capture_start`, `capture_stop`, `apply_capture`; tuned cues live in the profile). Also: `tv` preset (back camera, ultra-wide or widest zoom, front fallback; `engine.camera()`), rails points wait for the next intersection (`locomotion().queued`), `set_facing`, `speech: false`, `DebugOverlay` `{ panel: false }`, and the overlay no longer stalls printing a finished recording. Still to confirm on a real phone clip. manhattan-miles takes it first; stomp-city should update too.
3. Stomp City needs: stomp detector (strikes landed in milestone 4); then update the stomp-city repo's engine.
4. Combat module: done, engine 0.4.0 (`engine/combat.js`). Guard, stance, strikes (jab and cross by stance, hook, uppercut, down) from the 3D arm pose in a camera-facing frame learned at calibration, gated on the hand starting at the guard; slip; squat and drive up; the fight machine (`RE.Combat`: standing, shot, top); `engine.arms()` for mirroring. Mark's calls: no kicks, no duck (squat means only the double leg), automatic lock-on and range, slip, march to press, high knees to escape. Elbow and wrist world landmarks keep following MediaPipe at low visibility (`smoothing.worldFollow`). manhattan-miles takes it next for its fight mode; stomp-city gets strikes too.
   Engine 0.4.2, after the first real phone fight (no punches, no level changes): the combat detectors no longer pause when the knees or hips drop out of view, only when the shoulders do (`ctx.upperLow`); the level change reads the hips, or the shoulders when the hips are hidden (`signals.levelDrop`, `cal.shoulderBaseY`), and is a bit easier (squat 0.3 T, drive up 0.2 T within 600 ms, shot 1000 ms); straights need a little less reach (0.5, 0.15 m).
   Engine 0.5.0, Mark's takedown rework after his camera test (a fast drive up that then had to hold a half squat felt strange): the squat is the level change and holding it (`level_low`) sprawls their shot; a drive up out of a squat, however long it was held, is the shot ('shot', then the `drive` phase); a hop above standing height ('jump') within 300 ms adds power; power comes from the rise speed. The game's `target.shot({ power, speed, jumped })` decides takedown or 'stuffed' (an opponent expecting the shot stuffs a weak one); top is a timed ground and pound burst of 2 to 5 s by power, then 'scramble'. Demo: squat holds 1.5 s, new jump button. 0.5.1: drive up speed is measured over the rise itself (it was averaged over the held squat), shot power 1 at 2 T/s. manhattan-miles takes it first; stomp-city has no fights yet.
   Engine 0.5.2: point, turn around and wave pause only when the shoulders are unseen (`ctx.upperLow`), not the knees; they failed with the knees out of view, like the fight detectors before 0.4.2. Both game repos should take it (manhattan-miles uses waves for its phone menu). 0.5.3: demo wave buttons (`wave_left`, `wave_right`) emit the camera's `wave` event.
   Engine 0.6.0, from Mark's camera test (hooks and uppercuts landed, straights did not; tired knees stopped counting): arm depth from foreshortening (`ArmDepth` in combat.js: MediaPipe squashes world depth toward the camera, so the elbow and wrist get back the depth the image's shortened arm implies, against each segment's recent longest length, with a perspective correction from `combat.depth.fovDeg`); straights now register on clips with world depth squashed to 30% in every framing, and `engine.arms()` shows the extension. Per-hand guard signals `guard_left`, `guard_right` (a hand by the ear covers that side). Stride from knee height (`march.stride`, signal `stride`): locomotion speed is cadence times stride, low knees step shorter, high knees longer; step thresholds and warm-up tuning are more forgiving (pitch 20, lift 0.12, rise 0.12, lead 0.11, tuneFrac 0.4). manhattan-miles takes it first; stomp-city should take the stride and step changes.
   Engine 0.6.1, robustness across bodies: `test/bodies.test.mjs` runs every gesture and a fight combination for eight builds (`BODIES` in synth.mjs: short, tall, broad, narrow, long and short arms, long legs, long torso) in three framings. It found two failures, now fixed: a wave whose hand leaves the frame (tall or long-armed players near the camera) now follows MediaPipe's off-frame estimate (`wristAt`), and strike thresholds in meters scale down with a shorter arm (`armScale` from `ArmDepth`). Both game repos should take it.
   Engine 0.6.2, from Mark's iPad test (raising or waving a hand turned him): a wrist above its shoulder by `wave.minAbove` switches off steering and lean, and for `lean.raisedHoldMs` (600 ms) after it comes down; a wave held during a torso turn does not steer. Both game repos should take it.
   Engine 0.7.0, Mark's call after his 10/16 test (the squat is the level change, the jump is the takedown): `combat.fight.requireJump` (off by default; games turn it on with `create({ config })`): a drive up is silent, a jump within `requireJumpWaitMs` (500) of it is the 'shot', resolved at once, and no jump is a 'level_change'. manhattan-miles turns it on.
   Engine 0.8.0, Mark's 10/17 notes: a hook from the rear hand is 'overhand' (`strike.overhand`); a bound out to one side and back (hip midpoint from its calibrated middle, `combat.bound`) is 'bound' { side, dist, ms }, for shifts (an angle and a short burst of free shots); demo buttons `overhand`, `bound_left`, `bound_right`. manhattan-miles takes it; stomp-city has no strikes yet.
   Engine 0.8.1 (Mark: a jump without a deep enough squat must not take them down): tests confirm a hop from standing or a shallow dip is only a 'jump', never a shot (the shot needs a 'squat' past `level.squat`, then the drive up, then the jump); the demo Jump button now shoots only out of a held Squat. manhattan-miles takes it.
   Engine 0.8.2 (Mark: the warm-up stopped seeing his shoulder turns): 0.6.2's raised-hand steering cutoff also fired for hands up in a guard by the face. Now a raised wrist counts only when it is out at or past its shoulder along the shoulder line in the world landmarks (`lean.raisedOut`), so a turned torso does not swing a guard hand outward; `moves.highGuard` and a test (guard up, turned, still steers). Both game repos should take it.
5. Manhattan Miles hookup: move its in-game locomotion onto the engine state machine, in the manhattan-miles repo.
6. Homecoming Hero joins the arcade (a first-person running back game: high knees to run, bound to juke, squat to truck, an arm out to stiff arm, a squat hold for pass pro). For now it keeps its own tracker, `body core v0.6`, inside its single `index.html`; it predates rep-engine, and rep-engine's step trigger came from it. Moving it onto rep-engine is a later milestone: map its events (step with knee height, hop, level, duck, raise, jump) to the engine's and keep its effort rewards.

## Working with Mark

- He tests on his phone and often works from mobile: keep replies short, lead with the answer, give committed recommendations rather than option menus.
- Decision logic and pseudocode as Python if/elif/else blocks with instructions in comments.
- No em dashes and no all-caps emphasis in docs or chat; sentence case.
- Do one milestone per session; stop and report when its done-when test passes.
