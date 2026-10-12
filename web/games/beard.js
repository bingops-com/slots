import { $, $$, el, sleep, esc } from '../lib/dom.js';
import { App } from '../lib/app';
import { Art } from '../lib/art.js';
import { Reels, centre, stageBanner, bigWin, slotLayout } from '../lib/slotkit.js';
import { Sound } from '../lib/sound.js';
import { arc, createFx } from '../lib/fx.js';
import { language } from '../lib/i18n';

// Habillage des symboles : tout le visuel du jeu se change ici. Les illustrations sont
// préparées par art/build.py à partir de art/beard/src.
const img = (name) => `<img class="art" src="/art/beard/${name}.webp" alt="" draggable="false">`;
const SYM = {
  BOTTLE: { text: img('bottle'), cls: 'low' }, ANCHOR: { text: img('anchor'), cls: 'low' }, HELM: { text: img('helm'), cls: 'low' },
  COMPASS: { text: img('compass'), cls: 'low' }, PISTOL: { text: img('pistol'), cls: 'low' },
  SAILOR: { text: img('sailor'), cls: 'crew' }, GUNNER: { text: img('gunner'), cls: 'crew' }, LOOKOUT: { text: img('lookout'), cls: 'crew' },
  CORSAIR: { text: img('corsair'), cls: 'crew' }, CAPTAIN: { text: img('captain'), cls: 'crew' },
  WILD: { text: img('wild'), cls: 'wild', tag: 'WILD' }, SCAT: { text: img('chest'), cls: 'scatter', tag: 'SCATTER' },
};
const NAMES = Object.keys(SYM).slice(0, 10);
const BUYS = {
  fs7: { cost: 100, label: '7 tours gratuits' },
  fsr: { cost: 200, label: 'La roue : 7, 10 ou 13 tours' },
};
// La roue de l'achat au hasard : 8 parts de 7 tours, 3 de 10 et 1 de 13, proches des
// chances réelles (68 %, 25 % et 7 %). Le tirage est fait avant qu'elle tourne.
const WHEEL = [7, 10, 7, 7, 13, 7, 10, 7, 7, 10, 7, 7];
const PART = 360 / WHEEL.length;
const times = (m) => `×${m.toLocaleString('fr-FR')}`;
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const rules = `
  <p>5 rouleaux, 3 rangées, <b>243 façons de gagner</b> : un symbole paie dès qu'il apparaît sur 3 rouleaux consécutifs ou plus en partant de la gauche, quelle que soit sa position. Gains par façon, en multiples de la mise, pour 3 / 4 / 5 rouleaux :</p>
  <table>
    <tr><td>${img('captain')}</td><td>0,2 / 0,58 / 10</td><td>${img('corsair')}</td><td>0,16 / 0,4 / 8</td></tr>
    <tr><td>${img('lookout')}</td><td>0,12 / 0,32 / 6</td><td>${img('sailor')} ${img('gunner')}</td><td>0,1 / 0,24 / 5</td></tr>
    <tr><td>${img('compass')} ${img('pistol')}</td><td>0,06 / 0,16 / 3</td><td>${img('bottle')} ${img('anchor')} ${img('helm')}</td><td>0,04 / 0,12 / 2,5</td></tr>
  </table>
  <p><b>Cascades à wild</b> : les symboles gagnants disparaissent, un ${img('wild')} <b>wild</b> prend l'une des places libérées, le reste tombe et de nouveaux symboles complètent la grille. Tant qu'il y a un gain, la cascade recommence.</p>
  <p>${img('cannon')} <b>Multiplicateur</b> : le canon tire à chaque gain. Le premier gain d'un tour compte une fois, puis le multiplicateur double à chaque cascade gagnante (×2, ×4, ×8…), sans plafond. Il repart à ×1 au tour suivant.</p>
  <p><b>Saut de multiplicateur</b> : après un gain, le multiplicateur peut au hasard monter d'un cran de plus, jusqu'à trois fois d'affilée.</p>
  <p>${img('chest')} <b>Scatter</b> : 3, 4 ou 5 à la fin d'un tour offrent 7, 10 ou 13 tours gratuits, pendant lesquels le multiplicateur ne redescend jamais. Les tours gratuits ne se redéclenchent pas.</p>
  <p><b>Mise dorée</b> : le tour coûte moitié plus cher et les tours gratuits tombent environ deux fois plus souvent. <b>Achat</b> : 7 tours gratuits pour 100 fois la mise, ou la roue pour 200 fois la mise. La roue donne 7 tours 68 fois sur 100, 10 tours 25 fois sur 100 et 13 tours 7 fois sur 100.</p>
  <p>Gain maximal : 20 000 fois la mise. Les règles sont celles de Barbarossa DoubleMax ; sa table des gains détaillée n'étant pas publique, les gains à 3 et 4 rouleaux et les fréquences sont réglés par simulation pour un retour proche de 95 %.</p>`;

