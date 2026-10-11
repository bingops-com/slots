import { $, $$, el, sleep, store } from '../lib/dom.js';
import { App } from '../lib/app';
import { Sound } from '../lib/sound.js';
import { createFx } from '../lib/fx.js';

// La table de blackjack à plusieurs : cinq places, une donne commune, chacun joue sa main
// à son tour contre le même croupier, de la première place à la dernière. On choisit sa
// place en la touchant sur le tapis. La donne part dès que tous les joueurs présents ont
// misé, et personne n'attend plus de cinq secondes. Tout se passe sur le serveur : l'écran
// lui demande ce qui a changé, et la réponse arrive au moment où quelque chose se passe.
const pic = (name) => `<img class="pic" src="/art/tables/${name}.webp" alt="" draggable="false">`;
const LABEL = { win: 'gagné', lose: 'perdu', push: 'égalité', blackjack: 'blackjack' };
const PLACES = 5;
const secs = (ms) => Math.max(1, Math.ceil(ms / 1000));
// Le rythme du tirage : entre deux cartes de la donne, le trajet d'une carte depuis la main
// du croupier, la carte cachée qui se retourne, puis chaque carte que le croupier se sert.
const STEP = 130;
const FLY = 460;
const TURN = 420;
const DRAW = 520;
const points = (cards) => {
  let t = 0;
  let aces = 0;
  for (const c of cards) {
    t += c.r === 'A' ? 11 : 'KQJ'.includes(c.r) ? 10 : Number(c.r);
    if (c.r === 'A') aces++;
  }
  for (; t > 21 && aces; aces--) t -= 10;
  return t;
};

