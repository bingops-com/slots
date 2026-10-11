---
name: labops-art-direction
description: Apply the lab.bingo art direction, a clean modern interface set in a maritime world with a pirate streak. Use when designing or restyling anything a player sees in slots (the leaderboard race, game stages, symbols, illustrations, mascot, favicon) or when writing its interface copy.
metadata:
  short-description: Follow the lab.bingo visual identity
---

# LabOps art direction

The theme is the world of piracy, applied to `lab.bingo`: a modern, uncluttered
interface that sails in maritime waters. The interface stays a tool first. The
sea is in the details and the pirate is in the wink.

Slots is one application of that world. The same direction is written for the
whole lab in the `labops` repository (`.agents/skills/labops-art-direction`) and
for the portal and the status page in their own; keep them in agreement on the
layers, the shared colours and the mascot. Use it together with the
`frontend-design` skill: that one asks for deliberate choices, this one says
which are already made.

Read `web/app/globals.css` before designing: its `:root` tokens are the only
source of the palette and type, in light and in dark. Reuse them; when a value
is missing, derive it with `color-mix` and add a token rather than a literal
colour. Every drawing lives in `web/lib/art.js`.

## Three layers

Keep these apart, in this order of priority.

1. **Interface: modern and sober.** Plain surfaces, legible type, slightly
   rounded shapes, generous spacing. Accent colours mark the important actions
   and states, and mean the same thing everywhere.
2. **World: maritime.** Compasses, ship's wheels, anchors, rhumb lines and
   sea-chart patterns, used as discreet background or small detail. The dot
   grid on every blue panel is the model: visible when looked for, silent
   otherwise.
3. **Signature: pirate.** Carried by names, illustrations and a few winks, not
   by the chrome. The eye patch is the recurring mark of the identity.

A casino pulls hard towards gold, neon, wood and treasure maps. Slots must never
turn into that set: no parchment, wood or rope textures, no gold or jewel
gradients, no blackletter or "treasure map" fonts, no pirate speech in labels,
buttons, errors or rules. Anything a player has to read to place a bet or
understand a result is written plainly, in French like the rest of the
interface. A game may carry a pirate name ("Barbe-Rouge") and a word of the sea
may name a thing when it still says what the thing is ("butin" for what the
bets have brought in).

## Shared with the other lab.bingo applications

| Role | Value |
| --- | --- |
| Sea blue (panels, primary action) | `#1443d6`, token `--sea` |
| Deep blue (end of the panel gradient) | `#0a2480`, token `--sea-deep` |
| Navy detail (eyes, patch, strokes on white) | `#0b2a94`, token `--navy` |
| Mint (collar, logo dot, a rare highlight) | `#8af2bf`, token `--mint` |

- Blue is the sea and the action colour. Pirate elements are drawn in navy, not
  black. Do not add another brand accent.
- Type: Red Hat Display for headings, Red Hat Text for body, as on the login
  page. Both are served from `public/fonts`; nothing is fetched from a CDN.
- Shape: 10px radius on fields and buttons, 14px on panels, 48px control
  height, a 3px focus ring.
- The lockup is the slots emblem (the cat's head in a ship's wheel, on a blue
  rounded tile, `art/brand/src/logo.png`) next to `lab.bingo slots`. The same
  emblem is the browser icon and the home-screen icon. The other lab.bingo
  applications keep the rounded-square "L" mark.

## Slots' own character

- **The race is the one bold element.** The leaderboard is a course on a blue
  band: one boat per player, further from the start line the higher the score.
  Boats sail from the line to their place once, when the page opens. Keep
  everything around it quiet and do not add a second decorative idea to the
  home page. Below the band the page is a record: rows separated by a hairline,
  no cards.
- **Settings on paper, play on the sea.** A game page has a plain panel for the
  bet and one blue panel, the stage, where the game happens. Everything drawn
  on a stage is white, with navy details.
- **Mint means "this one".** On a stage it marks winning cells, special symbols
  (wild, scatter) and the roulette zero; in the race it is the flag on the
  player's own boat. Nowhere else.
- Red and black belong to the cards and the roulette, not to the brand: tokens
  `--rouge` and `--noir` (a deep navy). A result is never told by colour alone:
  it has a word ("gagné", "perdu"), a full or hollow shape, or an amount.
- Each machine picks one maritime motif for the background of its stage (a
  swell for the fishing machine), at the opacity of the dot grid.
- Each machine owns an illustrated world, drawn as one family: a backdrop for
  the base game and another for free spins, its character standing under the
  grid, and its symbol set. Barbe-Rouge is a night at sea seen from the deck,
  under a moon that turns red; Big Catch is a morning at sea that dives under
  the surface. These illustrations are flat cartoon drawings (rounded shapes,
  no outline, no gradient, one shadow tone at most), generated then prepared by
  `art/build.py` from `art/<game>/src`. They keep the lab palette: the blues,
  white and pale blue, mint for the special symbols, and nothing gold, brown or
  textured. The interface around the stage stays as sober as everywhere else,
  and the navigation pictograms stay in SVG.
