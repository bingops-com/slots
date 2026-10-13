# slots

Machines à sous et jeux de table **entièrement fictifs** de `lab.bingo` : aucun
argent, des crédits qui ne s'achètent pas et ne se retirent pas, et un classement
par saison.

Un binaire Go sert l'API et l'interface Next.js embarquée. Les règles des jeux
n'existent qu'une fois, en Go : le serveur les joue pour les parties classées, et
le navigateur joue exactement le même code, compilé en WebAssembly, pour
l'entraînement hors ligne.

## Démarrer

```sh
make db      # un PostgreSQL local sur :5433, sans Docker ; à laisser tourner
make run     # construit tout, puis http://localhost:3777
make dev     # API sur :3777 et Next.js avec rechargement à chaud sur :3000
make check   # tests Go, go vet, vérification des types
make sim N=5000000   # taux de retour des machines, par simulation
make season  # clôt la saison et ouvre la suivante
```

Il faut Go (version de `go.mod`) et Node 20.9 ou plus récent. `make db` télécharge
PostgreSQL à la première utilisation et garde ses données dans `data/pg` ; les
tests démarrent le leur de la même façon, ou utilisent celui que désigne
`SLOTS_TEST_DATABASE_URL`.

Les régressions navigateur couvrent les 14 jeux, les affiches historiques,
les thèmes clair/sombre sur quatre formats d'écran, les fenêtres de connexion
(fermeture, Échap et clavier), le blackjack à plusieurs mains et l'entraînement
WASM hors ligne. Après `make web`, avec Chromium installé et une base de
développement dédiée, lancer :

```sh
SLOTS_DATABASE_URL=postgres://test:test@127.0.0.1:5433/slots_e2e CHROMIUM=/usr/bin/chromium bash web/e2e/check.sh
```

Ce test crée des comptes fictifs et joue des manches ; ne jamais lui fournir
la base de production. Le serveur temporaire écoute uniquement sur loopback et
s'arrête automatiquement. Les rapports et captures restent dans `/tmp/slots-regressions`
(modifiable par `SLOTS_E2E_REPORT_DIR`). La CI installe son Chromium et utilise
son PostgreSQL éphémère. La suppression du fond sonore de mer est conservée.

## Deux façons de jouer

- **Classé** : avec un compte. Chaque manche est tirée et enregistrée par le
  serveur, et compte pour la saison.
- **Entraînement** : sans compte, ou hors ligne. La partie se joue dans le
  navigateur, le portefeuille y reste, rien n'est envoyé au classement. Après une
  première visite, l'interface et le moteur sont gardés par un service worker :
  l'entraînement fonctionne sans réseau (sur `localhost` ou en HTTPS).

## Langues

L'interface est écrite en français et se lit aussi en anglais (bouton « English » de
la barre du haut ; choisi d'office quand le navigateur n'est pas en français). La
traduction est tenue dans `web/lib/i18n.ts` : une table de correspondances et quelques
règles pour les textes à nombres, appliquées à ce qui s'affiche. Un texte absent de la
table reste en français ; les règles détaillées des machines sont écrites dans les
deux langues. Les nombres gardent l'écriture française.

## Comment les points sont comptés

Chaque joueur reçoit 10 000 crédits de dotation, au début de la saison ou le jour
où il arrive. La dotation ne vaut rien tant qu'elle n'est pas misée : une mise
l'entame d'abord, et ce que les mises rapportent devient le butin. Le score est
le butin moins les avances reçues (1 000 crédits proposés quand il ne reste plus
rien à miser). Ne pas jouer rapporte donc zéro, et une avance ne fait jamais
remonter.

Trois classements de saison (score, plus gros multiplicateur, total misé) et un
tableau par jeu : le plus gros gain de chaque joueur, en fois la mise, affiché à
côté de la scène. `make season` archive le podium, redonne la même dotation à
tout le monde et vide les tableaux ; les parties en cours sont abandonnées.

## Jeux

