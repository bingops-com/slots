import { $, $$, el, store } from '../lib/dom.js';
import { App } from '../lib/app';
import { Reels, centre, countUp, stageBanner, bigWin, slotLayout } from '../lib/slotkit.js';
import { Sound } from '../lib/sound.js';
import { createFx } from '../lib/fx.js';
import { language } from '../lib/i18n';

// « Chiens de bord » : 5 rouleaux de 3, 20 lignes. Les mêmes tracés que le moteur
// (internal/engine/dogs.go).
const LINES = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 0, 0], [2, 2, 1, 2, 2], [1, 2, 2, 2, 1], [1, 0, 0, 0, 1], [1, 0, 1, 0, 1],
  [1, 2, 1, 2, 1], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2], [1, 1, 0, 1, 1], [1, 1, 2, 1, 1],
  [0, 1, 1, 1, 0], [2, 1, 1, 1, 2], [0, 2, 0, 2, 0], [2, 0, 2, 0, 2], [0, 2, 2, 2, 0],
];
const img = (name, cls = 'art') => `<img class="${cls}" src="/art/dogs/${name}.webp" alt="" draggable="false">`;
const SYM = {
  T: { text: '10', cls: 'rank' }, J: { text: 'J', cls: 'rank' }, Q: { text: 'Q', cls: 'rank' }, K: { text: 'K', cls: 'rank' }, A: { text: 'A', cls: 'rank' },
  BONE: { text: img('bone') }, COLLAR: { text: img('collar') }, DOG1: { text: img('dog1') }, DOG2: { text: img('dog2') }, DOG3: { text: img('dog3') }, DOG4: { text: img('dog4') },
  WILD: { text: img('wild'), cls: 'wild' }, SCAT: { text: img('scatter'), cls: 'scatter', tag: 'BONUS' },
};
const NAMES = ['T', 'J', 'Q', 'K', 'A', 'BONE', 'COLLAR', 'DOG1', 'DOG2', 'DOG3', 'DOG4'];
const BUY = 100;
// Les deux bonus, au choix du joueur : ce que les trois scatters ouvrent, et ce qu'on achète.
const BONUS = {
  sticky: { name: 'Niches en place', buy: 'fs', count: 'Niches en place' },
  rain: { name: 'Pluie de niches', buy: 'rain', count: 'Niches tombées' },
};
const times = (m) => `×${m.toLocaleString('fr-FR')}`;

const table = `
  <table>
    <tr><td>${img('dog4')}</td><td>2,5 / 7,5 / 37,5</td><td>${img('dog3')}</td><td>1,75 / 5 / 25</td></tr>
    <tr><td>${img('dog2')}</td><td>1,25 / 3 / 15</td><td>${img('dog1')}</td><td>1 / 2 / 10</td></tr>
    <tr><td>${img('collar')}</td><td>0,6 / 1,25 / 7,5</td><td>${img('bone')}</td><td>0,4 / 1 / 5</td></tr>
    <tr><td>A K</td><td>0,25 / 0,5 / 2,5</td><td>10 J Q</td><td>0,1 / 0,25 / 1,25</td></tr>
  </table>`;
const rules = `
  <p>5 rouleaux, 3 rangées, 20 lignes payées de gauche à droite. Gains en multiples de la mise pour 3 / 4 / 5 symboles :</p>${table}
  <p>${img('wild')} <b>Niche wild</b> : sur les rouleaux 2, 3 et 4 seulement. Elle remplace les symboles payants et porte un multiplicateur ×2 ou ×3 ; plusieurs niches sur une même ligne s'additionnent.</p>
  <p>${img('scatter')} <b>Bonus</b> : sur les rouleaux 1, 3 et 5. Les trois ensemble paient 5 fois la mise et ouvrent les tours gratuits : neuf tonneaux donnent chacun 1, 2 ou 3 tours, soit 9 à 27 au total. Vous choisissez d'avance, sur la scène, lequel des deux bonus ils ouvrent :</p>
  <p><b>Niches en place</b> : chaque niche qui tombe reste en place avec son multiplicateur jusqu'à la fin. Les gains montent avec le nombre de niches : c'est le bonus le plus irrégulier.</p>
  <p><b>Pluie de niches</b> : à chaque tour, 1 à 4 niches tombent sur les rouleaux 2, 3 et 4, puis repartent avec le tour. Les gains sont plus réguliers.</p>
  <p>Les deux bonus rapportent autant en moyenne. Les tours gratuits ne se redéclenchent pas.</p>
  <p><b>Achat</b> : déclenche directement le bonus choisi pour 100 fois la mise.</p>
  <p>Gain maximal : 6 750 fois la mise. Les règles et la table des gains sont celles de The Dog House ; ses rouleaux n'étant pas publics, le tracé des lignes est le plus courant et les fréquences sont réglées par simulation sur ses chiffres connus (retour de 96,51 %, un gain sur 27,5 % des tours, tours gratuits tous les 180 tours).</p>`;
