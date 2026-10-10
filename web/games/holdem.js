import { $, $$ } from '../lib/dom.js';
import { App } from '../lib/app';
import { Sound } from '../lib/sound.js';
import { createFx } from '../lib/fx.js';

// La table de Texas hold'em : six places, sans limite de mise. On s'assoit avec une cave
// prise sur ses crédits, on joue main après main contre les autres joueurs et contre les
// personnages de la maison, et on repart avec ce qu'il reste. Tout se passe sur le
// serveur ; l'écran redemande l'état de la table un peu plus d'une fois par seconde.
const face = (avatar) => `<img class="pk-face" src="/art/${avatar}.webp" alt="" draggable="false">`;
const card = (c, fresh) => (c ? `<div class="pcard ${'♥♦'.includes(c.s) ? 'red' : ''} ${fresh ? 'new' : ''}"><b>${c.r}</b><span>${c.s}</span></div>` : `<div class="pcard back ${fresh ? 'new' : ''}"></div>`);
const STREET = { preflop: 'Avant le flop', flop: 'Flop', turn: 'Tournant', river: 'Rivière', showdown: 'Abattage', idle: '' };
// Les six places autour de la table, en partant de celle du joueur, en bas.
const SPOTS = ['bottom', 'bottom-left', 'top-left', 'top', 'top-right', 'bottom-right'];