| Jeu | Règles |
| --- | --- |
| Big Catch | Celles du Big Bass Bonanza d'origine : 5×3, 10 lignes, 10, 15 ou 20 tours gratuits pour 3, 4 ou 5 scatters, poissons porteurs de valeurs, pêcheur wild collecteur en tours gratuits seulement, paliers tous les 4 pêcheurs (×2, ×3, ×10), dynamite. Plafond 2 100 fois la mise. Un ajout : l'achat de 10 tours gratuits pour 100 fois la mise. |
| Barbe-Rouge | Celles de Barbarossa DoubleMax : 5×3, 243 façons, cascades qui laissent un wild, multiplicateur doublé à chaque cascade et conservé en tours gratuits, sauts de multiplicateur, mise dorée, achat du bonus (7 tours, ou 7, 10 ou 13 tirés à la roue). Plafond 20 000 fois la mise. |
| Mort ou Vif | Celles de Wanted Dead or a Wild : 5×5, 15 lignes, un duel qui s'étend en rouleau wild avec un multiplicateur de ×2 à ×100 (plusieurs s'additionnent), et trois bonus achetables : wilds qui restent en place, tours chargés de duels, collecte de wilds et d'un multiplicateur puis trois tours pour les jouer. Plafond 12 500 fois la mise. |
| Neptune | Celles de Gates of Olympus : grille 6×5, gains à partir de huit symboles où qu'ils soient, cascades, orbes multiplicateurs et 15 tours gratuits où leurs valeurs s'accumulent. Mise ante et achat du bonus. Plafond 5 000 fois la mise. |
| Le Récif | Celles de Sweet Bonanza : grille 6×5, gains à partir de huit symboles où qu'ils soient, cascades et 10 tours gratuits où les bulles multiplient chaque gain. Mise ante et achat du bonus. Plafond 21 100 fois la mise. |
| Chiens de bord | Celles de The Dog House : 5×3, 20 lignes, wilds multiplicateurs, 9 à 27 tours gratuits. Comme dans sa version Megaways, deux bonus au choix du joueur : les wilds restent en place, ou 1 à 4 wilds tombent à chaque tour puis repartent. Les deux rapportent autant en moyenne ; le second est plus régulier. Achat du bonus choisi pour 100 fois la mise. Plafond 6 750 fois la mise. |
| Blackjack | Sabot infini, croupier qui s'arrête à 17, doubler, séparer une fois, blackjack payé 3 pour 2. |
| Roulette | Européenne, un seul zéro. |
| Dés | Le joueur fixe le seuil ; 1 % d'avantage pour la maison. |
| Blackjack à plusieurs | Une table de cinq places, en classé seulement. Chaque place est un rond où l'on pose sa mise en le touchant ; un joueur peut en prendre plusieurs et joue alors plusieurs mains, de la première place à la dernière. La table attend une première mise et distribue dès que tous les joueurs présents ont demandé la donne, cinq secondes plus tard au plus ; chacun joue ensuite à son tour (cinq secondes, sinon la main reste), et le résultat reste cinq secondes sur le tapis. Mêmes règles que le blackjack en solo, sans la séparation. |
| Mines | 25 cases, 1 à 24 mines ; 1 % d'avantage pour la maison. |
| Texas hold'em | Une table de six places, sans limite, en classé seulement. On s'assoit avec une cave de 40 à 200 grosses blindes prise sur ses crédits, on repart avec ce qu'il reste. Des personnages de la maison, chacun avec son tempérament, complètent la table ; la maison ne prélève rien. |
| Plinko | Une perle tombe entre 8, 12 ou 16 rangées de plots vers une case à multiplicateur ; trois niveaux de risque. Chaque table rend environ 99 % des mises. |
| Crash | Le multiplicateur grimpe depuis ×1 et s'arrête à un point tiré d'avance et tenu secret ; il faut encaisser avant. La chance d'atteindre ×N est de 0,99 / N, soit 1 % d'avantage pour la maison. Encaissement automatique possible. Le temps qui compte est celui du serveur. |

Les noms, les dessins et les sons sont originaux. Les règles des cinq machines
sont celles des jeux dont elles s'inspirent, relevées sur des fiches publiques ;
leurs rouleaux n'étant pas publics, les fréquences sont réglées par simulation.
Mesures finales sur 8 à 20 millions de tours (`make sim`) :

| | Retour | Un gain tous les | Bonus tous les |
| --- | --- | --- | --- |
| Big Catch | 96,3 % | 7,7 tours | 113 tours |
| Big Catch, achat des tours gratuits | 87 % | | |
| Barbe-Rouge | 95 à 98 % | 4,6 tours | 229 à 231 tours |
| Mort ou Vif | 96,4 % | 5,0 tours | 263 tours |
| Mort ou Vif, bonus achetés | 93 à 97 % | | |
| Neptune | 96,2 % | 3,5 tours | 461 tours |
| Neptune, mise ante | 96,3 % | 3,6 tours | 207 tours |
| Neptune, achat des tours gratuits | 98 % | | |
| Le Récif | 97,1 % | 4,8 tours | 452 tours |
| Le Récif, mise ante | 97,4 % | 4,9 tours | 208 tours |
| Le Récif, achat des tours gratuits | 96,5 % | | |
| Chiens de bord | 96,3 % | 3,7 tours | 181 tours |
| Chiens de bord, pluie de niches | 96,6 % | 3,7 tours | 180 tours |
| Chiens de bord, achat des niches en place | 97,2 % | | |
| Chiens de bord, achat de la pluie de niches | 95,8 % | | |
| Barbe-Rouge, mise dorée | 92 à 96 % | 4,6 tours | 124 tours |
| Barbe-Rouge, achat de 7 tours | 87 à 96 % | | |
| Barbe-Rouge, achat à la roue | 92 à 98 % | | |

