import { $, $$, el, sleep, esc } from '../lib/dom.js';
import { App } from '../lib/app';
import { Art } from '../lib/art.js';
import { Reels, fly, centre, countUp, stageBanner, bigWin, slotLayout } from '../lib/slotkit.js';
import { Sound } from '../lib/sound.js';
import { createFx } from '../lib/fx.js';
import { language } from '../lib/i18n';

const LINES = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 1, 2, 1],
];
// Habillage des symboles : tout le visuel du jeu se change ici. Les illustrations sont
// préparées par art/build.py à partir de art/bass/src.
const img = (name) => `<img class="art" src="/art/bass/${name}.webp" alt="" draggable="false">`;
const SYM = {
  T: { text: '10', cls: 'rank' }, J: { text: 'J', cls: 'rank' }, Q: { text: 'Q', cls: 'rank' },
  K: { text: 'K', cls: 'rank' }, A: { text: 'A', cls: 'rank' },
  BOX: { text: img('tackle') }, FLY: { text: img('dragonfly') }, ROD: { text: img('rod') }, FLOAT: { text: img('float') },
  FISH: { text: img('fish'), cls: 'fish' }, SCAT: { text: img('bass'), cls: 'scatter', tag: 'SCATTER' }, WILD: { text: img('fisherman'), cls: 'wild', tag: 'WILD' },
};
const NAMES = Object.keys(SYM).filter((s) => s !== 'WILD' && s !== 'SCAT');
const LEVELS = [1, 2, 3, 10];

const rules = `
  <p>5 rouleaux, 3 rangées, 10 lignes payées de gauche à droite. Gains en multiples de la mise pour 3 / 4 / 5 symboles :</p>
  <table>
    <tr><td>${img('float')}</td><td>5 / 20 / 200 (et 0,5 pour 2)</td><td>${img('rod')}</td><td>3 / 15 / 100</td></tr>
    <tr><td>${img('tackle')} ${img('dragonfly')}</td><td>2 / 10 / 50</td><td>${img('fish')}</td><td>1 / 5 / 20</td></tr>
    <tr><td>10 J Q K A</td><td>0,5 / 2,5 / 10</td><td></td><td></td></tr>
  </table>
  <p>${img('bass')} <b>Scatter</b> : 3, 4 ou 5 déclenchent 10, 15 ou 20 tours gratuits.</p>
  <p>${img('fish')} Chaque poisson porte une valeur : 2, 5, 10, 15, 20, 25, 50 ou 2 000 fois la mise.</p>
  <p>${img('fisherman')} <b>Pêcheur wild</b>, en tours gratuits seulement : il remplace les autres symboles et ramasse la valeur de tous les poissons visibles.</p>
  <p>Tous les 4 pêcheurs, la série en cours terminée : 10 tours de plus, et la pêche compte 2 fois, puis 3 fois, puis 10 fois. Trois paliers au plus.</p>
  <p>En tours gratuits, un pêcheur sans poisson peut déclencher la ${img('dynamite')} <b>dynamite</b>, qui change des symboles en poissons.</p>
  <p><b>Achat</b> : 10 tours gratuits pour 100 fois la mise. Seuls les tours gratuits sont alors payés.</p>
  <p>Gain maximal : 2 100 fois la mise. Les règles et la table des gains sont celles de Big Bass Bonanza ; les fréquences sont réglées par simulation sur ses chiffres publics (retour d'environ 96,7 %, un gain tous les 7,7 tours, tours gratuits tous les 113 tours). L'achat des tours gratuits est un ajout.</p>`;

