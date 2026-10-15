# stomp-city

Kaiju smash fitness game, third person from behind the monster. Play: `https://hungkach.github.io/body-arcade/dist/stomp-city.html`

## Now playable (touch controls)

- March to walk the monster forward, lean to turn, jab or cross to smash what's in front, hook to swipe a wide arc, stomp to flatten everything nearby.
- Walking into a building still damages it.
- 3 rounds of 3 minutes. Each building dropped adds 1 s (2 s once the combo reaches 3), capped at 5 minutes a round. 60 s rest between rounds; the city regenerates each round.
- Summary names the S&C payoff: conditioning time, single-leg power from stomps, upper-body power from punches and hooks.

## Camera mode

Calibration and lean turning work now. Marching, punches and stomps on camera need the milestone 2 and 3 detectors; the game reads them through `engine.on('step' | 'strike' | 'stomp')`, so nothing here changes when they land.

## Engine needs from later milestones

- Detectors: `step`, `strike` (jab, cross, hook), `stomp`.
- A demo-mode option to choose which touch buttons show (this game hides the unused ones by button label for now).