Le retour de Barbe-Rouge varie d'une simulation à l'autre : quelques gains
proches du plafond pèsent lourd. Un bonus acheté rend le plus souvent bien moins
que son prix, et rarement beaucoup plus.

## Configuration

| Variable | Rôle | Défaut |
| --- | --- | --- |
| `SLOTS_DATABASE_URL` | Base PostgreSQL : `postgres://utilisateur:motdepasse@hôte:5432/base` | requis |
| `SLOTS_ADDR` | Adresse d'écoute | `:3777` |
| `SLOTS_TRUST_PROXY` | `true` derrière un reverse proxy qui écrit `X-Forwarded-For` et `X-Forwarded-Proto` | |

Le schéma est créé et mis à niveau au démarrage. Ne mettez
`SLOTS_TRUST_PROXY=true` que si le serveur n'est joignable qu'à travers le proxy :
sinon un client choisit l'adresse sous laquelle il est compté.

## Mise en production

Le chart Helm `chart/` déploie le serveur et, par défaut, sa base PostgreSQL par
CloudNativePG :

```sh
helm upgrade --install slots chart --namespace slots --create-namespace \
  --set image.tag=<version> \
  --set ingress.enabled=true --set ingress.host=slots.example.org --set ingress.tlsSecretName=slots-tls
```

- **Base** : `database.cnpg.enabled` (par défaut) crée un `Cluster` CloudNativePG ;
  l'application lit l'URL de connexion dans le Secret que l'opérateur génère
  (`<nom>-postgresql-app`, clé `uri`). Pour une base existante, mettez-le à `false`
  et donnez `database.existingSecret.name`.
- **Sauvegardes** : `database.cnpg.backup.enabled` branche le plugin Barman Cloud
  sur un `ObjectStore` existant du namespace et ajoute une sauvegarde quotidienne.
  Les comptes et la saison ne sont nulle part ailleurs que dans cette base.
- **HTTPS** par l'ingress. Le cookie de session est alors marqué `Secure` et
  l'en-tête HSTS est envoyé (`trustProxy: true`).
- **Une seule instance**, remplacée et non doublée lors d'une mise à jour : la
  tables à plusieurs (blackjack, poker) et les limites de débit vivent dans la
  mémoire du processus. À l'arrêt, les mises et les jetons en jeu sont rendus ; un
  arrêt brutal les perd.
- **Sonde** : `GET /healthz` répond `ok` tant que la base répond.
- **Saison** : `kubectl exec deploy/slots -- /slots season`.

L'image (`docker build -t slots .`) ne contient que le binaire : distroless,
utilisateur non privilégié, système de fichiers en lecture seule.

Ce que le serveur fait déjà : mots de passe en Argon2id, session dans un cookie
`HttpOnly` et `SameSite=Strict` (30 jours, seul son condensé est stocké), refus
des requêtes d'une autre origine, limite de tentatives de connexion par adresse
et de manches par compte, corps de requête limité à 20 Ko, en-têtes de sécurité
(CSP sans ressource externe), arrêt propre, journal JSON d'une ligne par appel
d'API sans jamais le corps.

## API

- `POST /api/register`, `/api/login`, `/api/logout` : `{name, password}`.
- `GET /api/me` : portefeuille et parties en cours.
- `POST /api/dice`, `/api/roulette`, `/api/slots/bass`, `/api/slots/beard`,
  `/api/blackjack/start`, `/api/blackjack/action`, `/api/mines/start`,
  `/api/mines/reveal`, `/api/mines/cashout`, `/api/crash/start`, `/api/crash/poll`,
  `/api/crash/cashout`, `/api/advance` : une action de jeu ;
  la réponse contient le résultat et le portefeuille après la manche.
- `GET /api/leaderboard?type=score|multi|wagered`, `GET /api/leaderboard/{jeu}`,
  `GET /api/feed`.
- `GET /api/table`, `POST /api/table/bet`, `POST /api/table/action` : la table de
  blackjack à plusieurs.
- `GET /api/poker`, `POST /api/poker/sit`, `POST /api/poker/action`, `POST /api/poker/leave` :
  la table de Texas hold'em.
- `POST /api/plinko`, `POST /api/slots/bounty`.
- `GET /healthz`.

## Apparence

L'interface suit la direction artistique lab.bingo
(`.agents/skills/labops-art-direction`) : bleu mer, navy, une touche de menthe,
familles Red Hat, chat à cache-œil au pied de la bande de navigation. Le
classement est une course de bateaux sur une bande bleue ; chaque jeu se joue sur
un panneau bleu où tout est dessiné en blanc, entre ses réglages et le tableau du
jeu. « Plein écran » ne garde que le solde, les réglages et la scène. Thèmes
clair et sombre.

