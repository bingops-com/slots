// Sons du jeu, fabriqués à la volée avec Web Audio : aucun fichier à télécharger, donc
// rien de plus à garder pour jouer hors ligne. Le navigateur n'autorise le son qu'après
// un premier geste du joueur ; d'ici là, rien n'est joué.
import { store } from './dom.js';

export const Sound = (() => {
  const VOLUME = 0.7;
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let on = true;
  let want = null; // ambiance demandée par le jeu affiché
  let amb = null; // ambiance en cours : { name, stop }

  function boot() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = on ? VOLUME : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const live = () => ctx && ctx.state === 'running';
  const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

  // ----- briques -----
  function env(g, at, peak, attack, dur) {
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  }
  function tone(dest, at, { type = 'sine', f, to, dur = 0.2, gain = 0.2, attack = 0.006, detune = 0 }) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, at);
    if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
    o.detune.value = detune;
    env(g, at, gain, attack, dur);
    o.connect(g).connect(dest);
    o.start(at);
    o.stop(at + dur + 0.05);
  }
  function hiss(dest, at, { type = 'lowpass', f, to, q = 1, dur = 0.2, gain = 0.2, attack = 0.004 }) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.setValueAtTime(f, at);
    if (to) flt.frequency.exponentialRampToValueAtTime(to, at + dur);
    flt.Q.value = q;
    const g = ctx.createGain();
    env(g, at, gain, attack, dur);
    s.connect(flt).connect(g).connect(dest);
    s.start(at, Math.random() * 1.5);
    s.stop(at + dur + 0.05);
  }

  // ----- instruments -----
  // Le concertina du bord : deux anches légèrement désaccordées.
  function squeeze(dest, at, midi, dur, gain = 0.07) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    lp.connect(dest);
    for (const detune of [-7, 7]) tone(lp, at, { type: 'sawtooth', f: hz(midi), dur, gain, attack: 0.03, detune });
    tone(lp, at, { type: 'square', f: hz(midi) * 2, dur, gain: gain * 0.25, attack: 0.03 });
  }
  // La cloche du navire.
  function bell(dest, at, midi, gain = 0.14) {
    [[1, 1.5, 1], [2.76, 1, 0.5], [5.4, 0.5, 0.25], [8.93, 0.25, 0.12]].forEach(([ratio, dur, g]) =>
      tone(dest, at, { f: hz(midi) * ratio, dur, gain: gain * g, attack: 0.003 })
    );
  }
  function pluck(dest, at, midi, gain = 0.16) {
    tone(dest, at, { type: 'triangle', f: hz(midi), dur: 0.32, gain });
    tone(dest, at, { f: hz(midi) * 2, dur: 0.16, gain: gain * 0.35 });
  }
  function thud(dest, at, f = 120, gain = 0.3) {
    tone(dest, at, { f, to: f * 0.42, dur: 0.17, gain });
    hiss(dest, at, { f: 900, dur: 0.05, gain: gain * 0.4 });
  }

  // Ré mineur pentatonique : la gamme de tous les gains.
  const SCALE = [62, 65, 67, 69, 72, 74, 77, 79, 81, 84, 86, 89, 91, 93];

  // Ré majeur pentatonique : les gains de la pêche.
  const MAJOR = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86, 88, 90, 93];

  // ----- sons ponctuels : fx[nom](sortie, instant, ...arguments) -----
  const fx = {
    lever(d, t) {
      thud(d, t, 180, 0.18);
      hiss(d, t, { type: 'highpass', f: 3000, dur: 0.03, gain: 0.08 });
    },
    arm(d, t) {
      tone(d, t, { type: 'triangle', f: 330, dur: 0.09, gain: 0.12 });
    },
    // La mèche qui grésille juste avant le coup.
    fuse(d, t) {
      hiss(d, t, { type: 'highpass', f: 4000, to: 9000, dur: 0.26, gain: 0.07, attack: 0.05 });
    },
    stop(d, t, reel = 0) {
      tone(d, t, { f: 150 - reel * 8, to: 60, dur: 0.14, gain: 0.3 });
      hiss(d, t, { type: 'bandpass', f: 1400, dur: 0.04, gain: 0.12 });
    },
    scatter(d, t, n = 0) {
      bell(d, t, 74 + [0, 3, 7, 10, 12][Math.min(n, 4)]);
    },
    // Roulement de tambour pendant qu'un rouleau fait attendre le troisième scatter.
    tease(d, t) {
      const len = store.get('turbo') === '1' ? 0.45 : 1.1;
      for (let x = 0, gap = 0.09; x < len; x += gap, gap = Math.max(0.035, gap * 0.9)) {
        hiss(d, t + x, { type: 'bandpass', f: 2400, q: 0.8, dur: 0.05, gain: 0.06 + 0.1 * (x / len) });
      }
      tone(d, t, { type: 'triangle', f: 220, to: 660, dur: len, gain: 0.05, attack: len * 0.8 });
    },
    win(d, t, level = 0) {
      const i = Math.min(level, SCALE.length - 5);
      [0, 2, 4].forEach((k, j) => pluck(d, t + j * 0.07, SCALE[i + k]));
    },
    // power : 0 pour ×1, 1 à partir de ×64.
    cannon(d, t, power = 0) {
      const g = 0.5 + 0.35 * power;
      hiss(d, t, { f: 1800, to: 120, dur: 0.7 + 0.5 * power, gain: g });
      tone(d, t, { f: 110, to: 32, dur: 0.5 + 0.4 * power, gain: g });
      hiss(d, t, { type: 'highpass', f: 2500, dur: 0.06, gain: 0.25 });
    },
    hit(d, t, power = 0) {
      thud(d, t, 90, 0.3 + 0.2 * power);
      hiss(d, t, { type: 'bandpass', f: 700, q: 0.7, dur: 0.25, gain: 0.14 });
    },
    pop(d, t) {
      hiss(d, t, { type: 'highpass', f: 3000, to: 6000, dur: 0.12, gain: 0.1 });
      tone(d, t, { f: 520, to: 900, dur: 0.08, gain: 0.06 });
    },
    // Un sabre qu'on tire : le wild entre en jeu.
    wild(d, t) {
      hiss(d, t, { type: 'bandpass', f: 5000, to: 9000, q: 6, dur: 0.35, gain: 0.12 });
      tone(d, t, { type: 'triangle', f: hz(86), dur: 0.5, gain: 0.05 });
      tone(d, t, { type: 'triangle', f: hz(93), dur: 0.5, gain: 0.04 });
    },
    jump(d, t, n = 0) {
      pluck(d, t, 74 + n * 2, 0.14);
      pluck(d, t + 0.07, 81 + n * 2, 0.14);
      bell(d, t + 0.07, 86 + n * 2, 0.05);
    },
    // ----- les tables -----
    // Une carte glisse sur le tapis.
    card(d, t) {
      hiss(d, t, { type: 'highpass', f: 2500, to: 6500, dur: 0.08, gain: 0.1 });
    },
    // Un jeton posé.
    chip(d, t) {
      tone(d, t, { type: 'triangle', f: 1900, dur: 0.035, gain: 0.1 });
      hiss(d, t, { type: 'bandpass', f: 3200, q: 3, dur: 0.03, gain: 0.08 });
    },
    // Les dés dans le cornet.
    rattle(d, t) {
      for (let x = 0; x < 0.28; x += 0.035 + Math.random() * 0.03) {
        tone(d, t + x, { type: 'triangle', f: 900 + Math.random() * 900, dur: 0.03, gain: 0.07 });
        hiss(d, t + x, { type: 'bandpass', f: 2200, q: 2, dur: 0.02, gain: 0.06 });
      }
    },
    // Une manche perdue : deux notes qui retombent, sans insister.
    lose(d, t) {
      pluck(d, t, 62, 0.07);
      pluck(d, t + 0.12, 57, 0.07);
    },
    // Un symbole qui retombe à sa place après une cascade.
    land(d, t) {
      tone(d, t, { f: 130, to: 70, dur: 0.1, gain: 0.16 });
    },
    // ----- la pêche -----
    line(d, t, level = 0) {
      const i = Math.min(level, MAJOR.length - 5);
      [0, 2, 4].forEach((k, j) => pluck(d, t + j * 0.07, MAJOR[i + k]));
    },
    // Un poisson ramassé : la note monte à chaque prise.
    plop(d, t, n = 0) {
      tone(d, t, { f: 700, to: 260, dur: 0.09, gain: 0.16 });
      pluck(d, t + 0.02, MAJOR[Math.max(0, Math.min(Math.round(n), MAJOR.length - 1))], 0.12);
    },
    splash(d, t, power = 0) {
      hiss(d, t, { type: 'bandpass', f: 1800, to: 500, q: 0.7, dur: 0.35, gain: 0.16 + 0.1 * power });
      hiss(d, t, { type: 'highpass', f: 5000, dur: 0.12, gain: 0.06 });
    },
    // Le moulinet qu'on remonte.
    reelin(d, t) {
      for (let x = 0, gap = 0.07; x < 0.55; x += gap, gap = Math.max(0.022, gap * 0.86)) {
        hiss(d, t + x, { type: 'bandpass', f: 3000, q: 5, dur: 0.015, gain: 0.1 });
      }
      tone(d, t, { type: 'triangle', f: 300, to: 520, dur: 0.55, gain: 0.04, attack: 0.3 });
    },
    // Le sonar : une note pure et son écho, plus grave à mesure qu'on descend.
    sonar(d, t, depth = 0) {
      const f = 1400 * 2 ** (-Math.min(depth, 14) / 12);
      tone(d, t, { f, dur: 0.5, gain: 0.12, attack: 0.004 });
      tone(d, t + 0.22, { f, dur: 0.6, gain: 0.04, attack: 0.02 });
    },
    // Un cran de la roue.
    tick(d, t) {
      hiss(d, t, { type: 'bandpass', f: 2600, q: 4, dur: 0.03, gain: 0.16 });
      tone(d, t, { type: 'triangle', f: 900, dur: 0.03, gain: 0.05 });
    },
    wheel(d, t, n = 0) {
      bell(d, t, 74 + n * 5, 0.18);
      thud(d, t, 110, 0.2);
    },
    bonus(d, t) {
      [[62, 0, 0.18], [65, 0.2, 0.18], [69, 0.4, 0.18], [74, 0.6, 0.5], [72, 1.1, 0.2], [74, 1.3, 0.9]].forEach(([m, x, dur]) => squeeze(d, t + x, m, dur, 0.09));
      [0, 0.6, 1.3].forEach((x) => thud(d, t + x, 95, 0.3));
      bell(d, t + 1.3, 86, 0.1);
    },
    bonusEnd(d, t) {
      [62, 69, 74].forEach((m) => squeeze(d, t, m, 1.2, 0.06));
      bell(d, t, 86, 0.1);
    },
    big(d, t) {
      [74, 81, 86].forEach((m, i) => bell(d, t + i * 0.1, m, 0.14));
    },
  };

  // ----- sons tenus : chacun rend la fonction qui l'arrête -----
  function every(ms, fn) {
    const id = setInterval(() => live() && on && fn(), ms);
    return () => clearInterval(id);
  }
  // Le cliquetis des rouleaux, comme un cabestan.
  const reels = () => every(58, () => hiss(master, ctx.currentTime, { type: 'bandpass', f: 1500, q: 3, dur: 0.025, gain: 0.06 }));
  // Les pièces qui tombent pendant qu'un gros gain est compté.
  const coins = () => every(70, () => {
    const m = [86, 89, 91, 93, 98][Math.floor(Math.random() * 5)];
    tone(master, ctx.currentTime, { f: hz(m), dur: 0.09, gain: 0.05 });
    tone(master, ctx.currentTime, { type: 'triangle', f: hz(m) * 2.76, dur: 0.05, gain: 0.02 });
  });

  function bus(gain) {
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.6);
    g.connect(master);
    return {
      node: g,
      close() {
        g.gain.cancelScheduledValues(ctx.currentTime);
        g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12);
        setTimeout(() => g.disconnect(), 900);
      },
    };
  }

  const loops = {
    // La mer : deux couches de souffle qui enflent et retombent.
    sea() {
      const b = bus(1);
      const nodes = [];
      [[420, 0.11, 0.03], [1300, 0.07, 0.012]].forEach(([f, rate, level]) => {
        const s = ctx.createBufferSource();
        s.buffer = noiseBuf;
        s.loop = true;
        const flt = ctx.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = level;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = rate;
        const depth = ctx.createGain();
        depth.gain.value = level * 0.7;
        lfo.connect(depth).connect(g.gain);
        s.connect(flt).connect(g).connect(b.node);
        s.start();
        lfo.start();
        nodes.push(s, lfo);
      });
      return () => {
        b.close();
        setTimeout(() => nodes.forEach((n) => n.stop()), 900);
      };
    },
  };

  // Un air en boucle à 6/8 : deux phrases de quatre mesures, une basse et un pied qui
  // marquent les temps. voice(sortie, instant, note, durée) joue la mélodie.
  const tune = (A, B, roots, voice, E = 0.2) => () => {
    const b = bus(0.9); // E : la durée d'une croche
    const notes = [...A, ...B];
    let step = 0;
    let next = ctx.currentTime + 0.15;
    const stop = every(60, () => {
      if (next < ctx.currentTime) next = ctx.currentTime + 0.05; // après une pause de l'onglet
      while (next < ctx.currentTime + 0.25) {
        const beat = step % 6;
        const note = notes[step];
        if (note) voice(b.node, next, note, E * (notes[(step + 1) % notes.length] ? 0.95 : 1.9));
        if (beat === 0 || beat === 3) {
          const root = roots[Math.floor(step / 6) % 4] + (beat ? 7 : 0);
          tone(b.node, next, { type: 'triangle', f: hz(root), dur: 0.4, gain: 0.16 });
          tone(b.node, next, { f: 95, to: 45, dur: 0.18, gain: beat ? 0.16 : 0.26 });
        } else if (beat === 2 || beat === 5) {
          hiss(b.node, next, { type: 'highpass', f: 5000, dur: 0.04, gain: 0.03 });
        }
        next += E;
        step = (step + 1) % notes.length;
      }
    });
    return () => {
      stop();
      b.close();
    };
  };
  // Barbe-Rouge : une gigue en ré mineur au concertina.
  loops.shanty = tune(
    [74, 0, 69, 74, 0, 76, 77, 0, 76, 74, 0, 72, 69, 0, 72, 74, 0, 77, 76, 0, 72, 74, 0, 0],
    [81, 0, 77, 74, 0, 77, 79, 0, 76, 72, 0, 76, 77, 0, 74, 69, 0, 74, 76, 72, 69, 74, 0, 0],
    [38, 36, 41, 38],
    (d, t, m, dur) => squeeze(d, t, m, dur, 0.05)
  );
  // Mort ou Vif : l'heure du duel. Un air lent en la mineur, sifflé de loin sur des cordes
  // pincées, avec de longs silences.
  loops.showdown = tune(
    [69, 0, 0, 72, 0, 69, 76, 0, 0, 74, 72, 69, 67, 0, 69, 72, 0, 74, 76, 0, 0, 0, 0, 0],
    [81, 0, 79, 76, 0, 74, 76, 0, 72, 69, 0, 0, 74, 0, 72, 69, 67, 69, 69, 0, 0, 0, 0, 0],
    [45, 41, 43, 40],
    (d, t, m, dur) => {
      // Le sifflement, une octave au-dessus, avec un léger vibrato par deux voix voisines.
      tone(d, t, { f: hz(m + 12), dur: dur * 1.6, gain: 0.06, attack: 0.07, detune: -6 });
      tone(d, t, { f: hz(m + 12), dur: dur * 1.6, gain: 0.05, attack: 0.07, detune: 7 });
      // La corde pincée, sèche.
      tone(d, t, { type: 'sawtooth', f: hz(m - 12), dur: 0.22, gain: 0.05 });
      tone(d, t, { type: 'triangle', f: hz(m), dur: 0.3, gain: 0.07 });
    },
    0.27
  );
  // Neptune : le palais englouti. Un air solennel en ré mineur, en cloches graves sur un
  // bourdon, lent comme une marche.
  loops.temple = tune(
    [62, 0, 0, 65, 0, 0, 69, 0, 67, 65, 0, 0, 64, 0, 0, 62, 0, 60, 62, 0, 0, 0, 0, 0],
    [69, 0, 0, 72, 0, 0, 74, 0, 72, 69, 0, 0, 67, 0, 65, 64, 0, 0, 62, 0, 0, 0, 0, 0],
    [38, 34, 36, 38],
    (d, t, m, dur) => {
      bell(d, t, m, 0.09);
      tone(d, t, { type: 'triangle', f: hz(m - 12), dur: dur * 2.2, gain: 0.05, attack: 0.08 });
    },
    0.3
  );
  // Le Récif : un air léger en la majeur, en notes rondes comme des bulles.
  loops.lagoon = tune(
    [69, 73, 76, 0, 73, 76, 81, 0, 78, 76, 0, 73, 71, 74, 78, 0, 74, 78, 76, 0, 73, 69, 0, 0],
    [81, 0, 80, 78, 0, 76, 78, 0, 76, 73, 0, 71, 69, 71, 73, 76, 0, 73, 69, 0, 0, 0, 0, 0],
    [45, 38, 40, 45],
    (d, t, m, dur) => {
      tone(d, t, { f: hz(m + 12), to: hz(m + 12) * 1.01, dur: Math.min(dur, 0.24), gain: 0.08, attack: 0.004 });
      tone(d, t, { type: 'triangle', f: hz(m), dur: 0.2, gain: 0.05 });
    },
    0.19
  );
  // Big Catch : un air de marin en ré majeur, sifflé.
  loops.hornpipe = tune(
    [74, 0, 78, 81, 0, 78, 76, 0, 74, 71, 0, 74, 78, 0, 81, 83, 0, 81, 78, 76, 74, 76, 0, 0],
    [81, 0, 83, 86, 0, 83, 81, 0, 78, 76, 0, 78, 74, 0, 76, 78, 0, 76, 74, 71, 69, 74, 0, 0],
    [38, 43, 38, 45],
    (d, t, m, dur) => {
      tone(d, t, { f: hz(m + 12), dur, gain: 0.07, attack: 0.04 });
      tone(d, t, { type: 'triangle', f: hz(m), dur, gain: 0.03, attack: 0.04 });
    }
  );

  function apply() {
    const name = on && live() ? want : null;
    if ((amb && amb.name) === name) return;
    if (amb) amb.stop();
    amb = name ? { name, stop: loops[name]() } : null;
  }

  function wake() {
    boot();
    if (ctx && ctx.state !== 'running' && !document.hidden) ctx.resume().then(apply).catch(() => {});
  }

  // Le son reste coupé ou activé d'une visite à l'autre.
  function init() {
    on = store.get('sound') !== '0';
    for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, wake, { capture: true });
    // Un onglet caché se tait.
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) ctx.suspend().then(apply).catch(() => {});
      else wake();
    });
    return on;
  }

  function toggle() {
    on = !on;
    store.set('sound', on ? '1' : '0');
    boot();
    if (ctx) {
      master.gain.setTargetAtTime(on ? VOLUME : 0, ctx.currentTime, 0.03);
      ctx.resume().then(() => {
        apply();
        api.play('arm');
      }).catch(() => {});
    }
    return on;
  }

  const silent = () => {};
  const api = {
    init,
    toggle,
    get on() {
      return on;
    },
    play(name, ...args) {
      if (!on || !live()) return;
      // Un son raté ne doit jamais interrompre la partie qui le demande.
      try {
        fx[name](master, ctx.currentTime + 0.005, ...args);
      } catch (e) {
        console.warn('son', name, e);
      }
    },
    reels: () => (on && live() ? reels() : silent),
    coins: () => (on && live() ? coins() : silent),
    // Ambiance du jeu affiché : 'sea', 'shanty' ou null.
    ambience(name) {
      want = name;
      apply();
    },
  };
  return api;
})();