const rulesEn = `
  <p>5 reels, 3 rows, 10 lines paid left to right. Wins in multiples of the bet for 3 / 4 / 5 symbols:</p>
  <table>
    <tr><td>${img('float')}</td><td>5 / 20 / 200 (and 0.5 for 2)</td><td>${img('rod')}</td><td>3 / 15 / 100</td></tr>
    <tr><td>${img('tackle')} ${img('dragonfly')}</td><td>2 / 10 / 50</td><td>${img('fish')}</td><td>1 / 5 / 20</td></tr>
    <tr><td>10 J Q K A</td><td>0.5 / 2.5 / 10</td><td></td><td></td></tr>
  </table>
  <p>${img('bass')} <b>Scatter</b>: 3, 4 or 5 trigger 10, 15 or 20 free spins.</p>
  <p>${img('fish')} Every fish carries a value: 2, 5, 10, 15, 20, 25, 50 or 2,000 times the bet.</p>
  <p>${img('fisherman')} <b>Fisherman wild</b>, in free spins only: he substitutes for the other symbols and collects the value of every fish in view.</p>
  <p>Every 4 fishermen, once the current batch is over: 10 more spins, and the catch counts twice, then 3 times, then 10 times. Three levels at most.</p>
  <p>In free spins, a fisherman with no fish may set off the ${img('dynamite')} <b>dynamite</b>, which turns symbols into fish.</p>
  <p><b>Buy</b>: 10 free spins for 100 times the bet. Only the free spins are then paid.</p>
  <p>Maximum win: 2,100 times the bet. The rules and the paytable are those of Big Bass Bonanza; the frequencies are tuned by simulation on its public figures (return of about 96.7%, a win every 7.7 spins, free spins every 113 spins). Buying the free spins is an addition.</p>`;