const game = {
  mount(root) {
    if (App.state.practice) {
      root.innerHTML = `
        <div class="panel"><p>La table de poker se joue en classé, avec un compte : on y mise ses crédits contre d'autres joueurs.</p></div>
        <div class="stage pk-stage">
          <div class="scene" aria-hidden="true"><i class="scenery" style="background-image:url(/art/tables/poker-stage.webp)"></i></div>
          <div class="winline">Créez un compte pour vous asseoir à la table</div>
        </div>`;
      return;
    }
    root.innerHTML = `
      <div class="panel">
        <div class="pk-join">
          <div class="field">
            <label for="pk-buyin">Cave (40 à 200 grosses blindes)</label>
            <div class="bet"><span class="coin">◈</span><input id="pk-buyin" type="number" min="40" max="200" step="10" value="100" inputmode="decimal"></div>
          </div>
          <button class="btn primary" id="pk-sit">S'asseoir</button>
        </div>
        <div class="pk-play" hidden>
          <div class="field"><label>Vos jetons</label><div class="readout" id="pk-stack"></div></div>
          <div class="pk-actions">
            <button class="btn quiet" data-act="fold">Se coucher</button>
            <button class="btn quiet" data-act="check">Parole</button>
            <button class="btn quiet" data-act="call">Suivre</button>
          </div>
          <div class="field">
            <label for="pk-raise">Relancer à</label>
            <div class="bet"><span class="coin">◈</span><input id="pk-raise" type="number" step="0.5" inputmode="decimal"></div>
            <input id="pk-slider" type="range" step="50" aria-label="Montant de la relance">
            <div class="pk-presets">
              <button type="button" data-size="0.5">½ pot</button><button type="button" data-size="1">Pot</button><button type="button" data-size="all">Tapis</button>
            </div>
          </div>
          <button class="btn primary" data-act="raise">Relancer</button>
          <button class="btn quiet" id="pk-leave">Quitter la table</button>
        </div>
        <p class="hint">Blindes 0,50 / 1,00, sans limite. Vingt-cinq secondes pour jouer, sinon parole ou main couchée. La maison ne prélève rien ; ses personnages complètent la table.</p>
      </div>
      <div class="stage pk-stage">
        <div class="scene" aria-hidden="true"><i class="scenery" style="background-image:url(/art/tables/poker-stage.webp)"></i></div>
        <div class="pk-table">
          <div class="pk-middle">
            <div class="cards" id="pk-board"></div>
            <div class="pk-pot" id="pk-pot"></div>
          </div>
          <div id="pk-seats"></div>
        </div>
        <div class="winline" id="pk-msg" role="status">Connexion à la table…</div>
      </div>`;
    const stage = $('.stage', root);
    const fx = createFx(stage);
    const msg = $('#pk-msg', root);
    const raise = $('#pk-raise', root);
    const slider = $('#pk-slider', root);
    let gone = false;
    let busy = false;
    let view = null;
    let seen = { hand: -1, board: 0, pot: 0, phase: '', turn: false, cards: {} };

    function draw(t) {
      view = t;
      const fresh = t.hand !== seen.hand;
      if (fresh) seen = { hand: t.hand, board: 0, pot: 0, phase: '', turn: false, cards: {} };
      // Les places, vues depuis celle du joueur : il est toujours en bas.
      const me = t.seats.find((s) => s.you);
      const offset = me ? me.seat : 0;
      let dealt = 0;
      $('#pk-seats', root).innerHTML = t.seats
        .map((s) => {
          const shown = (s.cards || []).length || s.hidden || 0;
          const before = seen.cards[s.seat] || 0;
          const cards = s.cards ? s.cards.map((c, i) => card(c, i >= before && ++dealt)) : Array.from({ length: s.hidden || 0 }, (_, i) => card(null, i >= before && ++dealt));
          seen.cards[s.seat] = shown;
          const note = t.phase === 'showdown' && s.won ? `+${App.fmt(s.won)}` : s.handName && t.phase === 'showdown' ? s.handName : s.last || '';
          return `
            <div class="pk-seat ${SPOTS[(s.seat - offset + 6) % 6]} ${s.you ? 'you' : ''} ${s.turn ? 'active' : ''} ${s.folded || !s.inHand ? 'out' : ''} ${t.phase === 'showdown' && s.won ? 'won' : ''}">
              <div class="cards">${cards.join('')}</div>
              <div class="pk-who">
                ${face(s.avatar)}
                <div><b>${s.you ? 'Vous' : s.name.replace(/[<>&]/g, '')}</b><span>${App.fmt(s.stack)}</span></div>
                ${s.button ? '<i class="pk-button" title="Donneur">D</i>' : ''}
              </div>
              ${note ? `<em class="pk-note">${note}</em>` : ''}
              ${s.bet ? `<i class="pk-bet">${App.fmt(s.bet)}</i>` : ''}
            </div>`;
        })
        .join('');
      $('#pk-board', root).innerHTML = t.board.map((c, i) => card(c, i >= seen.board && ++dealt)).join('');
      $('#pk-pot', root).innerHTML = t.pot ? `Pot ${App.coin(t.pot)}` : '';
      for (let i = 0; i < Math.min(dealt, 6); i++) setTimeout(() => gone || Sound.play('card'), i * 80);
      if (t.pot > seen.pot && !dealt) Sound.play('chip');

      const turn = t.seats.find((s) => s.turn);
      const secs = Math.max(1, Math.ceil(t.remaining / 1000));
      if (t.phase === 'idle') msg.textContent = t.seated ? 'La prochaine main arrive' : "En attente d'un joueur : asseyez-vous pour lancer la partie";
      else if (t.phase === 'showdown') {
        const winners = t.seats.filter((s) => s.won);
        msg.innerHTML = winners.map((s) => `${s.you ? 'Vous gagnez' : `${s.name.replace(/[<>&]/g, '')} gagne`} ${App.coin(s.won)}${s.handName ? ` (${s.handName.toLowerCase()})` : ''}`).join(', ') || 'Main terminée';
      } else if (turn) msg.textContent = `${STREET[t.phase]} : ${turn.you ? `à vous de jouer (${secs} s)` : `au tour de ${turn.name}`}`;
      else msg.textContent = STREET[t.phase];

      // Ce qui vient de changer pour le joueur.
      const mine = !!t.actions;
      if (mine && !seen.turn) Sound.play('arm');
      if (t.phase === 'showdown' && seen.phase !== 'showdown' && me && me.inHand) {
        Sound.play(me.won ? 'line' : me.folded ? 'arm' : 'lose', 3);
        const node = $('.pk-seat.you', root);
        if (node && me.won) setTimeout(() => gone || fx.blast(node, 0.4, 0.9), 250);
      }

      // Le panneau : s'asseoir, ou jouer.
      $('.pk-join', root).hidden = t.seated;
      $('.pk-play', root).hidden = !t.seated;
      $('#pk-stack', root).innerHTML = App.coin(t.stack);
      const a = t.actions;
      $('[data-act=fold]', root).disabled = busy || !a;
      $('[data-act=check]', root).disabled = busy || !a || !a.check;
      const call = $('[data-act=call]', root);
      call.disabled = busy || !a || !a.call;
      call.innerHTML = a && a.call ? `Suivre ${App.fmt(a.call)}` : 'Suivre';
      const canRaise = !!a && a.minRaise > 0;
      $('[data-act=raise]', root).disabled = busy || !canRaise;
      raise.disabled = slider.disabled = !canRaise;
      $$('.pk-presets button', root).forEach((b) => (b.disabled = !canRaise));
      if (canRaise && (!seen.turn || fresh)) {
        slider.min = a.minRaise;
        slider.max = a.maxRaise;
        slider.value = a.minRaise;
        raise.value = (a.minRaise / 100).toFixed(2);
      }
      seen.board = t.board.length;
      seen.pot = t.pot;
      seen.phase = t.phase;
      seen.turn = mine;
    }

    function take(res) {
      if (gone) return;
      draw(res.table);
      if (res.user && res.user.balance !== App.user.balance) App.setUser(res.user);
    }

    async function call(path, body) {
      if (busy) return;
      busy = true;
      try {
        take(await App.api(path, body));
      } catch (e) {
        App.toast(e.message);
      }
      busy = false;
    }

    const amount = () => {
      const a = view && view.actions;
      if (!a) return 0;
      return Math.max(a.minRaise, Math.min(a.maxRaise, Math.round((parseFloat(raise.value) || 0) * 100)));
    };
    slider.oninput = () => (raise.value = (Number(slider.value) / 100).toFixed(2));
    raise.onchange = () => {
      slider.value = amount();
      raise.value = (amount() / 100).toFixed(2);
    };
    $$('.pk-presets button', root).forEach((b) => (b.onclick = () => {
      const a = view && view.actions;
      if (!a) return;
      // Une relance « au pot » : suivre, puis miser ce que le pot contient alors.
      const me = view.seats.find((s) => s.you);
      const to = b.dataset.size === 'all' ? a.maxRaise : me.bet + a.call + Math.round((view.pot + a.call) * Number(b.dataset.size));
      const v = Math.max(a.minRaise, Math.min(a.maxRaise, Math.round(to / 50) * 50));
      slider.value = v;
      raise.value = (v / 100).toFixed(2);
    }));
    $$('[data-act]', root).forEach((b) => (b.onclick = () => call('/api/poker/action', { action: b.dataset.act, amount: b.dataset.act === 'raise' ? amount() : 0 })));
    $('#pk-sit', root).onclick = () => {
      const buyIn = Math.round((parseFloat($('#pk-buyin', root).value) || 0) * 100);
      if (buyIn > App.user.balance) return App.toast('Il ne reste pas assez de crédits pour cette cave');
      call('/api/poker/sit', { buyIn });
    };
    $('#pk-leave', root).onclick = () => call('/api/poker/leave', {});

    const poll = () => busy || document.hidden || App.api('/api/poker').then(take).catch(() => (msg.textContent = 'Table injoignable, nouvel essai…'));
    poll();
    const timer = setInterval(poll, 700);
    return () => {
      gone = true;
      clearInterval(timer);
      fx.destroy();
    };
  },
};

export default game;
