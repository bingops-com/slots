// La traduction anglaise. L'interface est écrite en français ; en anglais, chaque texte
// affiché est remplacé au moment où il entre dans la page, par une table de
// correspondances (textes fixes) et quelques règles (textes qui contiennent un nombre ou
// un nom). Un texte absent de la table reste en français : pour traduire un nouveau
// texte, on l'ajoute ici, sans toucher au composant qui l'affiche.
//
// Les règles détaillées des machines sont trop longues et trop découpées pour ce
// procédé : chaque machine porte les siennes dans les deux langues.

export type Lang = 'fr' | 'en';

const DICT: Record<string, string> = {
  // ----- navigation, barre du haut, compte -----
  Accueil: 'Home', Classement: 'Leaderboard', 'Machines à sous': 'Slots', 'Jeux de table': 'Table games', 'En ligne, à plusieurs': 'Online, multiplayer',
  Jeux: 'Games', Menu: 'Menu', 'Mode de jeu': 'Game mode', Classé: 'Ranked', Entraînement: 'Practice', 'Hors ligne, réessayer': 'Offline, retry',
  'À miser': 'To play', 'Sans enjeu': 'No stakes', 'hors classement': 'unranked', 'Remettre à 10 000': 'Reset to 10,000', 'Demander une avance': 'Ask for an advance',
  'Son activé': 'Sound on', 'Son coupé': 'Sound off', 'Se connecter': 'Log in', 'Se déconnecter': 'Log out', 'Créer un compte': 'Create an account',
  'Créer le compte': 'Create the account', "J'ai déjà un compte": 'I already have an account', Pseudo: 'Username', 'Mot de passe': 'Password',
  'Vous recevez 10 000 crédits fictifs à jouer, comme chaque joueur de la saison. Aucun argent réel.': 'You get 10,000 fictional credits to play with, like every player of the season. No real money.',
  'Vos parties classées reprennent où vous les avez laissées.': 'Your ranked games pick up where you left them.',
  "Jeu entièrement fictif. Les crédits n'ont aucune valeur : ils ne s'achètent pas et ne se retirent pas.": 'Entirely fictional game. Credits have no value: they cannot be bought or cashed out.',
  'Cette page n\'existe pas.': 'This page does not exist.', 'Revenir au classement': 'Back to the leaderboard',
  // ----- accueil -----
  'Le casino où rien ne se perd': 'The casino where nothing is lost',
  "Des machines à sous, des tables et des parties à plusieurs, pour le classement et rien d'autre : les crédits sont fictifs, ils ne s'achètent pas et ne se retirent pas.":
    'Slots, tables and multiplayer games, for the leaderboard and nothing else: credits are fictional, they cannot be bought or cashed out.',
  'Jouer tout de suite': 'Play now', 'Voir la course': 'See the race', 'Comment ça marche': 'How it works',
  'Dix mille crédits pour tous': 'Ten thousand credits for everyone',
  'Chaque joueur reçoit la même dotation, au début de la saison ou le jour où il arrive.': 'Every player gets the same grant, at the start of the season or the day they arrive.',
  'Ce que vous gagnez est votre score': 'What you win is your score',
  "La dotation ne compte pas tant qu'elle n'est pas misée ; ce que vos mises rapportent, si.": 'The grant does not count until it is played; what your bets bring in does.',
  "Sans compte, on s'entraîne": 'Without an account, you practise',
  'Tous les jeux en solo se jouent aussi hors classement, sur votre appareil, même hors ligne.': 'Every solo game can also be played unranked, on your device, even offline.',
  'Trois machines, chacune avec son univers, ses tours gratuits et ses bonus.': 'Three machines, each with its own world, free spins and bonuses.',
  'En solo, contre la maison : une manche prend quelques secondes.': 'Solo, against the house: a round takes a few seconds.',
  "Une table commune, en classé : on s'y assoit avec un compte.": 'A shared table, ranked: you sit down with an account.',
  'La saison en cours': 'The current season', 'Le classement est une course : plus le score est haut, plus le bateau est loin.': 'The leaderboard is a race: the higher the score, the further the boat.',
  'Voir tout le classement': 'See the full leaderboard',
  "Personne n'a encore joué cette saison : la première manche classée ouvre la course.": 'Nobody has played this season yet: the first ranked round opens the race.',
  "Le classement n'est pas disponible hors ligne.": 'The leaderboard is not available offline.',
  // ----- classement -----
  'Critère de classement': 'Ranking criterion', Score: 'Score', 'Plus gros multiplicateur': 'Biggest multiplier', 'Total misé': 'Total wagered',
  Rang: 'Rank', Joueur: 'Player', Manches: 'Rounds', 'Dotation restante': 'Grant left', Départ: 'Start', vous: 'you',
  "Le classement n'est pas disponible hors ligne. L'entraînement, lui, fonctionne : choisissez un jeu.": 'The leaderboard is not available offline. Practice still works: pick a game.',
  'Vous entrez au classement dès votre première manche classée.': 'You enter the leaderboard with your first ranked round.',
  'Créez un compte pour ouvrir la course, ou entraînez-vous sans enjeu.': 'Create an account to open the race, or practise with no stakes.',
  "Personne n'a encore joué cette saison. La première manche classée ouvre le classement.": 'Nobody has played this season yet. The first ranked round opens the leaderboard.',
  "Aucun joueur classé pour l'instant.": 'No ranked player yet.', 'Saisons précédentes': 'Past seasons', 'aucun joueur': 'no player',
  'Comment les points sont comptés': 'How points are counted',
  'Chaque joueur reçoit 10 000 crédits de dotation, au début de la saison ou le jour où il arrive.': 'Every player gets a grant of 10,000 credits, at the start of the season or the day they arrive.',
  "La dotation ne vaut rien tant qu'elle n'est pas misée. Ce que vos mises rapportent devient votre butin, et le butin est votre score.":
    'The grant is worth nothing until it is played. What your bets bring in becomes your loot, and the loot is your score.',
  'À sec, une avance de 1 000 crédits permet de rejouer. Elle est retirée du score.': 'When you are out, an advance of 1,000 credits lets you play on. It is taken off the score.',
  'Gros gains récents': 'Recent big wins', "Aucun gain de plus de dix fois la mise pour l'instant.": 'No win above ten times the bet yet.',
  // ----- page de jeu -----
  'Plein écran': 'Full screen', 'Quitter le plein écran': 'Leave full screen',
  "Entraînement : la partie se joue sur cet appareil, rien n'est envoyé au classement.": 'Practice: the game runs on this device, nothing is sent to the leaderboard.',
  'Créer un compte pour jouer en classé': 'Create an account to play ranked', 'Partie classée : chaque manche compte pour la saison.': 'Ranked game: every round counts for the season.',
  'Plus gros gains sur': 'Biggest wins on', 'Classement indisponible hors ligne.': 'Board unavailable offline.',
  "Aucun gain classé pour l'instant : le premier ouvre le tableau.": 'No ranked win yet: the first one opens the board.',
  "À l'entraînement, vos gains n'entrent pas au tableau.": 'In practice, your wins do not enter the board.',
  'Vous entrez au tableau dès votre premier gain classé.': 'You enter the board with your first ranked win.', 'Classement de la saison': 'Season leaderboard',
  // ----- commun aux jeux -----
  Mise: 'Bet', 'Diviser la mise par deux': 'Halve the bet', 'Doubler la mise': 'Double the bet', 'Animations rapides': 'Fast animations', Lancer: 'Spin',
  "La barre d'espace lance aussi un tour.": 'The space bar also spins.', 'Tours automatiques': 'Autoplay', 'Nombre de tours automatiques': 'Number of automatic spins',
  'Dernier gain': 'Last win', aucun: 'none', 'Règles et table des gains': 'Rules and paytable', 'Gain du tour': 'Round win',
  'Acheter les tours gratuits': 'Buy the free spins', 'Acheter un bonus': 'Buy a bonus', "Confirmer l'achat": 'Confirm the purchase',
  'Tours restants': 'Spins left', 'Gain des tours gratuits': 'Free spins win', 'Gain du bonus': 'Bonus win',
  'Gros gain': 'Big win', 'Très gros gain': 'Very big win', 'Gain énorme': 'Huge win', 'Gain colossal': 'Colossal win',
  'Il ne reste pas assez de crédits pour cette mise': 'Not enough credits left for this bet', 'Il ne reste pas assez de crédits pour cet achat': 'Not enough credits left for this purchase',
  'Il ne reste pas assez de crédits pour ces mises': 'Not enough credits left for these bets', 'Il ne reste pas assez de crédits pour cette cave': 'Not enough credits left for this buy-in',
  'Serveur injoignable': 'Server unreachable', 'Le serveur a refusé la demande': 'The server refused the request',
  '1 000 crédits avancés. Ils sont retirés de votre score.': '1,000 credits advanced. They are taken off your score.',
  'Hors ligne : vous passez en entraînement, rien ne compte pour le classement.': 'Offline: you are now practising, nothing counts for the leaderboard.',
  // ----- catalogue -----
  Dés: 'Dice', 'Blackjack à plusieurs': 'Multiplayer blackjack',
  'Dix lignes et une pêche aux gros en tours gratuits': 'Ten lines and a big catch in free spins', 'Des cascades qui doublent le multiplicateur': 'Cascades that double the multiplier',
  'Des duels qui couvrent un rouleau, et trois bonus': 'Duels that cover a reel, and three bonuses', 'Battez le croupier, blackjack payé 3 pour 2': 'Beat the dealer, blackjack pays 3 to 2',
  'Cinq places, une donne commune, chacun son tour': 'Five seats, one shared deal, each in turn', 'Six places, sans limite, face aux personnages de la maison': "Six seats, no limit, against the house's characters",
  'Roulette européenne, un seul zéro': 'European roulette, single zero', 'Vous fixez le seuil, donc le risque et le gain': 'You set the threshold, so the risk and the win',
  'Ramassez les gemmes, encaissez avant la mine': 'Collect the pearls, cash out before the mine', 'Une perle, des plots, et les bords qui paient gros': 'One pearl, pegs, and edges that pay big',
  'Plongez, remontez avant que la coque ne cède': 'Dive, surface before the hull gives way',
  // ----- Big Catch -----
  'Dix lignes, des poissons à ramasser en tours gratuits, jusqu\'à 2 100 fois la mise.': 'Ten lines, fish to collect in free spins, up to 2,100 times the bet.',
  '10 tours gratuits': '10 free spins', '9 à 27 tours gratuits': '9 to 27 free spins', 'La pêche compte': 'The catch counts', 'Dynamite : des poissons apparaissent': 'Dynamite: fish appear',
  'Le pêcheur ramasse': 'The fisherman collects', 'On plonge : chaque pêcheur ramasse les poissons': 'Down we go: every fisherman collects the fish', '10 tours de plus': '10 more spins',
  // ----- Barbe-Rouge -----
  "Des cascades qui doublent le multiplicateur à chaque gain, jusqu'à 20 000 fois la mise.": 'Cascades that double the multiplier with every win, up to 20,000 times the bet.',
  'Mise dorée : moitié plus cher, bonus deux fois plus fréquent': 'Golden bet: half as much again, bonus twice as often', '7 tours gratuits': '7 free spins',
  '7, 10 ou 13 tours gratuits, tirés à la roue': '7, 10 or 13 free spins, drawn on the wheel', "À l'abordage": 'All aboard', 'Combien de tours gratuits ?': 'How many free spins?',
  'tours gratuits': 'free spins', 'Le gros lot de la roue': "The wheel's top prize", 'Belle prise': 'Nice catch', "C'est parti": 'Off we go',
  // ----- Mort ou Vif -----
  "Des duels qui couvrent un rouleau et multiplient jusqu'à 100 fois, trois bonus, jusqu'à 12 500 fois la mise.": 'Duels that cover a reel and multiply up to 100 times, three bonuses, up to 12,500 times the bet.',
  'Le Galion': 'The Galleon', "Duel à l'aube": 'Duel at dawn', 'La Main du mort': "The Dead Man's Hand", GALION: 'GALLEON', AUBE: 'DAWN', MAIN: 'HAND',
  'Dix tours : chaque wild reste en place': 'Ten spins: every wild stays in place', 'Dix tours chargés de duels': 'Ten spins loaded with duels',
  'Ramassez wilds et multiplicateur, puis trois tours pour les jouer': 'Collect wilds and a multiplier, then three spins to play them',
  'Tours avant la fin': 'Spins before the end', 'Wilds ramassés': 'Wilds collected', Multiplicateur: 'Multiplier', 'Tous les gains': 'Every win',
  'La collecte : chaque prise remet le compteur à 3': 'The collection: every catch resets the counter to 3', 'Trois tours pour les jouer': 'Three spins to play them',
  // ----- Neptune, Le Récif, Chiens de bord -----
  'Le Récif': 'The Reef', 'Chiens de bord': "Ship's Dogs", 'Huit symboles pareils paient, des orbes multiplient': 'Eight matching symbols pay, orbs multiply',
  'Des chutes en cascade et des bulles à multiplicateur': 'Tumbling wins and multiplier bubbles', 'Vingt lignes et des niches wild qui restent en place': 'Twenty lines and kennel wilds that stay in place',
  "Huit symboles pareils paient où qu'ils soient ; des orbes multiplient jusqu'à 500 fois, jusqu'à 5 000 fois la mise.": 'Eight matching symbols pay wherever they are; orbs multiply up to 500 times, up to 5,000 times the bet.',
  "Huit symboles pareils paient où qu'ils soient ; en tours gratuits, des bulles multiplient jusqu'à 100 fois, jusqu'à 21 100 fois la mise.": 'Eight matching symbols pay wherever they are; in free spins, bubbles multiply up to 100 times, up to 21,100 times the bet.',
  "Vingt lignes, des niches wild qui multiplient et restent en place en tours gratuits, jusqu'à 6 750 fois la mise.": 'Twenty lines, kennel wilds that multiply and stay in place in free spins, up to 6,750 times the bet.',
  'Mise ante : un quart plus cher, tours gratuits deux fois plus fréquents': 'Ante bet: a quarter more, free spins twice as often',
  "Les multiplicateurs s'accumulent": 'Multipliers add up', 'Les multiplicateurs entrent en jeu': 'Multipliers come into play', 'Multiplicateur total': 'Total multiplier',
  '5 tours de plus': '5 more spins', 'Niches en place': 'Kennels in place', '15 tours gratuits': '15 free spins',
  // ----- dés -----
  'Gain potentiel': 'Potential win', "La barre d'espace lance aussi les dés.": 'The space bar also rolls the dice.', 'Au-dessus de': 'Over', 'En dessous de': 'Under', 'Chance de gain': 'Win chance',
  // ----- blackjack -----
  Tirer: 'Hit', Rester: 'Stand', Doubler: 'Double', Séparer: 'Split', Distribuer: 'Deal', Croupier: 'Dealer', Vous: 'You',
  'Blackjack payé 3 pour 2, le croupier reste à 17': 'Blackjack pays 3 to 2, dealer stands on 17', 'À vous de jouer': 'Your move', 'Égalité, mise rendue': 'Push, bet returned', Perdu: 'Lost',
  // ----- blackjack à plusieurs -----
  Miser: 'Bet', 'Mise posée': 'Bet placed', 'Donne en cours': 'Deal in progress', 'Table complète': 'Table full', 'Place libre': 'Free seat', 'Donne terminée': 'Deal over',
  "En attente qu'un joueur mise": 'Waiting for a player to bet', 'Connexion à la table…': 'Connecting to the table…', 'Table injoignable, nouvel essai…': 'Table unreachable, retrying…',
  'Cinq places. La donne part douze secondes après la première mise. Vingt secondes pour jouer, sinon la main reste. Blackjack payé 3 pour 2, le croupier reste à 17.':
    'Five seats. The deal starts twelve seconds after the first bet. Twenty seconds to act, otherwise the hand stands. Blackjack pays 3 to 2, dealer stands on 17.',
  "La table à plusieurs se joue en classé, avec un compte. À l'entraînement, le": 'The shared table is played ranked, with an account. In practice,', 'blackjack en solo': 'solo blackjack', 'reste ouvert.': 'stays open.',
  'Créez un compte pour vous asseoir à la table': 'Create an account to sit at the table',
  // ----- roulette -----
  Jeton: 'Chip', 'Mise totale': 'Total bet', 'Lancer la bille': 'Spin the ball', 'Retirer les jetons': 'Clear the chips',
  'Un clic pose un jeton, un clic droit retire la mise de la case.': 'A click places a chip, a right click removes the bet from the square.',
  'Posez vos jetons sur le tapis': 'Place your chips on the layout', 'Posez au moins un jeton sur le tapis': 'Place at least one chip on the layout', 'Aucune mise gagnante': 'No winning bet',
  Pair: 'Even', Impair: 'Odd', Rouge: 'Red', Noir: 'Black',
  // ----- mines -----
  'Nombre de mines': 'Number of mines', 'Multiplicateur, puis à la prochaine perle': 'Multiplier, then with the next pearl', Commencer: 'Start', 'Révélez une case': 'Reveal a tile',
  'Choisissez le nombre de mines, puis commencez': 'Pick the number of mines, then start', 'Mine touchée, mise perdue': 'Mine hit, bet lost',
  // ----- plinko -----
  Risque: 'Risk', Faible: 'Low', Moyen: 'Medium', Élevé: 'High', Rangées: 'Rows', 'Lâcher une perle': 'Drop a pearl',
  "La barre d'espace lâche aussi une perle ; plusieurs peuvent tomber en même temps. Les cases du milieu rendent moins que la mise, celles des bords beaucoup plus.":
    'The space bar also drops a pearl; several can fall at once. The middle buckets return less than the bet, the edges far more.',
  'Choisissez le risque et les rangées, puis lâchez une perle': 'Pick the risk and the rows, then drop a pearl',
  // ----- crash -----
  'Remonter tout seul à': 'Surface automatically at', jamais: 'never', Plonger: 'Dive', 'en surface': 'at the surface',
  "La barre d'espace fait plonger, puis remonter. Une fois sur deux, la coque cède avant ×2.": 'The space bar dives, then surfaces. Half the time, the hull gives way before ×2.',
  'Misez, plongez, remontez avant que la coque ne cède': 'Bet, dive, surface before the hull gives way', 'En plongée : remontez quand vous voulez': 'Diving: surface whenever you like',
  // ----- hold'em -----
  'Cave (40 à 200 grosses blindes)': 'Buy-in (40 to 200 big blinds)', "S'asseoir": 'Sit down', 'Vos jetons': 'Your chips', 'Se coucher': 'Fold', Parole: 'Check', Suivre: 'Call',
  'Relancer à': 'Raise to', 'Montant de la relance': 'Raise amount', '½ pot': '½ pot', Pot: 'Pot', Tapis: 'All-in', Relancer: 'Raise', 'Quitter la table': 'Leave the table',
  'Blindes 0,50 / 1,00, sans limite. Vingt-cinq secondes pour jouer, sinon parole ou main couchée. La maison ne prélève rien ; ses personnages complètent la table.':
    'Blinds 0.50 / 1.00, no limit. Twenty-five seconds to act, otherwise check or fold. The house takes no rake; its characters fill the table.',
  "La table de poker se joue en classé, avec un compte : on y mise ses crédits contre d'autres joueurs.": 'The poker table is played ranked, with an account: you bet your credits against other players.',
  "En attente d'un joueur : asseyez-vous pour lancer la partie": 'Waiting for a player: sit down to start the game', 'La prochaine main arrive': 'The next hand is coming', 'Main terminée': 'Hand over',
  Donneur: 'Dealer', 'se couche': 'folds', parole: 'checks', suit: 'calls', relance: 'raises', tapis: 'all-in', 'petite blinde': 'small blind', 'grosse blinde': 'big blind',
  'Carte haute': 'High card', Paire: 'Pair', 'Deux paires': 'Two pair', Brelan: 'Three of a kind', Suite: 'Straight', Couleur: 'Flush', Full: 'Full house', Carré: 'Four of a kind', 'Quinte flush': 'Straight flush',
  'Avant le flop': 'Pre-flop', Tournant: 'Turn', Rivière: 'River', Abattage: 'Showdown',
  // ----- refus du moteur et du serveur -----
  'Mise invalide': 'Invalid bet', 'Solde insuffisant': 'Insufficient balance', 'Seuil invalide': 'Invalid threshold', 'Seuil hors limites': 'Threshold out of range', 'Paris invalides': 'Invalid bets',
  'Numéro invalide': 'Invalid number', 'Pari invalide': 'Invalid bet', 'Type de pari inconnu': 'Unknown bet type', 'Nombre de mines invalide': 'Invalid number of mines', 'Case invalide': 'Invalid tile',
  'Case déjà révélée': 'Tile already revealed', 'Action impossible': 'Action not possible', 'Une main est déjà en cours': 'A hand is already in progress', 'Aucune main en cours': 'No hand in progress',
  'Une partie est déjà en cours': 'A game is already in progress', 'Aucune partie en cours': 'No game in progress', 'Révélez au moins une case': 'Reveal at least one tile',
  "L'avance n'est proposée que lorsqu'il ne reste plus rien à miser": 'The advance is only offered when there is nothing left to play', 'Action inconnue': 'Unknown action', 'Requête invalide': 'Invalid request',
  'Achat inconnu': 'Unknown purchase', 'Une plongée est déjà en cours': 'A dive is already in progress', 'Aucune plongée en cours': 'No dive in progress',
  'Remontée automatique : entre 1,01 et 10 000': 'Automatic surfacing: between 1.01 and 10,000', 'Réglage de plinko inconnu': 'Unknown plinko setting',
  'La donne est en cours, attendez la suivante': 'The deal is in progress, wait for the next one', 'Votre mise est déjà posée': 'Your bet is already placed', 'La table est complète': 'The table is full',
  'Cave : entre 40 et 200 grosses blindes': 'Buy-in: between 40 and 200 big blinds', 'Vous êtes déjà assis': 'You are already seated', "Ce n'est pas votre tour": 'It is not your turn',
  'Il y a une mise à suivre': 'There is a bet to call', 'Rien à suivre': 'Nothing to call', 'Relance invalide': 'Invalid raise', 'Connexion requise': 'Login required',
  'Pseudo : 3 à 16 caractères (lettres, chiffres, _ et -)': 'Username: 3 to 16 characters (letters, digits, _ and -)', 'Mot de passe : 8 caractères minimum': 'Password: at least 8 characters',
  'Ce pseudo est déjà pris': 'This username is taken', 'Pseudo ou mot de passe incorrect': 'Wrong username or password', 'Trop de tentatives, réessayez plus tard': 'Too many attempts, try again later',
  'Trop de manches à la fois, ralentissez': 'Too many rounds at once, slow down', 'Erreur interne': 'Internal error',
};