const rulesEn = `
  <p>5 reels, 3 rows, 20 lines paid left to right. Wins in multiples of the bet for 3 / 4 / 5 symbols:</p>${table.replace(/(\d),(\d)/g, '$1.$2')}
  <p>${img('wild')} <b>Kennel wild</b>: on reels 2, 3 and 4 only. It substitutes for paying symbols and carries a ×2 or ×3 multiplier; several kennels on the same line add up.</p>
  <p>${img('scatter')} <b>Bonus</b>: on reels 1, 3 and 5. All three together pay 5 times the bet and open the free spins: nine barrels each give 1, 2 or 3 spins, 9 to 27 in total. You choose beforehand, on the stage, which of the two bonuses they open:</p>
  <p><b>Kennels in place</b>: every kennel that lands stays in place with its multiplier until the end. Wins grow with the number of kennels: this is the more uneven bonus.</p>
  <p><b>Raining kennels</b>: on every spin, 1 to 4 kennels drop on reels 2, 3 and 4, then leave with the spin. Wins are more even.</p>
  <p>Both bonuses return as much on average. Free spins do not retrigger.</p>
  <p><b>Buy</b>: triggers the chosen bonus directly for 100 times the bet.</p>
  <p>Maximum win: 6,750 times the bet. The rules and the paytable are those of The Dog House; its reels are not public, so the layout of the lines is the usual one and the frequencies are tuned by simulation on its known figures (return of 96.51%, a win on 27.5% of spins, free spins every 180 spins).</p>`;