const game = {
  mount(root) {
    if (App.state.practice) {
      root.innerHTML = `
        <div class="panel"><p>La table à plusieurs se joue en classé, avec un compte. À l'entraînement, le <a href="/g/blackjack/">blackjack en solo</a> reste ouvert.</p></div>
        <div class="stage bj-stage">
          <div class="scene" aria-hidden="true"><i class="scenery" style="background-image:url(/art/tables/blackjack-stage.webp)"></i></div>
          <div class="croupier">${pic('dealer')}</div>
          <div class="winline">Créez un compte pour vous asseoir à la table</div>
        </div>`;
      return;
    }
    root.innerHTML = `
      <div class="panel tb-panel">
        <div class="controls"></div>
        <button class="btn primary play">Miser</button>
        <div class="bj-actions">
          <button class="btn quiet" data-act="hit">Tirer</button>
          <button class="btn quiet" data-act="stand">Rester</button>
          <button class="btn quiet" data-act="double">Doubler</button>
        </div>
        <p class="hint">Cinq places : touchez celle où vous voulez miser. La donne part dès que tous les joueurs présents ont misé, cinq secondes au plus après la première mise. Cinq secondes pour jouer, sinon la main reste. Blackjack payé 3 pour 2, le croupier reste à 17.</p>
      </div>
      <div class="stage bj-stage tb-stage">
        <div class="scene" aria-hidden="true"><i class="scenery" style="background-image:url(/art/tables/blackjack-stage.webp)"></i></div>
        <div class="croupier">${pic('dealer')}</div>
        <div class="bj-row"><h4>Croupier <b id="tb-dt"></b></h4><div class="cards" id="tb-dealer"></div></div>
        <div class="tb-status">
          <div class="winline" id="tb-msg" role="status">Connexion à la table…</div>
          <div class="tb-clock" id="tb-clock" hidden><i></i></div>
        </div>
        <div class="tb-seats" id="tb-seats"></div>
      </div>`;
    const bet = App.betControl();
    $('.controls', root).append(bet.el);
    const stage = $('.stage', root);
    const fx = createFx(stage);
    const croupier = $('.croupier', root);
    const play = $('.play', root);
    const msg = $('#tb-msg', root);
    const clockBar = $('#tb-clock', root);
    const panel = $('.tb-panel', root);
    const dealerEl = $('#tb-dealer', root);
    const dealerSum = $('#tb-dt', root);
    const seatsEl = $('#tb-seats', root);
    let gone = false;
    let busy = false;
    let myTurn = false;
    let phase = '';
    // Ce qui est posé sur le tapis. Rien n'est redessiné : une carte nouvelle s'ajoute aux
    // autres, pour qu'une carte en vol ne soit jamais interrompue.
    const blank = () => ({ round: -1, dealer: [], hole: null, seats: new Map(), layout: '' });
    let shown = blank();
    // La première image de la table se pose d'un coup ; ensuite chaque carte est distribuée.
    let rush = true;
    const pause = (ms) => (rush || gone || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches ? Promise.resolve() : sleep(ms));

    function clear() {
      dealerEl.replaceChildren();
      seatsEl.replaceChildren();
      dealerSum.textContent = '';
      shown = blank();
    }

    // Une carte part de la main du croupier et se retourne en arrivant.
    function deal(list, c) {
      const node = el(c ? `<div class="pcard ${'♥♦'.includes(c.s) ? 'red' : ''}"><b>${c.r}</b><span>${c.s}</span></div>` : '<div class="pcard back"></div>');
      list.append(node);
      if (!rush) {
        const from = croupier.getBoundingClientRect();
        const to = node.getBoundingClientRect();
        node.style.setProperty('--dx', `${Math.round(from.left + from.width / 2 - to.left - to.width / 2)}px`);
        node.style.setProperty('--dy', `${Math.round(from.top + from.height * 0.7 - to.top - to.height / 2)}px`);
        node.classList.add('new');
        Sound.play('card');
      }
      return node;
    }

    function seatNode(name) {
      const node = el('<div class="tb-seat"><div class="cards"></div><div class="tb-name"></div><div class="bj-total"><span></span> <small></small></div></div>');
      return { node, list: $('.cards', node), name: $('.tb-name', node), sum: $('.bj-total span', node), bet: $('small', node), cards: [], who: name };
    }

    // Le message et la jauge suivent l'horloge de la table entre deux réponses du serveur.
    let now = null;
    function paint() {
      if (!now || gone) return;
      const { t, until } = now;
      const left = Math.max(0, until - performance.now());
      const you = t.seats.find((s) => s.you);
      const turn = t.seats.find((s) => s.turn);
      let text = 'Donne terminée';
      if (t.phase === 'waiting') text = "En attente qu'un joueur mise";
      else if (t.phase === 'betting') text = `Les mises ferment dans ${secs(left)} s${t.free ? `, ${t.free} place${t.free > 1 ? 's' : ''} libre${t.free > 1 ? 's' : ''}` : ''}`;
      else if (t.phase === 'playing') text = turn && turn.you ? `À vous de jouer (${secs(Math.min(left, t.window))} s)` : `Au tour de ${turn ? turn.name : '…'} (${secs(Math.min(left, t.window))} s)`;
      else if (you) text = you.payout > you.bet ? `Gagné ${App.coin(you.payout)}` : you.payout === you.bet ? 'Égalité, mise rendue' : 'Perdu';
      if (msg.dataset.text !== text) {
        msg.dataset.text = text;
        // Seul le gain porte un pictogramme ; un nom de joueur reste du texte.
        if (text.startsWith('Gagné ')) msg.innerHTML = text;
        else msg.textContent = text;
      }
      clockBar.hidden = t.phase === 'waiting';
      clockBar.classList.toggle('mine', Boolean(turn && turn.you));
      clockBar.firstElementChild.style.transform = `scaleX(${t.window ? Math.min(1, left / t.window) : 0})`;
    }
    const say = (t, at) => {
      now = { t, until: at + t.remaining };
      paint();
    };

    async function sync(t, at) {
      const dealerCards = t.dealer.length + (t.hole ? 1 : 0);
      const behind = shown.dealer.length + (shown.hole ? 1 : 0) > Math.max(dealerCards, t.dealer.length) || [...shown.seats.values()].some((v) => v.cards.length > (t.seats.find((s) => s.name === v.who)?.cards.length ?? 0));
      if (t.round !== shown.round || behind) clear();
      shown.round = t.round;

      // Les places : celles qui existent restent en place, les nouvelles s'ajoutent.
      // Une place libre se prend en la touchant, tant que les mises sont ouvertes.
      const places = Array.from({ length: PLACES }, (_, i) => t.seats.find((s) => s.pos === i));
      const layout = `${places.map((s) => (s ? s.name : '')).join('\n')}\n${t.canBet}`;
      if (layout !== shown.layout) {
        const seats = new Map(t.seats.map((s) => [s.name, shown.seats.get(s.name) || seatNode(s.name)]));
        seatsEl.replaceChildren(
          ...places.map((s, i) =>
            s ? seats.get(s.name).node : el(t.canBet ? `<button type="button" class="tb-seat free" data-pos="${i}"><span class="tb-name">Miser ici</span></button>` : '<div class="tb-seat free"><div class="tb-name">Place libre</div></div>'),
          ),
        );
        shown.seats = seats;
        shown.layout = layout;
      }
      for (const s of t.seats) {
        const v = shown.seats.get(s.name);
        v.node.classList.toggle('you', Boolean(s.you));
        v.name.textContent = s.you ? 'Vous' : s.name;
        v.bet.textContent = App.fmt(s.bet);
      }
      if (t.phase !== 'done') {
        say(t, at);
        for (const s of t.seats) shown.seats.get(s.name).node.classList.toggle('active', Boolean(s.turn));
      }

      // La donne, dans l'ordre d'une vraie table : une carte à chacun, une au croupier, puis
      // la seconde, celle du croupier face cachée.
      const queue = [];
      const rows = Math.max(0, ...t.seats.map((s) => s.cards.length));
      for (let j = 0; j < rows; j++) {
        for (const s of t.seats) {
          const v = shown.seats.get(s.name);
          if (j >= v.cards.length && j < s.cards.length) queue.push({ v, c: s.cards[j] });
        }
        if (j === 0 && !shown.dealer.length && t.dealer.length) queue.push({ c: t.dealer[0] });
        if (j === 1 && shown.dealer.length + (shown.hole ? 1 : 0) < 2 && dealerCards >= 2) queue.push({ hole: true });
      }
      if (queue.length && !rush) {
        croupier.classList.remove('deal');
        void croupier.offsetWidth;
        croupier.classList.add('deal');
      }
      for (const [i, q] of queue.entries()) {
        if (q.hole) shown.hole = deal(dealerEl, null);
        else if (q.v) {
          deal(q.v.list, q.c);
          q.v.cards.push(q.c);
          const v = q.v;
          pause(FLY).then(() => (v.sum.textContent = points(v.cards)));
        } else {
          deal(dealerEl, q.c);
          shown.dealer.push(q.c);
          pause(FLY).then(() => (dealerSum.textContent = points(shown.dealer)));
        }
        await pause(i < queue.length - 1 ? STEP : FLY);
      }

      // Le croupier retourne sa carte, puis se sert carte après carte.
      if (t.phase === 'done' && !rush && (shown.hole || shown.dealer.length < t.dealer.length)) {
        now = null;
        msg.dataset.text = msg.textContent = 'Au croupier de jouer';
        clockBar.hidden = true;
        for (const v of shown.seats.values()) v.node.classList.remove('active');
      }
      if (!t.hole && shown.hole) {
        const c = t.dealer[shown.dealer.length];
        const node = el(`<div class="pcard ${'♥♦'.includes(c.s) ? 'red' : ''} ${rush ? '' : 'flip'}"><b>${c.r}</b><span>${c.s}</span></div>`);
        shown.hole.replaceWith(node);
        shown.hole = null;
        shown.dealer.push(c);
        if (!rush) Sound.play('card');
        await pause(TURN);
        dealerSum.textContent = points(shown.dealer);
        await pause(DRAW - TURN);
      }
      while (shown.dealer.length < t.dealer.length) {
        const c = t.dealer[shown.dealer.length];
        deal(dealerEl, c);
        shown.dealer.push(c);
        await pause(FLY);
        dealerSum.textContent = points(shown.dealer);
        await pause(DRAW - FLY);
      }
      if (gone) return;

      // Les cartes sont posées : les totaux, puis le verdict de chaque main.
      dealerSum.textContent = shown.dealer.length ? points(shown.dealer) : '';
      for (const s of t.seats) {
        const v = shown.seats.get(s.name);
        v.sum.textContent = `${s.cards.length ? s.total : ''}${s.result ? `${s.cards.length ? ', ' : ''}${LABEL[s.result]}` : ''}`;
        v.node.classList.toggle('active', Boolean(s.turn));
        for (const r of Object.keys(LABEL)) v.node.classList.toggle(r, s.result === r);
      }
      say(t, at);

      // Ce qui vient de changer pour le joueur : son tour qui commence, sa donne qui finit.
      const you = t.seats.find((s) => s.you);
      const mine = t.actions.length > 0;
      if (mine && !myTurn) {
        if (!rush) Sound.play('arm');
        // Sur un petit écran, le tapis revient sous les yeux quand le tour commence.
        if (stage.getBoundingClientRect().top < 0) stage.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
      myTurn = mine;
      panel.classList.toggle('turn', mine);
      if (t.phase === 'done' && phase !== 'done' && you && !rush) {
        Sound.play(you.result === 'blackjack' ? 'big' : you.payout > you.bet ? 'line' : you.payout === you.bet ? 'arm' : 'lose', 2);
        const node = $('.tb-seat.you', root);
        if (node && you.payout > you.bet) fx.blast(node, you.result === 'blackjack' ? 0.8 : 0.3, 0.9);
      }
      phase = t.phase;
      state = t;
      controls();
      rush = false;
    }

    let state = null;
    function controls() {
      const t = state;
      $$('[data-act]', root).forEach((b) => (b.disabled = busy || !t || !t.actions.includes(b.dataset.act)));
      play.disabled = busy || !t || !t.canBet;
      if (!t) return;
      play.textContent = t.seated && t.phase !== 'done' ? 'Mise posée' : t.canBet ? 'Miser' : t.free ? 'Donne en cours' : 'Table complète';
      bet.lock(!t.canBet);
    }

    // Les réponses du serveur sont jouées l'une après l'autre ; si plusieurs arrivent
    // pendant un tirage, seule la dernière compte.
    let rev = '';
    let stale = 0;
    let next = null;
    let playingOut = false;
    async function take(res) {
      if (gone) return;
      // Une réponse plus ancienne que la table affichée est ignorée, sauf si le serveur a
      // redémarré et recompte de zéro.
      if (rev !== '' && res.rev < rev && ++stale < 3) return;
      stale = 0;
      rev = res.rev;
      next = { res, at: performance.now() };
      if (playingOut) return;
      playingOut = true;
      while (next && !gone) {
        const { res: r, at } = next;
        next = null;
        try {
          await sync(r.table, at);
        } catch (e) {
          console.warn('table', e);
        }
        // Le portefeuille suit la table, une fois le tirage montré : mise débitée, gain payé.
        if (!gone && r.user && r.user.balance !== App.user.balance) App.setUser(r.user);
      }
      playingOut = false;
    }

    async function call(path, body) {
      if (busy) return;
      busy = true;
      controls();
      try {
        const res = await App.api(path, body);
        busy = false;
        take(res);
      } catch (e) {
        busy = false;
        controls();
        App.toast(e.message);
      }
    }

    // Le bouton reprend la place choisie la dernière fois, si elle est libre ; sinon la
    // première libre.
    const sit = (seat) => {
      if (seat !== undefined) store.set('table.seat', String(seat));
      return call('/api/table/bet', { bet: bet.value, seat });
    };
    play.onclick = () => {
      const last = store.get('table.seat');
      const free = last !== null && state && !state.seats.some((s) => s.pos === Number(last));
      return sit(free ? Number(last) : undefined);
    };
    seatsEl.onclick = (e) => {
      const b = e.target.closest('button[data-pos]');
      if (b) sit(Number(b.dataset.pos));
    };
    $$('[data-act]', root).forEach((b) => {
      b.disabled = true;
      b.onclick = () => call('/api/table/action', { action: b.dataset.act });
    });
    // Le serveur garde la demande jusqu'au prochain changement, deux secondes au plus.
    (async () => {
      while (!gone) {
        if (document.hidden) {
          await sleep(500);
          continue;
        }
        try {
          take(await App.api(`/api/table?rev=${rev}`));
        } catch {
          if (gone) return;
          msg.dataset.text = '';
          msg.textContent = 'Table injoignable, nouvel essai…';
          await sleep(1500);
        }
      }
    })();
    const timer = setInterval(paint, 200);
    return () => {
      gone = true;
      clearInterval(timer);
      fx.destroy();
    };
  },
};

export default game;
