import { $, el } from '../lib/dom.js';
import { App } from '../lib/app';
import { Reels, countUp, stageBanner, bigWin, slotLayout } from '../lib/slotkit.js';
import { Sound } from '../lib/sound.js';
import { createFx } from '../lib/fx.js';
import { language } from '../lib/i18n';

// Les machines à symboles groupés : 6 rouleaux de 5, un symbole paie dès que 8 sont
// visibles, où qu'ils soient ; les gagnants disparaissent, le reste tombe, d'autres
// arrivent. Neptune et Le Récif partagent cette scène (et leur moteur,
// internal/engine/tumble.go) ; ce qui les distingue est dans leur fiche.
const PAYS = [[10, 25, 50], [2.5, 10, 25], [2, 5, 15], [1.5, 2, 12], [1, 1.5, 10], [0.8, 1.2, 8], [0.5, 1, 5], [0.4, 0.9, 4], [0.25, 0.75, 2]];
const BUY = 100;
const times = (m) => `×${m.toLocaleString('fr-FR')}`;
const num = (v, lang) => v.toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR');

// cfg : { id, title, subtitle, art, multName, free (tours gratuits), global (le
// multiplicateur s'accumule), baseMult (multiplicateurs hors tours gratuits), max, like,
// rtp, music }
export function makeTumble(cfg) {
  const img = (name, cls = 'art') => `<img class="${cls}" src="/art/${cfg.art}/${name}.webp" alt="" draggable="false">`;
  const symbol = (s) => img(s.toLowerCase());

  const rules = (lang) => {
    const fr = lang !== 'en';
    const row = (a, b) => `<tr><td>${symbol(`S${a + 1}`)}</td><td>${PAYS[a].map((v) => num(v, lang)).join(' / ')}</td>${b === undefined ? '<td></td><td></td>' : `<td>${symbol(`S${b + 1}`)}</td><td>${PAYS[b].map((v) => num(v, lang)).join(' / ')}</td>`}</tr>`;
    const table = `<table>${row(0, 1)}${row(2, 3)}${row(4, 5)}${row(6, 7)}${row(8)}</table>`;
    if (fr) {
      return `
        <p>6 rouleaux, 5 rangées. Un symbole paie dès que <b>8 exemplaires ou plus</b> sont visibles, où qu'ils soient. Gains en multiples de la mise pour 8 à 9 / 10 à 11 / 12 symboles ou plus :</p>
        ${table}
        <p><b>Chutes</b> : les symboles gagnants disparaissent, le reste tombe et de nouveaux symboles arrivent par le haut. Tant qu'il y a un gain, la chute recommence.</p>
        <p>${img('orb')} <b>${cfg.multName}</b> : ${cfg.baseMult
          ? `il peut tomber à tout moment, avec une valeur de ×2 à ×500, et reste à l'écran jusqu'à la fin du tour. À la fin des chutes, les valeurs visibles s'additionnent et multiplient le gain du tour. En tours gratuits, les multiplicateurs d'un tour gagnant rejoignent un multiplicateur total qui ne redescend plus et s'applique à ce tour.`
          : `il ne tombe qu'en tours gratuits, avec une valeur de ×2 à ×100, et reste à l'écran jusqu'à la fin du tour. À la fin des chutes, les valeurs visibles s'additionnent et multiplient le gain du tour.`}</p>
        <p>${img('scatter')} <b>Scatter</b> : 4, 5 ou 6 paient 3, 5 ou 100 fois la mise et offrent ${cfg.free} tours gratuits. Pendant les tours gratuits, 3 scatters ou plus ajoutent 5 tours, sans limite.</p>
        <p><b>Mise ante</b> : le tour coûte un quart de plus et les tours gratuits tombent deux fois plus souvent. <b>Achat</b> : les tours gratuits pour 100 fois la mise.</p>
        <p>Gain maximal : ${num(cfg.max, lang)} fois la mise. Les règles et la table des gains sont celles de ${cfg.like} ; ses rouleaux n'étant pas publics, les fréquences sont réglées par simulation sur ses chiffres connus (retour de ${cfg.rtp}, tours gratuits tous les 450 tours environ).</p>`;
    }
    return `
      <p>6 reels, 5 rows. A symbol pays as soon as <b>8 or more</b> are in view, wherever they are. Wins in multiples of the bet for 8 to 9 / 10 to 11 / 12 symbols or more:</p>
      ${table}
      <p><b>Tumbles</b>: winning symbols disappear, the rest falls and new symbols come in from the top. As long as there is a win, the tumble goes on.</p>
      <p>${img('orb')} <b>Multiplier</b>: ${cfg.baseMult
        ? `it can land at any time, with a value from ×2 to ×500, and stays on screen until the end of the spin. When the tumbles end, the values in view add up and multiply the win of the spin. In free spins, the multipliers of a winning spin join a total multiplier that never goes back down and applies to that spin.`
        : `it only lands in free spins, with a value from ×2 to ×100, and stays on screen until the end of the spin. When the tumbles end, the values in view add up and multiply the win of the spin.`}</p>
      <p>${img('scatter')} <b>Scatter</b>: 4, 5 or 6 pay 3, 5 or 100 times the bet and award ${cfg.free} free spins. During free spins, 3 scatters or more add 5 spins, with no limit.</p>
      <p><b>Ante bet</b>: the spin costs a quarter more and free spins come twice as often. <b>Buy</b>: the free spins for 100 times the bet.</p>
      <p>Maximum win: ${num(cfg.max, lang)} times the bet. The rules and the paytable are those of ${cfg.like}; its reels are not public, so the frequencies are tuned by simulation on its known figures (return of ${cfg.rtp.replace(',', '.')}, free spins every 450 spins or so).</p>`;
  };

  return {
    mount(root) {
      const ui = slotLayout(root, { title: cfg.title, subtitle: cfg.subtitle, rules: rules(language()) });
      let bet = ui.bet.value;
      let busy = false;
      let gone = false;
      const sfx = (...a) => gone || Sound.play(...a);
      const replay = (node, cls) => {
        node.classList.remove(cls);
        void node.offsetWidth;
        node.classList.add(cls);
      };

      ui.stage.prepend(el(`<div class="scene" aria-hidden="true"><i class="scenery" style="background-image:url(/art/${cfg.art}/stage.webp)"></i><i class="glow"></i></div>`));
      for (let i = 1; i <= 9; i++) new Image().src = `/art/${cfg.art}/s${i}.webp`;
      const fx = createFx(ui.stage);
      Sound.ambience('sea');

      const ante = el('<label class="toggle"><input type="checkbox"> Mise ante : un quart plus cher, tours gratuits deux fois plus fréquents</label>');
      ui.controls.append(ante);
      const isAnte = () => $('input', ante).checked;
      ui.extra.innerHTML = '<p class="buy-title">Acheter les tours gratuits</p><button class="btn quiet buy"></button>';
      const buyBtn = $('.buy', ui.extra);
      const labels = () => {
        const b = ui.bet.value;
        ui.play.innerHTML = isAnte() ? `Lancer pour ${App.fmt(b * 1.25)}` : 'Lancer';
        buyBtn.classList.remove('armed');
        buyBtn.innerHTML = `${cfg.free} tours gratuits<small>${App.coin(b * BUY)}</small>`;
      };
      labels();
      ui.controls.addEventListener('change', labels);
      ui.controls.addEventListener('click', labels);

      const render = (c) => {
        if (c.s === 'ORB') return `<div class="sym orb"><span>${img('orb')}<b>${times(c.v)}</b></span></div>`;
        if (c.s === 'SCAT') return `<div class="sym scatter"><span>${img('scatter')}</span><em>SCATTER</em></div>`;
        return `<div class="sym"><span>${symbol(c.s)}</span></div>`;
      };
      const reels = new Reels(6, 5, render, () => ({ s: `S${1 + Math.floor(Math.random() * 9)}` }));
      ui.frame.append(reels.el);
      const where = (grid, test) => {
        const cells = [];
        grid.forEach((col, c) => col.forEach((x, r) => test(x) && cells.push([c, r])));
        return cells;
      };

      // Joue un tour déjà tiré : la chute d'entrée, puis chaque chute gagnante, puis les
      // multiplicateurs. Rend le gain du tour en crédits.
      async function playSpin(s) {
        const first = s.steps[0].grid;
        const quiet = Sound.reels();
        let bells = 0;
        await reels.spin(first, {
          onStop: (c) => {
            sfx('stop', c);
            first[c].forEach((x, r) => {
              if (x.s === 'SCAT') {
                reels.flash([[c, r]], 'pulse');
                sfx('scatter', bells++);
              } else if (x.s === 'ORB') {
                reels.flash([[c, r]], 'pulse');
                sfx('wild');
              }
            });
          },
        });
        quiet();
        let base = 0;
        for (let i = 0; i < s.steps.length; i++) {
          const step = s.steps[i];
          if (!step.wins.length) break;
          const syms = new Set(step.wins.map((w) => w.sym));
          const cells = where(step.grid, (x) => syms.has(x.s));
          reels.mark(cells);
          sfx('win', Math.min(8, i + Math.round(Math.log2(1 + step.win))));
          base += step.win;
          ui.winline.innerHTML = `${step.wins.map((w) => `${w.count} × ${symbol(w.sym)}`).join('  ')} ${App.coin(Math.round(step.win * bet))}`;
          ui.tally.add(Math.round(step.win * bet));
          await App.wait(650);
          const next = s.steps[i + 1];
          if (!next) break;
          sfx('pop');
          await reels.cascade(cells, next.grid, null, { onLand: () => sfx('land') });
          // Ce qui vient d'arriver : un scatter, un multiplicateur.
          const fresh = where(next.grid, (x) => x.s === 'ORB' || x.s === 'SCAT');
          if (fresh.length) reels.flash(fresh, 'pulse');
        }
        // Les multiplicateurs : chacun éclate, leur somme multiplie le gain du tour.
        const last = s.steps[s.steps.length - 1].grid;
        if (s.mult > 1 && base > 0) {
          const orbs = where(last, (x) => x.s === 'ORB');
          reels.mark(orbs, 'collect');
          for (const [c, r] of orbs) {
            fx.blast(reels.cell(c, r), 0.3, 0.7);
            sfx('plop', Math.min(13, 4 + Math.round(Math.log2(last[c][r].v) * 2)));
            await App.wait(220);
          }
          ui.winline.innerHTML = `${App.coin(Math.round(base * bet))} ${times(s.mult)}`;
          const stamp = el(`<div class="hitmult tumble-mult">${times(s.mult)}</div>`);
          const box = ui.frame.getBoundingClientRect();
          stamp.style.left = `${box.left + box.width / 2}px`;
          stamp.style.top = `${box.top + box.height / 2}px`;
          document.body.append(stamp);
          setTimeout(() => stamp.remove(), 1100);
          sfx('cannon', Math.min(1, Math.log2(s.mult) / 8));
          ui.stage.style.setProperty('--kick', `${3 + Math.min(8, Math.log2(s.mult))}px`);
          replay(ui.stage, 'shake');
          ui.tally.add(Math.round(base * (s.mult - 1) * bet));
          await App.wait(900);
        }
        reels.clear();
      }

      async function bonus(res) {
        sfx('bonus');
        await stageBanner(ui.stage, `${res.awarded} tours gratuits<small>${cfg.global ? 'Les multiplicateurs s\'accumulent' : 'Les multiplicateurs entrent en jeu'}</small>`, 2200);
        ui.stage.classList.add('bonus');
        if (!gone) Sound.ambience(cfg.music);
        let total = 0;
        const hud = (left, global) => {
          ui.hud.innerHTML = `<span>Tours restants <b>${left}</b></span>${cfg.global ? `<span>Multiplicateur total <b>${times(global || 1)}</b></span>` : ''}<span>Gain des tours gratuits <b><span class="coin">◈</span><span id="bonus-total">${App.fmt(Math.round(total * bet))}</span></b></span>`;
        };
        let global = 0;
        let left = res.awarded;
        for (const s of res.bonus.spins) {
          ui.winline.innerHTML = '&nbsp;';
          hud(left, global);
          await playSpin(s);
          total += s.win;
          global = s.global;
          left = s.left;
          hud(left, global);
          await countUp($('#bonus-total', ui.stage), Math.round(total * bet), 400);
          if (s.retrigger) {
            sfx('bonus');
            await stageBanner(ui.stage, '5 tours de plus', 1300);
          }
          await App.wait(150);
        }
        ui.stage.classList.remove('bonus');
        if (!gone) Sound.ambience('sea');
        sfx('bonusEnd');
        ui.hud.innerHTML = '';
        await stageBanner(ui.stage, `${App.coin(Math.round(res.bonus.total * bet))}<small>gagnés en ${res.bonus.spins.length} tours gratuits</small>`, 2200);
      }

      async function spin(buy) {
        if (busy) return false;
        bet = ui.bet.value;
        const opts = buy ? { buy: 'fs' } : isAnte() ? { ante: true } : {};
        const cost = Math.round(bet * (buy ? BUY : opts.ante ? 1.25 : 1));
        if (cost > App.user.balance) {
          App.toast(buy ? 'Il ne reste pas assez de crédits pour cet achat' : 'Il ne reste pas assez de crédits pour cette mise');
          return false;
        }
        let played = false;
        busy = true;
        root.querySelectorAll('.panel button:not(.auto-btn), .panel input').forEach((x) => (x.disabled = true));
        ui.winline.innerHTML = '&nbsp;';
        ui.tally.reset();
        sfx('lever');
        try {
          const pending = App.api(`/api/slots/${cfg.id}`, { bet, ...opts });
          App.showBalance(App.user.balance - cost);
          const res = await pending;
          await playSpin(res);
          if (res.scatterPay) {
            ui.winline.innerHTML = `${res.scatters} scatters ${App.coin(Math.round(res.scatterPay * bet))}`;
            ui.tally.add(Math.round(res.scatterPay * bet));
          }
          if (res.bonus) {
            reels.mark(where(res.steps[res.steps.length - 1].grid, (x) => x.s === 'SCAT'), 'collect');
            await App.wait(1000);
            reels.clear();
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
        root.querySelectorAll('.panel button:not(.auto-btn), .panel input').forEach((x) => (x.disabled = false));
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
}