const rulesEn = `
  <p>5 reels, 3 rows, <b>243 ways to win</b>: a symbol pays as soon as it appears on 3 or more consecutive reels from the left, whatever its position. Wins per way, in multiples of the bet, for 3 / 4 / 5 reels:</p>
  <table>
    <tr><td>${img('captain')}</td><td>0.2 / 0.58 / 10</td><td>${img('corsair')}</td><td>0.16 / 0.4 / 8</td></tr>
    <tr><td>${img('lookout')}</td><td>0.12 / 0.32 / 6</td><td>${img('sailor')} ${img('gunner')}</td><td>0.1 / 0.24 / 5</td></tr>
    <tr><td>${img('compass')} ${img('pistol')}</td><td>0.06 / 0.16 / 3</td><td>${img('bottle')} ${img('anchor')} ${img('helm')}</td><td>0.04 / 0.12 / 2.5</td></tr>
  </table>
  <p><b>Wild cascades</b>: winning symbols disappear, a ${img('wild')} <b>wild</b> takes one of the freed positions, the rest falls and new symbols fill the grid. As long as there is a win, the cascade goes on.</p>
  <p>${img('cannon')} <b>Multiplier</b>: the cannon fires with every win. The first win of a spin counts once, then the multiplier doubles with every winning cascade (×2, ×4, ×8…), with no cap. It goes back to ×1 on the next spin.</p>
  <p><b>Multiplier jump</b>: after a win, the multiplier may randomly go up one more step, up to three times in a row.</p>
  <p>${img('chest')} <b>Scatter</b>: 3, 4 or 5 at the end of a spin award 7, 10 or 13 free spins, during which the multiplier never goes back down. Free spins do not retrigger.</p>
  <p><b>Golden bet</b>: the spin costs half as much again and free spins come about twice as often. <b>Buy</b>: 7 free spins for 100 times the bet, or the wheel for 200 times the bet. The wheel gives 7 spins 68 times out of 100, 10 spins 25 times out of 100 and 13 spins 7 times out of 100.</p>
  <p>Maximum win: 20,000 times the bet. The rules are those of Barbarossa DoubleMax; its detailed paytable is not public, so the wins for 3 and 4 reels and the frequencies are tuned by simulation for a return close to 95%.</p>`;

