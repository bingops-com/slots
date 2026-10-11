
// La liste des jeux : ce que les pages ont besoin d'en savoir sans charger leur scène.
export interface Game {
  id: string;
  // online : une partie commune à plusieurs joueurs, en classé seulement
  kind: 'slot' | 'table' | 'online';
  name: string;
  icon: string; // son icône, en HTML
  blurb: string;
  board?: string; // jeu dont il partage le tableau des gains, s'il n'a pas le sien
}

// Chaque jeu a son icône dessinée : le personnage d'une machine, l'objet d'une table.
export const pic = (path: string) => `<img class="ic pic" src="/art/${path}.webp" alt="">`;

export const GAMES: Game[] = [
  { id: 'bass', kind: 'slot', name: 'Big Catch', icon: pic('bass/fisherman'), blurb: 'Dix lignes et une pêche aux gros en tours gratuits' },
  { id: 'beard', kind: 'slot', name: 'Barbe-Rouge', icon: pic('beard/captain'), blurb: 'Des cascades qui doublent le multiplicateur' },
  { id: 'bounty', kind: 'slot', name: 'Mort ou Vif', icon: pic('bounty/outlaw'), blurb: 'Des duels qui couvrent un rouleau, et trois bonus' },
  { id: 'neptune', kind: 'slot', name: 'Neptune', icon: pic('neptune/scatter'), blurb: 'Huit symboles pareils paient, des orbes multiplient' },
  { id: 'reef', kind: 'slot', name: 'Le Récif', icon: pic('reef/s1'), blurb: 'Des chutes en cascade et des bulles à multiplicateur' },
  { id: 'dogs', kind: 'slot', name: 'Chiens de bord', icon: pic('dogs/dog4'), blurb: 'Vingt lignes et des niches wild qui restent en place' },
  { id: 'blackjack', kind: 'table', name: 'Blackjack', icon: pic('nav/cards'), blurb: 'Battez le croupier, blackjack payé 3 pour 2' },
  { id: 'bjtable', kind: 'online', name: 'Blackjack à plusieurs', icon: pic('nav/dealer'), blurb: 'Cinq places, une donne commune, chacun son tour', board: 'blackjack' },
  { id: 'holdem', kind: 'online', name: "Texas hold'em", icon: pic('nav/chips'), blurb: 'Six places, sans limite, face aux personnages de la maison' },
  { id: 'roulette', kind: 'table', name: 'Roulette', icon: pic('nav/wheel'), blurb: 'Roulette européenne, un seul zéro' },
  { id: 'dice', kind: 'table', name: 'Dés', icon: pic('nav/dice'), blurb: 'Vous fixez le seuil, donc le risque et le gain' },
  { id: 'mines', kind: 'table', name: 'Mines', icon: pic('nav/clam'), blurb: 'Ramassez les gemmes, encaissez avant la mine' },
  { id: 'plinko', kind: 'table', name: 'Plinko', icon: pic('nav/plinko'), blurb: 'Une perle, des plots, et les bords qui paient gros' },
  { id: 'crash', kind: 'table', name: 'Crash', icon: pic('ui/sub'), blurb: 'Plongez, remontez avant que la coque ne cède' },
];
export const byId = (id: string) => GAMES.find((g) => g.id === id);