const game = {
  mount(root) {
    const ui = slotLayout(root, { title: 'Chiens de <span>bord</span>', subtitle: 'Vingt lignes, des niches wild qui multiplient et restent en place en tours gratuits, jusqu\'à 6 750 fois la mise.', rules: language() === 'en' ? rulesEn : rules,
      feature: { art: '/art/dogs/scatter.webp', title: 'Deux bonus au choix', text: '3 bonus sur les rouleaux 1, 3 et 5 ouvrent 9 à 27 tours gratuits. À vous de choisir lesquels.' } });
    let bet = ui.bet.value;
    let busy = false;
    let gone = false;
    const sfx = (...a) => gone || Sound.play(...a);

    ui.stage.prepend(el('<div class="scene" aria-hidden="true"><i class="scenery" style="background-image:url(/art/dogs/stage.webp)"></i><i class="glow"></i></div>'));
    for (const name of ['bone', 'collar', 'dog1', 'dog2', 'dog3', 'dog4', 'wild', 'scatter']) new Image().src = `/art/dogs/${name}.webp`;
    const fx = createFx(ui.stage);
    Sound.ambience(null);

    // Le bonus choisi vaut pour les scatters comme pour l'achat ; il est retenu.
    let mode = store.get('dogs.bonus') === 'rain' ? 'rain' : 'sticky';
    ui.extra.innerHTML = `
      <div class="pick" role="radiogroup" aria-label="Bonus ouvert par les trois scatters">
        ${Object.entries(BONUS).map(([k, b]) => `<button type="button" role="radio" data-mode="${k}">${b.name}</button>`).join('')}
      </div>
      <button class="btn quiet buy"></button>`;
    const buyBtn = $('.buy', ui.extra);
    const picks = $$('[data-mode]', ui.extra);
    const labels = () => {
      buyBtn.classList.remove('armed');
      buyBtn.innerHTML = `Acheter ce bonus<small>${App.coin(ui.bet.value * BUY)}</small>`;
      picks.forEach((x) => x.setAttribute('aria-checked', x.dataset.mode === mode));
    };
    picks.forEach((x) => (x.onclick = () => {
      if (busy) return;
      mode = x.dataset.mode;
      store.set('dogs.bonus', mode);
      sfx('arm');
      labels();
    }));
    labels();
    ui.controls.addEventListener('change', labels);
    ui.controls.addEventListener('click', labels);

    const render = (c) => {
      const d = SYM[c.s];
      const tag = c.s === 'WILD' ? `<em>${times(c.v)}</em>` : d.tag ? `<em>${d.tag}</em>` : '';
      return `<div class="sym ${d.cls || ''}"><span>${d.text}</span>${tag}</div>`;
    };
    const reels = new Reels(5, 3, render, () => ({ s: NAMES[Math.floor(Math.random() * NAMES.length)] }));
    ui.frame.append(reels.el);
    // Les niches tenues en place pendant les tours gratuits, posées par-dessus les rouleaux.
    const pinned = el('<div class="pinned rows3" aria-hidden="true"></div>');
    ui.frame.append(pinned);
    const pin = (c, r, v, cls = '') => {
      if ($(`[data-at="${c}-${r}"]`, pinned)) return false;
      pinned.append(el(`<div class="pin ${cls}" data-at="${c}-${r}" style="left:${c * 20}%;top:${(r * 100) / 3}%"><div class="sym wild"><span>${img('wild')}</span><em>${times(v)}</em></div></div>`));
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

    // free : 'sticky' ou 'rain' pendant un bonus, sinon rien.
    async function playSpin(s, free) {
      const rain = free === 'rain';
      if (!free || rain) pinned.replaceChildren();
      const quiet = Sound.reels();
      let bells = 0;
      // Sous la pluie, les rouleaux s'arrêtent sans niche : elles tombent ensuite.
      const shown = rain ? s.grid.map((col) => col.map((x) => (x.s === 'WILD' ? { s: NAMES[Math.floor(Math.random() * NAMES.length)] } : x))) : s.grid;
      await reels.spin(shown, {
        onStop: (c) => {
          sfx('stop', c);
          s.grid[c].forEach((x, r) => {
            if (x.s === 'SCAT') {
              reels.flash([[c, r]], 'pulse');
              sfx('scatter', bells++);
            } else if (x.s === 'WILD' && !free) {
              reels.flash([[c, r]], 'pulse');
              sfx('wild');
            }
          });
        },
      });
      quiet();
      if (rain) {
        const count = $('#pin-count', ui.stage);
        for (const [c, r] of s.rain) {
          pin(c, r, s.grid[c][r].v, 'drop');
          sfx('wild');
          if (count) count.textContent = pinned.children.length;
          await App.wait(140);
        }
        await App.wait(260);
      } else if (free) {
        let fresh = 0;
        s.grid.forEach((col, c) => col.forEach((x, r) => x.s === 'WILD' && pin(c, r, x.v) && fresh++));
        if (fresh) {
          sfx('wild');
          // Le compteur suit tout de suite la niche qui vient de se poser.
          const count = $('#pin-count', ui.stage);
          if (count) count.textContent = pinned.children.length;
          await App.wait(300);
        }
      }
      if (!s.wins.length) return;
      for (const w of s.wins) reels.mark(LINES[w.line].slice(0, w.count).map((r, c) => [c, r]));
      // Une niche tenue en place recouvre sa case : c'est elle qu'on marque quand elle gagne.
      for (const w of s.wins) LINES[w.line].slice(0, w.count).forEach((r, c) => $(`[data-at="${c}-${r}"]`, pinned)?.classList.add('win'));
      const svg = drawLines(s.wins);
      const best = Math.max(...s.wins.map((w) => w.mult));
      sfx('line', Math.min(8, Math.round(Math.log2(1 + s.win * 2))));
      ui.winline.innerHTML = `${s.wins.length} ligne${s.wins.length > 1 ? 's' : ''}${best > 1 ? `, jusqu'à ${times(best)}` : ''} : ${App.coin(Math.round(s.win * bet))}`;
      ui.tally.add(Math.round(s.win * bet));
      await App.wait(1000);
      svg.remove();
      reels.clear();
      $$('.win', pinned).forEach((x) => x.classList.remove('win'));
    }

    // Les neuf tonneaux : chacun s'ouvre sur 1, 2 ou 3 tours.
    async function barrels(b) {
      const total = b.barrels.reduce((n, v) => n + v, 0);
      const node = el(`
        <div class="banner barrels" role="status">
          <div>
            <p>Combien de tours gratuits ?</p>
            <div class="barrel-grid">${b.barrels.map(() => '<b>?</b>').join('')}</div>
            <strong id="barrel-sum">0</strong>
          </div>
        </div>`);
      ui.stage.append(node);
      await App.wait(500);
      let sum = 0;
      const cells = $$('.barrel-grid b', node);
      for (let i = 0; i < cells.length; i++) {
        cells[i].textContent = b.barrels[i];
        cells[i].className = `open n${b.barrels[i]}`;
        sum += b.barrels[i];
        $('#barrel-sum', node).textContent = sum;
        sfx('plop', Math.round(2 + sum / 3));
        await App.wait(230);
      }
      sfx('wheel', Math.min(2, Math.floor((total - 9) / 6)));
      fx.blast($('#barrel-sum', node), 0.4 + (total - 9) / 30, 1.2);
      $('p', node).innerHTML = `${total} tours gratuits<small>${BONUS[b.mode].name}</small>`;
      await App.wait(1400);
      node.remove();
    }

    async function bonus(res) {
      sfx('bonus');
      await barrels(res.bonus);
      ui.stage.classList.add('bonus');
      if (!gone) Sound.ambience('hornpipe');
      let total = 0;
      const kind = res.bonus.mode;
      for (const s of res.bonus.spins) {
        ui.winline.innerHTML = '&nbsp;';
        ui.hud.innerHTML = `<span>Tours restants <b>${s.left}</b></span><span>${BONUS[kind].count} <b id="pin-count">${kind === 'rain' ? 0 : pinned.children.length}</b></span><span>Gain des tours gratuits <b><span class="coin">◈</span><span id="bonus-total" data-value="${Math.round(total * bet)}">${App.fmt(Math.round(total * bet))}</span></b></span>`;
        await playSpin(s, kind);
        total += s.win;
        await countUp($('#bonus-total', ui.stage), Math.round(total * bet), 400);
        await App.wait(150);
      }
      ui.stage.classList.remove('bonus');
      pinned.replaceChildren();
      if (!gone) Sound.ambience(null);
      sfx('bonusEnd');
      ui.hud.innerHTML = '';
      await stageBanner(ui.stage, `${App.coin(Math.round(res.bonus.total * bet))}<small>gagnés en ${res.bonus.spins.length} tours gratuits</small>`, 2200);
    }

    async function spin(buy = false) {
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
      picks.forEach((x) => (x.disabled = true));
      ui.bet.lock(true);
      ui.winline.innerHTML = '&nbsp;';
      ui.tally.reset();
      sfx('lever');
      try {
        const pending = App.api('/api/slots/dogs', buy ? { bet, buy: BONUS[mode].buy } : { bet, mode });
        App.showBalance(App.user.balance - cost);
        const res = await pending;
        await playSpin(res, false);
        if (res.scatterPay) {
          const where = [];
          res.grid.forEach((col, c) => col.forEach((x, r) => x.s === 'SCAT' && where.push([c, r])));
          reels.mark(where, 'collect');
          ui.winline.innerHTML = `3 bonus ${App.coin(Math.round(res.scatterPay * bet))}`;
          ui.tally.add(Math.round(res.scatterPay * bet));
          await App.wait(1000);
          reels.clear();
        }
        if (res.bonus) await bonus(res);
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
      picks.forEach((x) => (x.disabled = false));
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
