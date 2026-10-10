import bass from './bass.js';
import beard from './beard.js';
import bounty from './bounty.js';
import neptune from './neptune.js';
import reef from './reef.js';
import dogs from './dogs.js';
import blackjack from './blackjack.js';
import roulette from './roulette.js';
import dice from './dice.js';
import mines from './mines.js';
import crash from './crash.js';
import plinko from './plinko.js';
import bjtable from './bjtable.js';
import holdem from './holdem.js';

// Une scène de jeu se dessine elle-même dans l'élément qu'on lui donne ; mount peut
// rendre une fonction de nettoyage.
export interface Scene {
  mount(root: HTMLElement, active?: unknown): void | (() => void);
}

export const SCENES: Record<string, Scene> = { bass, beard, bounty, neptune, reef, dogs, blackjack, bjtable, holdem, roulette, dice, mines, crash, plinko };