const game = {
  mount(root) {
    const ui = slotLayout(root, { title: 'Barbe-<span>Rouge</span>', subtitle: 'Des cascades qui doublent le multiplicateur à chaque gain, jusqu\'à 20 000 fois la mise.', rules: language() === 'en' ? rulesEn : rules,
      feature: { art: '/art/beard/chest.webp', title: 'Le coffre du capitaine', text: '3 coffres ou plus : 7, 10 ou 13 tours gratuits, où le multiplicateur ne redescend plus.' } });
    let bet = ui.bet.value;
    let busy = false;
    // Une partie quittée en cours de tour ne doit plus rien faire entendre.
    let gone = false;
    const sfx = (...a) => gone || Sound.play(...a);

    // La scène : une nuit en mer, qui tourne à la lune rouge pendant les tours gratuits.
    ui.stage.prepend(el('<div class="scene" aria-hidden="true"><i class="night"></i><i class="night boarding"></i></div>'));
    // Les illustrations sont demandées d'avance : aucun symbole n'arrive en retard sur un rouleau.
    for (const name of ['bottle', 'anchor', 'helm', 'compass', 'pistol', 'sailor', 'gunner', 'lookout', 'corsair', 'captain', 'wild', 'chest', 'stage-bonus']) {
      new Image().src = `/art/beard/${name}.webp`;
    }

    const golden = el('<label class="toggle"><input type="checkbox"> Mise dorée : moitié plus cher, bonus deux fois plus fréquent</label>');
    ui.controls.append(golden);
    const isGolden = () => $('input', golden).checked;
    ui.extra.innerHTML = `
      <p class="buy-title">Acheter les tours gratuits</p>
      ${Object.entries(BUYS).map(([k]) => `<button class="btn quiet buy" data-buy="${k}"></button>`).join('')}`;
    const buyButtons = $$('[data-buy]', ui.extra);
    const labels = () => {
      const b = ui.bet.value;
      ui.play.innerHTML = isGolden() ? `Lancer pour ${App.fmt(b * 1.5)}` : 'Lancer';
      buyButtons.forEach((x) => {
        x.classList.remove('armed');
        x.innerHTML = `${BUYS[x.dataset.buy].label}<small>${App.coin(b * BUYS[x.dataset.buy].cost)}</small>`;
      });
    };
    labels();
    ui.controls.addEventListener('change', labels);
    ui.controls.addEventListener('click', labels);

    const render = (s) => `<div class="sym ${SYM[s].cls || ''}"><span>${SYM[s].text}</span>${SYM[s].tag ? `<em>${SYM[s].tag}</em>` : ''}</div>`;
    const reels = new Reels(5, 3, render, () => NAMES[Math.floor(Math.random() * NAMES.length)]);
    ui.frame.append(reels.el);

    // Le pont : Barbe-Rouge, son canon et la chaîne de boulets, du multiplicateur en
    // cours aux suivants.
    ui.under.innerHTML = `
      <div class="deck">
        <div class="battery">
          <span class="hero">${img('hero')}</span>
          <span class="cannon"><span class="barrel">${img('cannon')}<i class="spark"></i></span><i class="muzzle"></i></span>
        </div>
        <div class="trail"></div>
      </div>`;
    const hero = $('.hero', ui.under);
    const cannon = $('.cannon', ui.under);
    const barrel = $('.barrel', ui.under);
    const muzzle = $('.muzzle', ui.under);
    const fx = createFx(ui.stage);
    const balls = $('.trail', ui.under);
    let shown = 0;
    const trail = (mult, extra = '') => {
      balls.setAttribute('aria-label', `Multiplicateur ${times(mult)}`);
      balls.innerHTML = [0, 1, 2, 3, 4].map((i) => `<b class="${i === 0 ? 'on' : ''}">${times(mult * 2 ** i)}</b>`).join('');
      // Quand le multiplicateur monte, la chaîne avance d'un cran vers le canon.
      if (mult > shown && shown) replay(balls, 'advance');
      shown = mult;
      ui.hud.innerHTML = extra;
    };
    const replay = (node, cls) => {
      node.classList.remove(cls);
      void node.offsetWidth;
      node.classList.add(cls);
    };
    trail(1);
    Sound.ambience(null);

    // Le milieu d'un groupe de cases, là où le boulet doit tomber.
    const middle = (cells) => {
      const pts = cells.map(([c, r]) => centre(reels.cell(c, r)));
      return { x: pts.reduce((n, p) => n + p.x, 0) / pts.length, y: pts.reduce((n, p) => n + p.y, 0) / pts.length };
    };

    // L'illustration du canon pointe à 30° au-dessus de l'horizontale.
    const BARREL = 30;
    let rest = 0;

    // Le tir : le canon se pointe sur les cases gagnantes pendant que la mèche grésille,
    // recule en crachant sa fumée, et le boulet retombe en cloche sur la grille. Plus le
    // multiplicateur est haut, plus le coup est fort.
    async function fire(mult, cells) {
      const power = Math.min(1, Math.log2(mult) / 6);
      const target = middle(cells);
      clearTimeout(rest);
      const from = centre(muzzle);
      const top = arc(from, target);
      const climb = (Math.atan2(from.y - top.y, top.x - from.x) * 180) / Math.PI;
      cannon.style.transform = `rotate(${Math.max(-52, Math.min(14, BARREL - climb))}deg)`;
      sfx('fuse');
      replay(cannon, 'lit');
      replay(hero, 'order');
      await App.wait(320);
      sfx('cannon', power);
      replay(barrel, 'fire');
      await fx.shot({ from: centre(muzzle), to: target, power, fast: App.turbo });
      if (gone) return;
      sfx('hit', power);
      reels.flash(cells, 'hit');
      // À partir de ×2, le multiplicateur est frappé sur la grille.
      if (mult > 1) {
        const stamp = el(`<div class="hitmult" style="left:${target.x}px;top:${target.y}px">${times(mult)}</div>`);
        document.body.append(stamp);
        setTimeout(() => stamp.remove(), 1100);
      }
      ui.stage.style.setProperty('--kick', `${3 + 9 * power}px`);
      replay(ui.stage, 'shake');
      // Le canon revient à sa place une fois la fumée partie.
      rest = setTimeout(() => (cannon.style.transform = ''), 700);
    }

    const teaseFor = (grid) => {
      let seen = 0;
      return grid.map((col) => {
        const t = seen >= 2;
        seen += col.filter((s) => s === 'SCAT').length;
        return t;
      });
    };
    const where = (grid, sym) => {
      const cells = [];
      grid.forEach((col, c) => col.forEach((s, r) => s === sym && cells.push([c, r])));
      return cells;
    };

    // Joue les cascades d'un tour. extra() redonne le texte du bandeau (tours restants…).
    async function playSteps(s, extra = () => '', tease = true) {
      const first = s.steps[0].grid;
      const quiet = Sound.reels();
      let bells = 0;
      await reels.spin(first, {
        tease: tease ? teaseFor(first) : [],
        onTease: () => sfx('tease'),
        onStop: (c) => {
          sfx('stop', c);
          first[c].forEach((x, r) => {
            if (x !== 'SCAT') return;
            reels.flash([[c, r]], 'pulse');
            sfx('scatter', bells++);
          });
        },
      });
      quiet();
      for (let i = 0; i < s.steps.length; i++) {
        const step = s.steps[i];
        if (!step.wins.length) break;
        const cells = step.wins.flatMap((w) => w.cells);
        reels.mark(cells);
        sfx('win', Math.round(Math.log2(step.mult)));
        await App.wait(180);
        await fire(step.mult, cells);
        ui.winline.innerHTML = `${step.wins.map((w) => `${SYM[w.sym].text}×${w.len}`).join(' ')} ${App.coin(Math.round(step.win * bet))}${step.mult > 1 ? ` (${times(step.mult)})` : ''}`;
        ui.tally.add(Math.round(step.win * bet));
        await App.wait(600);
        let mult = step.mult * 2;
        trail(mult, extra());
        for (let j = 0; j < step.jumps; j++) {
          await App.wait(350);
          mult *= 2;
          ui.winline.textContent = `Saut de multiplicateur : ${times(mult)}`;
          trail(mult, extra());
          $('b', balls).classList.add('jump');
          sfx('jump', j);
        }
        if (step.jumps) await App.wait(500);
        const next = s.steps[i + 1];
        if (!next) break;
        sfx('pop');
        await reels.cascade(cells, next.grid, next.wild, { onLand: () => sfx('land') });
        if (next.wild) sfx('wild');
      }
    }

    // L'achat au hasard se joue à la barre du navire : elle s'arrête sur le nombre de
    // tours déjà tiré.
    async function fortune(awarded) {
      const hits = WHEEL.map((v, i) => (v === awarded ? i : -1)).filter((i) => i >= 0);
      const hit = hits[Math.floor(Math.random() * hits.length)];
      const node = el(`
        <div class="banner fortune" role="status">
          <div>
            <p>Combien de tours gratuits ?</p>
            <div class="wheel">
              <i class="pointer"></i>
              <div class="disc">
                ${WHEEL.map((v, i) => `<i class="peg" style="--a:${i * PART + PART / 2}deg"></i><b class="n${v}" style="--a:${i * PART}deg">${v}</b>`).join('')}
              </div>
              <span class="hub">${img('helm')}</span>
            </div>
          </div>
        </div>`);
      ui.stage.append(node);
      const disc = $('.disc', node);
      const pointer = $('.pointer', node);
      const total = 360 * (App.turbo ? 2 : 5) - hit * PART + (Math.random() * 18 - 9);
      const ms = still() ? 0 : App.turbo ? 1600 : 4800;
      await App.wait(500);
      const t0 = performance.now();
      let done = false;
      let last = 0;
      const frame = (t) => {
        if (done) return;
        const k = Math.min(1, (t - t0) / ms);
        const a = total * (1 - (1 - k) ** 3.2);
        disc.style.transform = `rotate(${a}deg)`;
        const part = Math.floor((a + PART / 2) / PART);
        if (part !== last) {
          last = part;
          sfx('tick');
          replay(pointer, 'flick');
        }
        if (k < 1) requestAnimationFrame(frame);
      };
      if (ms) requestAnimationFrame(frame);
      await sleep(ms + 50);
      done = true;
      disc.style.transform = `rotate(${total}deg)`;
      if (gone) return node.remove();
      // L'arrêt : l'aiguille claque, la part tirée reste seule éclairée, puis le nombre
      // sort de la roue et vient s'afficher en grand au milieu.
      const tier = [7, 10, 13].indexOf(awarded);
      const wheel = $('.wheel', node);
      replay(pointer, 'flick');
      sfx('tick');
      wheel.style.setProperty('--slice', `${(((total % 360) + 360) % 360) + hit * PART}deg`);
      wheel.classList.add('won');
      await App.wait(450);
      sfx('wheel', tier);
      const prize = el(`<div class="prize t${tier}"><b>${awarded}</b><span>tours gratuits</span></div>`);
      wheel.append(prize);
      fx.blast($('.hub', node), 0.3 + 0.35 * tier, 1.2 + 0.5 * tier);
      ui.stage.style.setProperty('--kick', `${3 + 3 * tier}px`);
      replay(ui.stage, 'shake');
      $('p', node).textContent = awarded === 13 ? 'Le gros lot de la roue' : awarded === 10 ? 'Belle prise' : "C'est parti";
      await App.wait(1900);
      node.remove();
    }

    async function bonus(res, announced) {
      sfx('bonus');
      if (!announced) await stageBanner(ui.stage, `À l'abordage<small>${res.awarded} tours gratuits, le multiplicateur ne redescend plus</small>`, 2200);
      ui.stage.classList.add('bonus');
      replay(hero, 'cheer');
      if (!gone) Sound.ambience('shanty');
      let total = 0;
      let left = res.awarded;
      const extra = () => `<span>Tours restants <b>${left}</b></span><span>Gain des tours gratuits <b>${App.coin(Math.round(total * bet))}</b></span>`;
      trail(1, extra());
      for (const s of res.bonus.spins) {
        ui.winline.innerHTML = '&nbsp;';
        left = s.left;
        trail(s.steps[0].mult, extra());
        await playSteps(s, extra, false);
        total += s.win;
        trail(s.mult, extra());
        await App.wait(250);
      }
      ui.stage.classList.remove('bonus');
      if (!gone) Sound.ambience(null);
      sfx('bonusEnd');
      await stageBanner(ui.stage, `${App.coin(Math.round(res.bonus.total * bet))}<small>gagnés en ${res.bonus.spins.length} tours gratuits</small>`, 2200);
    }

    async function spin(buy) {
      if (busy) return false;
      let played = false;
      bet = ui.bet.value;
      const opts = buy ? { buy } : isGolden() ? { golden: true } : {};
      const cost = Math.round(bet * (buy ? BUYS[buy].cost : opts.golden ? 1.5 : 1));
      if (cost > App.user.balance) {
        App.toast(buy ? 'Il ne reste pas assez de crédits pour cet achat' : 'Il ne reste pas assez de crédits pour cette mise');
        return false;
      }
      busy = true;
      $$('button:not(.auto-btn), input', ui.controls.parentNode).forEach((x) => (x.disabled = true));
      ui.winline.innerHTML = '&nbsp;';
      ui.tally.reset();
      trail(1);
      sfx('lever');
      try {
        const pending = App.api('/api/slots/beard', { bet, ...opts });
        App.showBalance(App.user.balance - cost);
        const res = await pending;
        if (buy === 'fsr') await fortune(res.awarded);
        if (res.steps.length) await playSteps(res);
        if (res.bonus) {
          if (res.steps.length) {
            reels.mark(where(res.steps[res.steps.length - 1].grid, 'SCAT'), 'collect');
            await App.wait(1000);
          }
          await bonus(res, buy === 'fsr');
          trail(1);
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
        x.innerHTML = `Confirmer l'achat<small>${App.coin(ui.bet.value * BUYS[x.dataset.buy].cost)}</small>`;
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
      clearTimeout(rest);
      fx.destroy();
      Sound.ambience(null);
    };
  },
};

export default game;