const plural = (n: string | number) => (Number(String(n).replace(/\s/g, '')) > 1 ? 's' : '');
const ordinal = (n: string) => `${n}${n.endsWith('1') && n !== '11' ? 'st' : n.endsWith('2') && n !== '12' ? 'nd' : n.endsWith('3') && n !== '13' ? 'rd' : 'th'}`;

// Textes à trous. $1, $2… reprennent les morceaux capturés.
const RULES: [RegExp, string | ((...m: string[]) => string)][] = [
  [/^Classement de la saison (\d+)$/, 'Season $1 leaderboard'], [/^En tête de la saison (\d+)$/, 'Leading season $1'], [/^Classement de (.+)$/, '$1 board'],
  [/^Vous êtes (\d+)(?:er|e) sur (\d+), avec (.+)\.$/, (_, r, n, s) => `You are ${ordinal(r)} of ${n}, with ${s}.`],
  [/^(\d+) joueurs? en course\. Créez un compte pour (?:les|le) rejoindre, ou entraînez-vous sans enjeu\.$/, (_, n) => `${n} player${plural(n)} in the race. Create an account to join, or practise with no stakes.`],
  [/^Saison (\d+) : (.*)$/, 'Season $1: $2'], [/^Saison (\d+), en fois la mise\.$/, 'Season $1, in times the bet.'],
  [/^a gagné (.+), soit (.+) fois sa mise$/, 'won $1, that is $2 times the bet'],
  [/^([\d\s]+) manches jouées, pas encore de gain\.$/, '$1 rounds played, no win yet.'], [/^Vous êtes (\d+)(?:er|e), avec (.+)\.$/, (_, r, m) => `You are ${ordinal(r)}, with ${m}.`],
  [/^Le jeu n'a pas pu démarrer :$/, 'The game could not start:'],
  [/^(.+) fois la mise$/, '$1 times the bet'], [/^Lancer pour (.+)$/, 'Spin for $1'], [/^Arrêter \((\d+) restants?\)$/, 'Stop ($1 left)'], [/^(\d+) fois$/, '$1 times'],
  [/^(\d+) lignes? gagnantes? :$/, (_, n) => `${n} winning line${plural(n)}:`], [/^(\d+) pêcheurs ramassent$/, '$1 fishermen collect'],
  [/^(\d+) tours gratuits$/, '$1 free spins'], [/^La pêche compte maintenant (\d+) fois$/, 'The catch now counts $1 times'], [/^gagnés en (\d+) tours gratuits$/, 'won in $1 free spins'],
  [/^Saut de multiplicateur : (.+)$/, 'Multiplier jump: $1'], [/^(\d+) tours gratuits, le multiplicateur ne redescend plus$/, '$1 free spins, the multiplier never goes back down'],
  [/^(\d+) lignes?(?:, jusqu'à (.+))? :$/, (_, n, m) => `${n} line${plural(n)}${m ? `, up to ${m}` : ''}:`], [/^(\d+) wilds? et (.+)$/, (_, n, m) => `${n} wild${plural(n)} and ${m}`],
  [/^gagnés avec (.+)$/, (_, b) => `won with ${DICT[b] ?? b}`],
  [/^([\d,]+) gagné$/, '$1 won'], [/^([\d,]+) perdu$/, '$1 lost'], [/^Gagné$/, 'Won'], [/^Récupéré$/, 'Returned'],
  [/^(\d+), (gagné|perdu|égalité|blackjack)$/, (_, n, r) => `${n}, ${{ gagné: 'won', perdu: 'lost', égalité: 'push', blackjack: 'blackjack' }[r]}`],
  [/^(\d+) à (\d+)$/, '$1 to $2'], [/^(\d+) mines? cachées?$/, (_, n) => `${n} hidden mine${plural(n)}`], [/^Encaisser$/, 'Cash out'], [/^Encaissé$/, 'Cashed out'],
  [/^(×[\d,]+) puis (×[\d,]+)$/, '$1 then $2'], [/^([\d,]+) puis ([\d,]+)$/, '$1 then $2'], [/^\((×[\d,]+)\)$/, '($1)'],
  [/^(×[\d\s,]+) : (gagné|mise rendue|rendu)$/, (_, m, r) => `${m}: ${{ gagné: 'won', 'mise rendue': 'bet returned', rendu: 'returned' }[r]}`],
  [/^Remonter$/, 'Surface'], [/^Remontée automatique à (.+)$/, 'Automatic surfacing at $1'],
  [/^La coque a cédé à (.+), par (.+) de fond : mise perdue$/, 'The hull gave way at $1, $2 down: bet lost'], [/^Remonté à (.+) :$/, 'Surfaced at $1:'], [/^\. La coque aurait cédé à (.+)\.$/, '. The hull would have given way at $1.'],
  [/^Les mises ferment dans (\d+) s(?:, (\d+) places? libres?)?$/, (_, s, n) => `Bets close in ${s} s${n ? `, ${n} free seat${plural(n)}` : ''}`],
  [/^À vous de jouer \((\d+) s\)$/, 'Your move ($1 s)'], [/^Au tour de (.+) \((\d+) s\)$/, "$1's turn ($2 s)"],
  [/^Suivre (.+)$/, 'Call $1'], [/^(.+) : à vous de jouer \((\d+) s\)$/, (_, st, s) => `${DICT[st] ?? st}: your move (${s} s)`], [/^(.+) : au tour de (.+)$/, (_, st, n) => `${DICT[st] ?? st}: ${n}'s turn`],
  [/^Vous gagnez$/, 'You win'], [/^(.+) gagne$/, '$1 wins'], [/^\((.+)\)$/, (_, h) => `(${(DICT[h.charAt(0).toUpperCase() + h.slice(1)] ?? h).toLowerCase()})`],
];

function translate(text: string): string {
  const core = text.trim();
  if (!core) return text;
  let out = DICT[core];
  if (out === undefined) {
    for (const [re, to] of RULES) {
      if (re.test(core)) {
        out = core.replace(re, to as string);
        break;
      }
    }
  }
  return out === undefined ? text : text.replace(core, out);
}

const ATTRS = ['placeholder', 'aria-label', 'title'];
// Le texte français d'origine de chaque nœud traduit, pour pouvoir revenir en arrière et
// reconnaître un texte que l'application vient de changer.
const source = new WeakMap<Node, { fr: string; en: string }>();
let lang: Lang = 'fr';
let observer: MutationObserver | null = null;

function text(node: Node) {
  const now = node.nodeValue ?? '';
  const known = source.get(node);
  const fr = known && known.en === now ? known.fr : now;
  const en = translate(fr);
  if (en !== fr) source.set(node, { fr, en });
  const want = lang === 'en' ? en : fr;
  if (want !== now) node.nodeValue = want;
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return text(root);
  if (!(root instanceof Element) || root.closest('script, style, [data-notranslate]')) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n: Node | null = root; n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) text(n);
    else for (const a of ATTRS) {
      const attr = (n as Element).getAttributeNode(a);
      if (attr) text(attr);
    }
  }
}

// Met la page dans la langue demandée, et la garde ainsi à mesure qu'elle change.
export function setLanguage(next: Lang) {
  lang = next;
  if (typeof document === 'undefined') return;
  document.documentElement.lang = next;
  walk(document.body);
  if (!observer) {
    observer = new MutationObserver((changes) => {
      for (const c of changes) {
        if (c.type === 'characterData') text(c.target);
        else if (c.type === 'attributes' && c.attributeName) {
          const attr = (c.target as Element).getAttributeNode(c.attributeName);
          if (attr) text(attr);
        } else c.addedNodes.forEach(walk);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
}

export const language = () => lang;
// Pour les rares textes choisis par le code plutôt que posés dans la page.
export const tr = (fr: string) => (lang === 'en' ? translate(fr) : fr);
