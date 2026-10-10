import { $, $$, el } from '../lib/dom.js';
import { App } from '../lib/app';
import { Reels, centre, countUp, stageBanner, bigWin, slotLayout } from '../lib/slotkit.js';
import { Sound } from '../lib/sound.js';
import { createFx } from '../lib/fx.js';
import { language } from '../lib/i18n';

// « Mort ou Vif » : 5 rouleaux de 5, 15 lignes. Les mêmes tracés que le moteur
// (internal/engine/bounty.go).
const LINES = [
  [0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [2, 2, 2, 2, 2], [3, 3, 3, 3, 3], [4, 4, 4, 4, 4],
  [0, 1, 2, 1, 0], [4, 3, 2, 3, 4], [1, 2, 3, 2, 1], [3, 2, 1, 2, 3],
  [0, 1, 0, 1, 0], [4, 3, 4, 3, 4], [1, 0, 1, 0, 1], [3, 4, 3, 4, 3], [2, 1, 2, 1, 2], [2, 3, 2, 3, 2],
];
// Habillage des symboles. Les illustrations sont préparées par art/build.py à partir de
// art/bounty/src.
const img = (name, cls = 'art') => `<img class="${cls}" src="/art/bounty/${name}.webp" alt="" draggable="false">`;
const SYM = {
  T: { text: '10', cls: 'rank' }, J: { text: 'J', cls: 'rank' }, Q: { text: 'Q', cls: 'rank' }, K: { text: 'K', cls: 'rank' }, A: { text: 'A', cls: 'rank' },
  SKULL: { text: img('skull') }, OUTLAW: { text: img('outlaw') }, PURSE: { text: img('purse') }, BOTTLE: { text: img('bottle') }, PISTOL: { text: img('pistol') },
  WILD: { text: img('wild'), cls: 'wild', tag: 'WILD' }, VS: { text: img('vs'), cls: 'vs', tag: 'DUEL' },
  GALLEON: { text: img('galleon'), cls: 'scatter', tag: 'GALION' }, DUEL: { text: img('duel'), cls: 'scatter', tag: 'AUBE' }, DEAD: { text: img('dead'), cls: 'scatter', tag: 'MAIN' },
};
const NAMES = ['T', 'J', 'Q', 'K', 'A', 'SKULL', 'OUTLAW', 'PURSE', 'BOTTLE', 'PISTOL'];
const BONUS = {
  GALLEON: { name: 'Le Galion', cost: 80, pitch: 'Dix tours : chaque wild reste en place' },
  DUEL: { name: "Duel à l'aube", cost: 200, pitch: 'Dix tours chargés de duels' },
  DEAD: { name: 'La Main du mort', cost: 400, pitch: 'Ramassez wilds et multiplicateur, puis trois tours pour les jouer' },
};
const times = (m) => `×${m.toLocaleString('fr-FR')}`;

const rules = `
  <p>5 rouleaux, 5 rangées, 15 lignes payées de gauche à droite. Gains en multiples de la mise pour 3 / 4 / 5 symboles :</p>
  <table>
    <tr><td>${img('pistol')}</td><td>2 / 10 / 20</td><td>${img('bottle')} ${img('purse')}</td><td>1 / 5 / 10</td></tr>
    <tr><td>${img('outlaw')} ${img('skull')}</td><td>0,5 / 2,5 / 5</td><td>10 J Q K A</td><td>0,1 / 0,5 / 1</td></tr>
  </table>
  <p>${img('wild')} <b>Wild</b> : remplace les symboles payants ; cinq wilds sur une ligne paient 20 fois la mise.</p>
  <p>${img('vs')} <b>Duel</b> : quand il participe à un gain, il s'étend sur tout son rouleau, qui devient wild. Deux duellistes s'y affrontent, chacun avec un multiplicateur de ×2 à ×100 ; celui du survivant s'applique aux gains qui traversent le rouleau. Plusieurs duels sur une même ligne s'additionnent.</p>
  <p>Trois scatters identiques ouvrent leur bonus :</p>
  <p>${img('galleon')} <b>Le Galion</b> : 10 tours gratuits où chaque wild qui tombe reste en place jusqu'à la fin.</p>
  <p>${img('duel')} <b>Duel à l'aube</b> : 10 tours gratuits où les duels tombent bien plus souvent.</p>
  <p>${img('dead')} <b>La Main du mort</b> : sur une grille vide, des wilds et des multiplicateurs tombent et sont ramassés ; chacun remet le compteur à 3 tours, et la collecte s'arrête après 3 tours sans rien (20 wilds et ×31 au plus). Puis 3 tours où les wilds ramassés sont jetés sur la grille, tous les gains étant multipliés par le total ramassé.</p>
  <p><b>Achat</b> : Le Galion pour 80 fois la mise, Duel à l'aube pour 200, La Main du mort pour 400.</p>
  <p>Gain maximal : 12 500 fois la mise. Les règles et la table des gains sont celles de Wanted Dead or a Wild ; le tracé des lignes, les rouleaux et les chances de chaque multiplicateur n'étant pas publics, ils sont réglés par simulation sur ses chiffres connus (retour d'environ 96 %, un gain tous les 5 tours, un bonus tous les 265 tours).</p>`;

const rulesEn = `
  <p>5 reels, 5 rows, 15 lines paid left to right. Wins in multiples of the bet for 3 / 4 / 5 symbols:</p>
  <table>
    <tr><td>${img('pistol')}</td><td>2 / 10 / 20</td><td>${img('bottle')} ${img('purse')}</td><td>1 / 5 / 10</td></tr>
    <tr><td>${img('outlaw')} ${img('skull')}</td><td>0.5 / 2.5 / 5</td><td>10 J Q K A</td><td>0.1 / 0.5 / 1</td></tr>
  </table>
  <p>${img('wild')} <b>Wild</b>: substitutes for paying symbols; five wilds on a line pay 20 times the bet.</p>
  <p>${img('vs')} <b>Duel</b>: when it takes part in a win, it expands over its whole reel, which turns wild. Two duellists face off on it, each with a multiplier from ×2 to ×100; the survivor's applies to the wins that cross the reel. Several duels on the same line add up.</p>
  <p>Three identical scatters open their bonus:</p>
  <p>${img('galleon')} <b>The Galleon</b>: 10 free spins where every wild that lands stays in place until the end.</p>
  <p>${img('duel')} <b>Duel at dawn</b>: 10 free spins where duels land far more often.</p>
  <p>${img('dead')} <b>The Dead Man's Hand</b>: on an empty grid, wilds and multipliers land and are collected; each one resets the counter to 3 spins, and the collection stops after 3 spins with nothing (20 wilds and ×31 at most). Then 3 spins where the collected wilds are thrown on the grid, every win being multiplied by the collected total.</p>
  <p><b>Buy</b>: The Galleon for 80 times the bet, Duel at dawn for 200, The Dead Man's Hand for 400.</p>
  <p>Maximum win: 12,500 times the bet. The rules and the paytable are those of Wanted Dead or a Wild; the layout of the lines, the reels and the odds of each multiplier are not public, so they are tuned by simulation on its known figures (return of about 96%, a win every 5 spins, a bonus every 265 spins).</p>`;

const game = {
  mount(root) {
    const ui = slotLayout(root, { title: 'Mort ou <span>Vif</span>', subtitle: 'Des duels qui couvrent un rouleau et multiplient jusqu\'à 100 fois, trois bonus, jusqu\'à 12 500 fois la mise.', rules: language() === 'en' ? rulesEn : rules });
    let bet = ui.bet.value;
    let busy = false;
    let gone = false;
    const sfx = (...a) => gone || Sound.play(...a);
    const replay = (node, cls) => {
      node.classList.remove(cls);
      void node.offsetWidth;
      node.classList.add(cls);
    };

    ui.stage.prepend(el('<div class="scene" aria-hidden="true"><i class="scenery" style="background-image:url(/art/bounty/stage.webp)"></i><i class="dusk"></i></div>'));
    for (const name of ['skull', 'outlaw', 'purse', 'bottle', 'pistol', 'wild', 'vs', 'galleon', 'duel', 'dead', 'duellist-a', 'duellist-b']) {
      new Image().src = `/art/bounty/${name}.webp`;
    }
    const fx = createFx(ui.stage);
    Sound.ambience('sea');

    ui.extra.innerHTML = `<p class="buy-title">Acheter un bonus</p>${Object.keys(BONUS).map((k) => `<button class="btn quiet buy" data-buy="${k}"></button>`).join('')}`;
    const buyButtons = $$('[data-buy]', ui.extra);
    const labels = () => buyButtons.forEach((x) => {
      x.classList.remove('armed');
      x.innerHTML = `${BONUS[x.dataset.buy].name}<small>${App.coin(ui.bet.value * BONUS[x.dataset.buy].cost)}</small>`;
    });
    labels();
    ui.controls.addEventListener('change', labels);
    ui.controls.addEventListener('click', labels);

    // Une case : un symbole, une case vide (collecte), ou un multiplicateur ramassé.
    const render = (s) => {
      if (s === 'EMPTY') return '<div class="sym empty"></div>';
      if (typeof s === 'object') return `<div class="sym token"><span><b>+${s.plus}</b></span></div>`;
      const d = SYM[s];
      return `<div class="sym ${d.cls || ''}"><span>${d.text}</span>${d.tag ? `<em>${d.tag}</em>` : ''}</div>`;
    };
    const reels = new Reels(5, 5, render, () => NAMES[Math.floor(Math.random() * NAMES.length)]);
    ui.frame.append(reels.el);
    // Les wilds qui restent en place d'un tour à l'autre (Le Galion) sont posés par-dessus
    // les rouleaux : ils ne défilent pas avec eux.
    const pinned = el('<div class="pinned" aria-hidden="true"></div>');
    ui.frame.append(pinned);
    const pin = (c, r) => {
      if ($(`[data-at="${c}-${r}"]`, pinned)) return false;
      pinned.append(el(`<div class="pin" data-at="${c}-${r}" style="left:${c * 20}%;top:${r * 20}%"><div class="sym wild"><span>${img('wild')}</span><em>WILD</em></div></div>`));
      return true;
    };

    function drawLines(wins) {
      const box = ui.frame.getBoundingClientRect();
      const paths = wins.map((w) => {
        const pts = LINES[w.line].slice(0, w.count).map((r, c) => centre(reels.cell(c, r)));
        return `<polyline pathLength="1" points="${pts.map((p) => `${(p.x - box.left).toFixed(1)},${(p.y - box.top).toFixed(1)}`).join(' ')}"/>`;
      });
      const svg = el(`<svg class="lines" viewBox="0 0 ${box.width} ${box.height}" aria-hidden="true">${paths.join('')}</svg>`);
      ui.frame.append(svg);
      return svg;
    }

    // Le duel : le rouleau se couvre, les deux duellistes annoncent leur multiplicateur,
    // un coup part, le survivant garde le sien.
    async function duel(d) {
      const first = d.mult === d.a && (d.a !== d.b || Math.random() < 0.5);
      const panel = el(`
        <div class="duelreel">
          <div class="dl a ${first ? '' : 'out'}">${img('duellist-a', 'pic')}<b>${times(d.a)}</b></div>
          <strong>${times(d.mult)}</strong>
          <div class="dl b ${first ? 'out' : ''}">${img('duellist-b', 'pic')}<b>${times(d.b)}</b></div>
        </div>`);
      reels.reel(d.reel).append(panel);
      sfx('wild');
      await App.wait(750);
      sfx('cannon', Math.min(1, Math.log2(d.mult) / 6.6));
      panel.classList.add('shot');
      fx.blast(panel, Math.min(1, Math.log2(d.mult) / 6.6), 1.1);
      ui.stage.style.setProperty('--kick', `${3 + Math.min(8, Math.log2(d.mult) * 1.3)}px`);
      replay(ui.stage, 'shake');
      await App.wait(650);
    }

    // Joue un tour déjà tiré : les rouleaux, les duels, les lignes. total() ajoute au
    // compteur du bonus quand il y en a un.
    async function playSpin(s, { held = false, showdown = false } = {}) {
      $$('.duelreel', ui.frame).forEach((x) => x.remove());
      if (!held) pinned.replaceChildren();
      const quiet = Sound.reels();
      let bells = 0;
      await reels.spin(s.grid, {
        onStop: (c) => {
          sfx('stop', c);
          s.grid[c].forEach((x, r) => {
            if (!SYM[x].tag) return;
            if (x !== 'WILD') reels.flash([[c, r]], 'pulse');
            if (x === 'GALLEON' || x === 'DUEL' || x === 'DEAD') sfx('scatter', bells++);
          });
        },
      });
      quiet();
      // Les wilds jetés sur la grille (La Main du mort) ou gardés (Le Galion) se signalent.
      if (showdown && s.held) {
        reels.flash(s.held, 'pulse');
        if (s.held.length) sfx('wild');
        await App.wait(350);
      }
      if (held) {
        let fresh = 0;
        s.grid.forEach((col, c) => col.forEach((x, r) => x === 'WILD' && pin(c, r) && fresh++));
        if (fresh) {
          sfx('wild');
          await App.wait(300);
        }
      }
      for (const d of s.duels) {
        if (d.expanded) await duel(d);
        else reels.mark([[d.reel, d.row]], 'idle');
      }
      if (!s.wins.length) return;
      for (const w of s.wins) reels.mark(LINES[w.line].slice(0, w.count).map((r, c) => [c, r]));
      const svg = drawLines(s.wins);
      const best = Math.max(...s.wins.map((w) => w.mult));
      sfx('win', Math.min(8, Math.round(Math.log2(1 + s.win))));
      ui.winline.innerHTML = `${s.wins.length} ligne${s.wins.length > 1 ? 's' : ''}${best > 1 ? `, jusqu'à ${times(best)}` : ''} : ${App.coin(Math.round(s.win * bet))}`;
      ui.tally.add(Math.round(s.win * bet));
      await App.wait(1100);
      svg.remove();
      reels.clear();
    }

    const hud = (left, total, extra = '') => {
      ui.hud.innerHTML = `<span>Tours restants <b>${left}</b></span>${extra}<span>Gain du bonus <b><span class="coin">◈</span><span id="bonus-total">${App.fmt(Math.round(total * bet))}</span></b></span>`;
    };

    // La Main du mort, première partie : la grille se vide, puis wilds et multiplicateurs
    // tombent et sont ramassés.
    async function collect(b) {
      pinned.replaceChildren();
      $$('.duelreel', ui.frame).forEach((x) => x.remove());
      reels.clear();
      for (let c = 0; c < 5; c++) for (let r = 0; r < 5; r++) reels.set(c, r, 'EMPTY');
      const counters = (step) => {
        ui.hud.innerHTML = `<span>Tours avant la fin <b>${step.left}</b></span><span>Wilds ramassés <b>${step.wilds}</b></span><span>Multiplicateur <b>${times(step.mult)}</b></span>`;
      };
      counters({ left: 3, wilds: 0, mult: 1 });
      ui.winline.textContent = 'La collecte : chaque prise remet le compteur à 3';
      await App.wait(700);
      for (const step of b.collect) {
        sfx('lever');
        replay(reels.el, 'deal');
        await App.wait(420);
        for (const d of step.drops) {
          reels.set(d.col, d.row, d.wild ? 'WILD' : { plus: d.value }, 'spawn');
          sfx(d.wild ? 'wild' : 'plop', d.wild ? 0 : Math.min(13, d.value + 4));
          fx.splash(reels.cell(d.col, d.row), 0.2);
          await App.wait(260);
        }
        counters(step);
        if (!step.drops.length) sfx('lose');
        await App.wait(step.drops.length ? 350 : 500);
      }
      await stageBanner(ui.stage, `${b.wilds} wild${b.wilds > 1 ? 's' : ''} et ${times(b.mult)}<small>Trois tours pour les jouer</small>`, 2000);
    }

    async function bonus(res) {
      const b = res.bonus;
      const info = BONUS[b.type];
      sfx('bonus');
      await stageBanner(ui.stage, `${info.name}<small>${info.pitch}</small>`, 2300);
      ui.stage.classList.add('bonus');
      if (!gone) Sound.ambience('showdown');
      let total = 0;
      if (b.type === 'DEAD') await collect(b);
      for (const s of b.spins) {
        ui.winline.innerHTML = '&nbsp;';
        hud(s.left, total, b.type === 'DEAD' ? `<span>Tous les gains <b>${times(b.mult)}</b></span>` : '');
        await playSpin(s, { held: b.type === 'GALLEON', showdown: b.type === 'DEAD' });
        total += s.win;
        await countUp($('#bonus-total', ui.stage), Math.round(total * bet), 400);
        await App.wait(200);
      }
      ui.stage.classList.remove('bonus');
      pinned.replaceChildren();
      $$('.duelreel', ui.frame).forEach((x) => x.remove());
      if (!gone) Sound.ambience('sea');
      sfx('bonusEnd');
      ui.hud.innerHTML = '';
      await stageBanner(ui.stage, `${App.coin(Math.round(b.total * bet))}<small>gagnés avec ${info.name}</small>`, 2200);
    }

    async function spin(buy) {
      if (busy) return false;
      bet = ui.bet.value;
      const cost = buy ? bet * BONUS[buy].cost : bet;
      if (cost > App.user.balance) {
        App.toast(buy ? 'Il ne reste pas assez de crédits pour cet achat' : 'Il ne reste pas assez de crédits pour cette mise');
        return false;
      }
      let played = false;
      busy = true;
      $$('button:not(.auto-btn), input', ui.controls.parentNode).forEach((x) => (x.disabled = true));
      ui.winline.innerHTML = '&nbsp;';
      ui.tally.reset();
      sfx('lever');
      try {
        const pending = App.api('/api/slots/bounty', buy ? { bet, buy } : { bet });
        App.showBalance(App.user.balance - cost);
        const res = await pending;
        await playSpin(res);
        if (res.bonus) {
          const where = [];
          res.grid.forEach((col, c) => col.forEach((x, r) => x === res.scatter && where.push([c, r])));
          reels.mark(where, 'collect');
          await App.wait(1000);
          await bonus(res);
        }
        if (res.payout >= bet * 20) {
          sfx('big');
          const quiet = gone ? () => {} : Sound.coins();
          await bigWin(ui.stage, res.payout, bet);
          quiet();
        }
        ui.lastwin.innerHTML = res.payout ? `${App.coin(res.payout)} <small>${(res.payout / bet).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} fois la mise</small>` : 'aucun';
        ui.tally.set(res.payout);
        ui.winline.innerHTML = res.payout ? `${(res.payout / bet).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} fois la mise` : '&nbsp;';
        App.setUser(res.user);
        played = true;
      } catch (e) {
        App.toast(e.message);
        if (App.user) App.showBalance(App.user.balance);
      }
      busy = false;
      $$('button:not(.auto-btn), input', ui.controls.parentNode).forEach((x) => (x.disabled = false));
      labels();
      return played && !gone;
    }

    // Un achat coûte cher : le premier clic arme le bouton, le second confirme.
    buyButtons.forEach((x) => (x.onclick = () => {
      if (!x.classList.contains('armed')) {
        labels();
        x.classList.add('armed');
        x.innerHTML = `Confirmer l'achat<small>${App.coin(ui.bet.value * BONUS[x.dataset.buy].cost)}</small>`;
        sfx('arm');
        return;
      }
      spin(x.dataset.buy);
    }));
    ui.play.onclick = () => spin();
    ui.auto.bind(() => spin());
    const unbind = App.onSpace(() => spin());
    return () => {
      gone = true;
      ui.auto.stop();
      unbind();
      fx.destroy();
      Sound.ambience(null);
    };
  },
};

export default game;