Le mode ne se choisit pas : avec un compte la partie est classée, sans compte ou
hors ligne on s'entraîne, et le libellé du solde le dit (« À miser » ou
« Entraînement »). Sur téléphone, la bande devient un en-tête qui reste en vue
(logo, solde, menu) ; le compte, la langue, le son et la navigation sont dans le
menu, et la scène vient juste dessous, suivie des réglages puis de « Remettre à
10 000 » (ou « Demander une avance ») et du plein écran. Les icônes sont dessinées pour le lieu : chaque jeu a la sienne dans la navigation (la pieuvre du blackjack à plusieurs, la barre-roulette, le coquillage des mines), le son est une cloche de bord, la langue un globe, le plein écran une longue-vue, et le crédit une pièce frappée d'une barre de navire. L'accueil occupe toute
la largeur de l'écran. Chaque jeu y a son affiche : une scène où son personnage ou son objet est en action (le duel de Mort ou Vif, la pieuvre qui distribue, le crabe qui lance les dés), préparée par `art/build.py`. Dans la navigation, chaque famille de jeux se replie sous
son titre, et le choix est retenu.

Sur la scène de chaque machine, une carte présente ses tours gratuits : le
symbole qui les déclenche, ce qu'ils ont de particulier, et leur achat (sur
Chiens de bord, le choix entre ses deux bonus). Elle
prend la couleur de la machine et laisse sa place au compteur pendant que les
tours se jouent.

Les machines proposent des tours automatiques (10 à 100, arrêt d'un clic ou dès
qu'un tour ne peut plus se jouer).

Chaque machine a son univers illustré, en dessin plat et dans la palette de la
maison : un décor pour le jeu normal, un autre pour les tours gratuits, son
personnage sous la grille et ses symboles. Barbe-Rouge est une nuit en mer vue du
pont, avec un rouge qui n'appartient qu'à lui ; Big Catch est un matin en mer qui
plonge sous la surface, avec le jaune du ciré du pêcheur ; Mort ou Vif est un port à
l'aube, avec le rose du petit jour ; Neptune règne sur une cité engloutie éclairée
par des orbes violettes ; Le Récif traverse un lagon turquoise peuplé de créatures
marines ; Chiens de bord installe son chenil sur le pont et réserve l'orange aux
médailles et aux multiplicateurs. Le logo (le chat dans
une barre de navire) vient de la même série. Les images sources sont dans
`art/*/src` ; `python3 art/build.py` les détoure et les convertit pour
`web/public`. Les jeux de table ont aussi leur décor et leur personnage : une
pieuvre croupière dans la cabine pour le blackjack, une roue en barre de navire
pour la roulette, un crabe et son cornet pour les dés, des coquillages à perle
ou à mine pour Mines, un sous-marin qui plonge jusqu'à l'implosion pour le Crash.

Les sons sont fabriqués dans le navigateur (aucun fichier) : cliquetis des
rouleaux, cloche des scatters, mèche puis coup de canon pour Barbe-Rouge ; gerbes
d'eau, moulinet et une note qui monte à chaque prise pour Big Catch ; un air par
machine pendant les tours gratuits, avec des voix propres aux cascades, aux orbes
et aux wilds collants. Aucun bruit de mer ni fond sonore ne joue entre les
actions ; les airs des bonus restent actifs pendant les tours gratuits.
« Son activé / Son coupé » se règle dans la
barre du haut. Sous la grille, le gain du tour s'additionne en grand et reste
affiché jusqu'au tour suivant.

## Organisation

- `cmd/slots` : le serveur, et les commandes `season` et `sim`
- `cmd/wasm` : le moteur d'entraînement pour le navigateur
- `internal/engine` : règles des jeux et du portefeuille, sans réseau ni stockage
- `internal/store` : comptes, sessions, classements (PostgreSQL)
- `chart/` : chart Helm
- `cmd/devdb` : PostgreSQL local pour le développement
- `internal/server` : API HTTP, sécurité, fichiers de l'interface
- `web/app`, `web/components` : pages et composants React (Next.js, export statique) : accueil, classement, jeux
- `web/lib/i18n.ts` : la traduction anglaise
- `web/lib/app.ts` : état de l'application, partagé par React et par les scènes
- `web/games`, `web/lib/slotkit.js` : scènes de jeu, dessinées à la main dans le DOM
- `web/lib/art.js`, `web/lib/sound.js` : les pictogrammes SVG, tous les sons
- `art/` : illustrations sources des machines et leur script de préparation
- `.agents/skills/` : skills `frontend-design` (Anthropic) et `labops-art-direction`,
  aussi visibles par Claude Code via `.claude/skills`