- Table games get the same treatment, without a colour of their own: each has
  a backdrop and a character or an object that carries it (`art/tables/src`).
  Blackjack is played in the captain's cabin, dealt by an octopus; the roulette
  wheel is a ship's helm on deck; a crab shakes the dice cup on the quay; Mines
  is a sea bed of clams, with a pearl or a sea mine inside; in Crash a
  submarine dives until its hull gives way. Cards and roulette
  keep `--rouge` and `--noir`.
- **One colour per machine, and only there.** Big Catch has the yellow of the
  fisherman's oilskin (`--oilskin`): the fisherman, the second word of the
  title, and the value of what he comes to collect. Mort ou Vif has the pink of dawn
  (`--dawn`): the duel symbol, its reel and its multiplier.
- **Red is Barbe-Rouge's, and only his.** Token `--beard`: his beard, the
  word "Rouge" in his title, the muzzle flash, the shot in play (the current
  multiplier) and the moon during free spins. No other machine and no part of
  the interface uses it.
- A game page has three columns on a wide screen: settings, stage, and the
  board of that game (the best win of each player, in times the bet). The
  stage takes the room; "Plein écran" leaves only the balance, the settings
  and the stage.
- Ranked play and practice look the same; only the top bar and one sentence say
  which one is running. Practice must keep working offline.
- Light and dark are both designed. Check every change in the two themes.

## Pages

The home page opens on one poster (the key art of a machine, darkened on the
side that carries the headline), states the rule of the place in three short
sentences, then shows the games by family as posters, and ends on the head of
the race. The leaderboard has its own page. On a phone the navigation folds
behind a three-line button. On a computer a machine fits the screen without
scrolling: when height is short, margins, subtitle and character shrink before
the grid does.

Copy is written in French; English is produced from it by `web/lib/i18n.ts`.
A new sentence needs its English there. Avoid sentences assembled from several
pieces in the markup: they translate badly.

## Mascot and illustrations

The mascot is a white cat with a mint collar and a navy eye patch over its left
eye (on the viewer's right), held by a thin diagonal strap. Keep those four
traits whenever the cat is drawn. It is white, so it always sits on blue: here
it sits at the foot of the navigation band (`web/components/Shell.tsx`), drawn like the
emblem: round head with a tuft, pale blue inside the ears, a determined brow, a round
medal on the collar. It blinks, twitches an ear and sways its tail. One cat per screen;
it is not a game symbol.

Symbols and pictograms (`Art` in `web/lib/art.js`) share one drawing on a 64
unit grid: flat white fills, no outline, no gradient, navy details, rounded
joins, and a mint ring only around a scatter. They are white, so outside a
stage they sit on a small blue tile. Pirate attributes are added one at a time
(the skull of the top symbol wears the patch), never as a full costume. A
symbol must be told from the others by its shape alone, at 40px.

## Motion

Reels, cascades and dealt cards answer the player's action and may be lively:
reels really scroll and bounce to a stop, a reel lingers when two scatters are
already down, fish values fly to the fisherman, the cannon fires the multiplier.
Each of these says what just happened in the game; none is there for mood.
A scene may breathe (the swell drifts, the captain blinks) and reacts to the
game: the deck shakes harder as the multiplier rises, the swell picks up
during free spins. Nothing else moves except the boats once and the cat's
blink and ear. No
animation delays a result the player is waiting for beyond what the "animations
rapides" setting allows, and every animation stops under
`prefers-reduced-motion: reduce`.

## Sound

Sounds are synthesised in the browser (`web/lib/sound.js`), never sampled or
taken from another game, so nothing is downloaded and practice still works
offline. Each one names an event, like the animations: reels ticking like a
capstan, a thud per stopped reel, the ship's bell for a scatter, a drum roll
while a reel teases, a cannon shot that grows with the multiplier, a drawn
blade for the wild, a jig on the concertina during free spins. One scale (D
minor pentatonic) for every win, so a rising multiplier is heard as a rising
phrase. There is no ambience: outside a bonus tune, nothing plays between two events. "Son activé / Son coupé" in the top bar
is remembered; a hidden tab is silent. Big Catch has its own voice on the same
engine: splashes, a reel being wound in, a rising note per fish caught, a
whistled tune in D major during free spins.

## Constraints

- The game is fictional and must keep saying so: credits are never shown with a
  currency sign, and nothing suggests buying or cashing out.
- Decoration never lowers text contrast and never overlaps a control.
- Assets are inline SVG, data URIs or files under `web/public/`. The service
  worker keeps every built file (`web/scripts/precache.mjs` lists them), so
  practice works offline; nothing may be loaded from another site.

## Before finishing

Start the server and look at the leaderboard and at one machine and one table
game, in light and dark, wide and on a phone, ranked and in practice. Stop the
server and reload: practice must still work. Would the page still read as a
modern tool with the decoration removed? Is the race still the only thing that
moves the eye on the home page? Is mint used only for "this one"? Then update
the "Apparence" section of `README.md` if what a player sees has changed.