const game = {
  mount(root) {
    const ui = slotLayout(root, { title: 'Big <span>Catch</span>', subtitle: 'Dix lignes, des poissons à ramasser en tours gratuits, jusqu\'à 2 100 fois la mise.', rules: language() === 'en' ? rulesEn : rules,
      feature: { art: '/art/bass/bass.webp', title: 'La grande pêche', text: '3 bars ou plus : 10, 15 ou 20 tours gratuits, où le pêcheur ramasse la valeur des poissons.' } });
    let bet = ui.bet.value;
    let busy = false;
    // Une partie quittée en cours de tour ne doit plus rien faire entendre.
    let gone = false;
    const sfx = (...a) => gone || Sound.play(...a);

    // La scène : un matin en mer ; pendant les tours gratuits, on passe sous la surface.
    ui.stage.prepend(el(`<div class="scene" aria-hidden="true"><i class="backdrop"></i><i class="backdrop deep">${'<b></b>'.repeat(9)}</i></div>`));
    for (const name of ['fish', 'bass', 'fisherman', 'tackle', 'dragonfly', 'rod', 'float', 'dynamite', 'stage-bonus']) {
      new Image().src = `/art/bass/${name}.webp`;
    }
    // Le pont : le pêcheur à gauche, et à droite le compteur des tours gratuits.
    ui.under.innerHTML = `<div class="deck"><span class="hero">${img('hero')}</span><div class="meter"></div></div>`;
    const hero = $('.hero', ui.under);
    const meterBox = $('.meter', ui.under);
    const fx = createFx(ui.stage);
    const replay = (node, cls) => {
      node.classList.remove(cls);
      void node.offsetWidth;
      node.classList.add(cls);
    };
    Sound.ambience('sea');

    const BUY = 100;
    ui.extra.innerHTML = '<p class="buy-title">Acheter les tours gratuits</p><button class="btn quiet buy"></button>';
    const buyBtn = $('.buy', ui.extra);
    const labels = () => {
      buyBtn.classList.remove('armed');
      buyBtn.innerHTML = `10 tours gratuits<small>${App.coin(ui.bet.value * BUY)}</small>`;
    };
    labels();
    ui.controls.addEventListener('change', labels);
    ui.controls.addEventListener('click', labels);

    const render = (cell) => {
      const s = SYM[cell.s];
      const value = cell.s === 'FISH' ? `<em>${App.fmt(cell.v * bet)}</em>` : s.tag ? `<em>${s.tag}</em>` : '';
      return `<div class="sym ${s.cls || ''}"><span>${s.text}</span>${value}</div>`;
    };
    const random = () => {
      const s = NAMES[Math.floor(Math.random() * NAMES.length)];
      return { s, v: [2, 5, 10, 15, 20][Math.floor(Math.random() * 5)] };
    };
    const reels = new Reels(5, 3, render, random);
    ui.frame.append(reels.el);

    const where = (grid, sym) => {
      const cells = [];
      grid.forEach((col, c) => col.forEach((x, r) => x.s === sym && cells.push([c, r])));
      return cells;
    };
    // Suspense : un rouleau tourne plus longtemps quand deux scatters sont déjà tombés à sa gauche.
    const teaseFor = (grid) => {
      let seen = 0;
      return grid.map((col) => {
        const t = seen >= 2;
        if (col.some((x) => x.s === 'SCAT')) seen++;
        return t;
      });
    };
    async function spinTo(grid, opts = {}) {
      const quiet = Sound.reels();
      let bells = 0;
      await reels.spin(grid, {
        ...opts,
        onTease: () => sfx('tease'),
        onStop: (c) => {
          sfx('stop', c);
          grid[c].forEach((x, r) => {
            if (x.s !== 'SCAT' && x.s !== 'WILD') return;
            reels.flash([[c, r]], 'pulse');
            // Un scatter retombe dans l'eau ; un pêcheur arrive en sifflant.
            if (x.s === 'SCAT') {
              sfx('scatter', bells++);
              sfx('splash');
              fx.splash(reels.cell(c, r), 0.4);
            } else sfx('wild');
          });
        },
      });
      quiet();
    }

    // Trace les lignes gagnantes sur la grille, d'un trait qui se dessine de gauche à droite.
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

    async function showLines(wins) {
      if (!wins.length) return;
      for (const w of wins) reels.mark(LINES[w.line].slice(0, w.count).map((r, c) => [c, r]));
      const svg = drawLines(wins);
      sfx('line', Math.min(6, wins.length - 1 + Math.round(Math.log2(1 + wins.reduce((n, w) => n + w.pay, 0)))));
      ui.winline.innerHTML = `${wins.length} ligne${wins.length > 1 ? 's gagnantes' : ' gagnante'} : ${App.coin(Math.round(wins.reduce((n, w) => n + w.pay, 0) * bet))}`;
      ui.tally.add(Math.round(wins.reduce((n, w) => n + w.pay, 0) * bet));
      await App.wait(1000);
      svg.remove();
      reels.clear();
    }

    // ----- tours gratuits -----

    const meter = (wildsTotal, level) => {
      let html = '';
      for (let l = 0; l < 3; l++) {
        html += `<span class="meter-step${level > l ? ' done' : ''}">`;
        for (let i = 0; i < 4; i++) html += `<i class="${wildsTotal > l * 4 + i ? 'on' : ''}">${img('fisherman')}</i>`;
        html += `<b>×${LEVELS[l + 1]}</b></span>`;
      }
      return html;
    };
    const hud = (left, level, wildsTotal) => {
      ui.hud.innerHTML = `
        <span>Tours restants <b>${left}</b></span>
        <span>La pêche compte <b>${LEVELS[level]} fois</b></span>
        <span>Gain des tours gratuits <b><span class="coin">◈</span><span id="bonus-total">0,00</span></b></span>`;
      meterBox.setAttribute('aria-label', `${wildsTotal} pêcheurs ramassés`);
      meterBox.innerHTML = meter(wildsTotal, level);
    };

    // Chaque pêcheur ramasse les poissons un par un ; leur valeur vole jusqu'à lui.
    async function collect(s, grid) {
      const fishes = where(grid, 'FISH');
      for (const [wc, wr] of where(grid, 'WILD')) {
        const target = reels.cell(wc, wr);
        const tag = $('em', target);
        let sum = 0;
        reels.mark([[wc, wr]], 'collect');
        let n = 0;
        for (const [fc, fr] of fishes) {
          const v = grid[fc][fr].v * bet;
          reels.flash([[fc, fr]], 'caught');
          sfx('plop', n++);
          fx.splash(reels.cell(fc, fr), 0.15);
          await fly($('em', reels.cell(fc, fr)), tag, App.fmt(v), 'catch');
          sum += v;
          tag.textContent = App.fmt(sum);
          replay(tag, 'bump');
        }
        if (s.mult > 1) {
          await App.wait(250);
          tag.textContent = `${App.fmt(sum)} × ${s.mult}`;
          await App.wait(450);
          tag.textContent = App.fmt(sum * s.mult);
        }
        await App.wait(350);
      }
      ui.winline.innerHTML = `${s.wilds > 1 ? `${s.wilds} pêcheurs ramassent` : 'Le pêcheur ramasse'} ${App.coin(Math.round(s.collect * bet))}`;
      replay(hero, 'cheer');
      sfx('line', 4);
      ui.tally.add(Math.round(s.collect * bet));
    }

    async function bonus(res) {
      sfx('bonus');
      await stageBanner(ui.stage, `${res.awarded} tours gratuits<small>On plonge : chaque pêcheur ramasse les poissons</small>`, 2200);
      ui.stage.classList.add('bonus');
      replay(hero, 'cheer');
      if (!gone) Sound.ambience('hornpipe');
      let total = 0;
      let level = 0;
      let wildsBefore = 0;
      hud(res.awarded, 0, 0);
      for (const s of res.bonus.spins) {
        ui.winline.innerHTML = '&nbsp;';
        $('.hud b', ui.stage).textContent = s.retrigger ? 0 : s.left;
        await spinTo(s.grid);
        await showLines(s.wins);
        let grid = s.grid;
        if (s.dynamite) {
          ui.winline.textContent = 'Dynamite : des poissons apparaissent';
          const boom = el(`<div class="boom">${img('dynamite')}</div>`);
          ui.frame.append(boom);
          sfx('fuse');
          await App.wait(620);
          boom.remove();
          sfx('cannon', 0.6);
          fx.blast(ui.frame, 0.8, 1.6);
          ui.stage.style.setProperty('--kick', '9px');
          replay(ui.stage, 'shake');
          grid = s.after;
          for (const [c, r] of s.dynamite) {
            reels.set(c, r, grid[c][r], 'spawn');
            fx.splash(reels.cell(c, r), 0.3);
          }
          sfx('splash', 1);
          await App.wait(600);
        }
        if (s.collect > 0) {
          await collect(s, grid);
          await App.wait(500);
        } else if (s.wilds > 0) {
          reels.flash(where(grid, 'WILD'), 'pulse');
          await App.wait(400);
        }
        total += s.win;
        meterBox.innerHTML = meter(s.wildsTotal, level);
        if (s.wildsTotal > wildsBefore) await App.wait(300);
        wildsBefore = s.wildsTotal;
        await countUp($('#bonus-total', ui.stage), Math.round(total * bet), 500);
        if (s.retrigger) {
          level = s.level;
          sfx('bonus');
          replay(hero, 'cheer');
          await stageBanner(ui.stage, `10 tours de plus<small>La pêche compte maintenant ${LEVELS[level]} fois</small>`, 1500);
          hud(s.left, level, s.wildsTotal);
          $('#bonus-total', ui.stage).dataset.value = Math.round(total * bet);
          $('#bonus-total', ui.stage).textContent = App.fmt(Math.round(total * bet));
        }
        reels.clear();
        await App.wait(150);
      }
      ui.stage.classList.remove('bonus');
      if (!gone) Sound.ambience('sea');
      sfx('bonusEnd');
      ui.hud.innerHTML = '';
      meterBox.innerHTML = '';
      await stageBanner(ui.stage, `${App.coin(Math.round(res.bonus.total * bet))}<small>gagnés en ${res.bonus.spins.length} tours gratuits</small>`, 2200);
    }

    async function spin(buy) {
      if (busy) return false;
      bet = ui.bet.value;
      const cost = buy ? bet * BUY : bet;
      if (cost > App.user.balance) {
        App.toast(buy ? 'Il ne reste pas assez de crédits pour cet achat' : 'Il ne reste pas assez de crédits pour cette mise');
        return false;
      }
      let played = false;
      busy = true;
      ui.play.disabled = true;
      buyBtn.disabled = true;
      ui.bet.lock(true);
      ui.winline.innerHTML = '&nbsp;';
      try {
        ui.tally.reset();
        sfx('lever');
        const pending = App.api('/api/slots/bass', buy ? { bet, buy: 'fs' } : { bet });
        App.showBalance(App.user.balance - cost);
        const res = await pending;
        await spinTo(res.grid, { tease: teaseFor(res.grid) });
        await showLines(res.wins);
        if (res.bonus) {
          reels.mark(where(res.grid, 'SCAT'), 'collect');
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
      ui.play.disabled = false;
      buyBtn.disabled = false;
      ui.bet.lock(false);
      labels();
      return played && !gone;
    }

    // Un achat coûte cher : le premier clic arme le bouton, le second confirme.
    buyBtn.onclick = () => {
      if (!buyBtn.classList.contains('armed')) {
        buyBtn.classList.add('armed');
        buyBtn.innerHTML = `Confirmer l'achat<small>${App.coin(ui.bet.value * BUY)}</small>`;
        sfx('arm');
        return;
      }
      spin(true);
    };
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
