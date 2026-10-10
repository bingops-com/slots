// Dessins du projet, sur une grille de 64. Ils suivent la direction artistique lab.bingo :
// aplats sans contour ni dégradé, blanc sur bleu, détails en navy, menthe réservée aux
// symboles spéciaux. Ils sont donc toujours posés sur une surface bleue.
export const Art = (() => {
  const W = '#fff';
  const N = '#0b2a94';
  const M = '#8af2bf';
  // Le rouge n'appartient qu'à Barbe-Rouge : sa barbe, et rien d'autre dans les dessins.
  const R = '#ff6352';
  const svg = (body) => `<svg class="ic" viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;
  const line = (d, color = W, width = 5) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const dot = (x, y, r = 2.2, color = N) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>`;
  const fish = `<path d="M6 32c8-13 26-18 40-8l12-10v36L46 40C32 50 14 45 6 32z" fill="${W}"/>${dot(17, 29, 2.6)}${line('M26 23c3.5 5.5 3.5 12.5 0 18', N, 2.4)}`;
  const ring = `<circle cx="32" cy="32" r="28" fill="none" stroke="${M}" stroke-width="4"/>`;
  // Un équipage : même visage, un seul attribut chacun.
  const face = `<circle cx="32" cy="38" r="16" fill="${W}"/>${dot(26, 37)}${dot(38, 37)}`;

  return {
    // ----- pêche -----
    fish: svg(fish),
    bass: svg(`${ring}<g transform="translate(9.6 9.6) scale(.7)">${fish}</g>`),
    fisherman: svg(`
      <path d="M12 24c1-11 9-18 20-18s19 7 20 18z" fill="${W}"/><rect x="5" y="22" width="54" height="7" rx="3.5" fill="${W}"/>
      ${line('M14 18h36', N, 3.5)}
      <path d="M16 33h32v5c0 12-7 21-16 21s-16-9-16-21z" fill="${W}"/>
      <path d="M17 42c4 3 9 4 15 4s11-1 15-4c-1 10-7 17-15 17s-14-7-15-17z" fill="${N}"/>
      ${dot(25, 38)}${dot(39, 38)}`),
    tackle: svg(`${line('M23 20v-5a4 4 0 014-4h10a4 4 0 014 4v5', W, 4.5)}<rect x="6" y="20" width="52" height="34" rx="6" fill="${W}"/>${line('M6 34h52', N, 2.4)}<rect x="27" y="29" width="10" height="10" rx="2.5" fill="${N}"/>`),
    dragonfly: svg(`
      <ellipse cx="18" cy="22" rx="15" ry="6" transform="rotate(18 18 22)" fill="${W}"/><ellipse cx="46" cy="22" rx="15" ry="6" transform="rotate(-18 46 22)" fill="${W}"/>
      <ellipse cx="20" cy="35" rx="12" ry="5" transform="rotate(-16 20 35)" fill="${W}" opacity=".8"/><ellipse cx="44" cy="35" rx="12" ry="5" transform="rotate(16 44 35)" fill="${W}" opacity=".8"/>
      ${line('M32 16v42', W, 5.5)}<circle cx="32" cy="12" r="5.5" fill="${W}"/>${dot(30, 11, 1.5)}${dot(34, 11, 1.5)}`),
    rod: svg(`${line('M8 56L52 10')}${line('M52 10c5 12 4 22 1 30', W, 2)}<circle cx="25" cy="44" r="8.5" fill="${W}"/><circle cx="25" cy="44" r="3" fill="${N}"/>${line('M53 40c0 6 7 5 6 0', W, 2.6)}`),
    float: svg(`${line('M32 4v14M32 50v10', W, 4)}<circle cx="32" cy="34" r="17" fill="${W}"/><path d="M15 34a17 17 0 0034 0z" fill="${N}"/>${line('M15 34h34', W, 3)}`),
    hook: svg(`<circle cx="38" cy="11" r="5" fill="none" stroke="${W}" stroke-width="4"/>${line('M38 16v25a12 12 0 01-24 0v-9M14 32l-5 8M14 32l6 7')}`),
    dynamite: svg(`
      <rect x="10" y="22" width="13" height="36" rx="4" fill="${W}"/><rect x="26" y="18" width="13" height="40" rx="4" fill="${W}"/><rect x="42" y="22" width="13" height="36" rx="4" fill="${W}"/>
      ${line('M8 36h49M8 46h49', N, 3)}${line('M32 18c0-8 6-10 12-10', W, 3)}<path d="M48 2l1.4 4.6L54 8l-4.6 1.4L48 14l-1.4-4.6L42 8l4.6-1.4z" fill="${W}"/>`),
    // ----- pirates -----
    bottle: svg(`<rect x="27" y="5" width="10" height="16" rx="2" fill="${W}"/><path d="M27 19c0 5-9 7-9 16v18a6 6 0 006 6h16a6 6 0 006-6V35c0-9-9-11-9-16z" fill="${W}"/><rect x="18" y="37" width="28" height="12" fill="${N}"/>${line('M26 43h12', W, 2.4)}`),
    anchor: svg(`<circle cx="32" cy="12" r="5" fill="none" stroke="${W}" stroke-width="4.5"/>${line('M32 18v36M21 27h22M10 38c2 12 12 16 22 16s20-4 22-16')}`),
    helm: svg(`<circle cx="32" cy="32" r="15" fill="none" stroke="${W}" stroke-width="6"/>${line('M32 4v56M4 32h56M12.2 12.2l39.6 39.6M51.8 12.2L12.2 51.8', W, 4)}<circle cx="32" cy="32" r="6" fill="${W}"/>${dot(32, 32, 2.5)}`),
    compass: svg(`<circle cx="32" cy="8" r="4" fill="none" stroke="${W}" stroke-width="3.5"/><circle cx="32" cy="36" r="23" fill="${W}"/><path d="M32 18l6 18-6 18-6-18z" fill="${N}"/><path d="M32 18l6 18H26z" fill="${W}" stroke="${N}" stroke-width="2" stroke-linejoin="round"/>${dot(32, 36, 2.5)}`),
    pistol: svg(`<path d="M4 20h44a4 4 0 014 4v6H34c-4 0-6 2-7 6l-5 20a4 4 0 01-4 3h-6a3 3 0 01-3-4l5-19c1-4-1-6-5-6H4z" fill="${W}"/>${line('M48 20c2-6 6-8 10-8', W, 4)}${line('M30 34c2 6 8 6 10 0', W, 3.5)}${line('M8 25h34', N, 2.4)}`),
    sailor: svg(`${face}<path d="M15 33c1-11 8-17 17-17s16 6 17 17c-11-5-23-5-34 0z" fill="${N}"/><path d="M49 28l10-3-3 10z" fill="${W}"/>${line('M27 46c3 2 7 2 10 0', N, 2.4)}`),
    gunner: svg(`<path d="M14 36c0-13 8-22 18-22s18 9 18 22v20H40V36H24v20H14z" fill="${W}"/>${face}${line('M17 30h30', N, 4)}${line('M28 46c2.5 1.5 5.5 1.5 8 0', N, 2.4)}`),
    lookout: svg(`${face}<path d="M14 26c2-8 9-12 18-12s16 4 18 12z" fill="${W}"/><rect x="10" y="24" width="44" height="6" rx="3" fill="${W}"/><path d="M22 45c4-4 7-1 10 0 3-1 6-4 10 0-4 4-7 3-10 1-3 2-6 3-10-1z" fill="${N}"/>`),
    corsair: svg(`<ellipse cx="32" cy="24" rx="28" ry="6" fill="${W}"/><path d="M18 24c0-10 6-16 14-16s14 6 14 16z" fill="${W}"/>${line('M19 20h26', N, 3)}${face}<circle cx="51" cy="46" r="4.5" fill="none" stroke="${W}" stroke-width="3"/>${line('M28 47c2.5 1.5 5.5 1.5 8 0', N, 2.4)}`),
    // Barbe-Rouge porte le cache-œil, la marque de la maison.
    captain: svg(`
      <path d="M4 26c8-4 14-18 28-18s20 14 28 18c-9 3-19 2-28 2S13 29 4 26z" fill="${W}"/>${line('M14 23c6 2 12 2 18 2s12 0 18-2', N, 2.6)}
      <path d="M17 32h30v6c0 14-6 24-15 24S17 52 17 38z" fill="${W}"/>
      <path d="M17 42c5 3 10 3 15 3s10 0 15-3c0 12-6 20-15 20s-15-8-15-20z" fill="${R}"/>
      ${dot(25, 37)}${line('M17 31l30 9', N, 2.4)}<path d="M34 34h11v5a5.5 5.5 0 01-11 0z" fill="${N}"/>`),
    wild: svg(`<path d="M32 3l29 29-29 29L3 32z" fill="${W}"/>${line('M19 25l5 16 8-12 8 12 5-16', N, 4.5)}`),
    // Le wild de Barbe-Rouge : son pavillon, un crâne à cache-œil.
    skull: svg(`
      <path d="M32 5C18 5 9 15 9 28c0 8 3 14 9 17v6a5 5 0 005 5h18a5 5 0 005-5v-6c6-3 9-9 9-17C55 15 46 5 32 5z" fill="${W}"/>
      ${dot(23, 30, 5)}${line('M10 19l44 13', N, 2.6)}<path d="M33 27h13v5a6.5 6.5 0 01-13 0z" fill="${N}"/>
      <path d="M29.5 41l2.5-5 2.5 5z" fill="${N}"/>${line('M26 48v8M32 48v8M38 48v8', N, 2.2)}`),
    // Barbe-Rouge en buste, pour la scène de sa machine.
    hero: `<svg class="hero-art" viewBox="0 0 120 134" aria-hidden="true">
      <path d="M4 134c2-22 16-35 36-39h40c20 4 34 17 36 39z" fill="${W}" opacity=".28"/>
      <path d="M86 24c9-15 25-18 30-9-9 0-17 7-22 17z" fill="${W}" opacity=".85"/>
      <path d="M8 45c18-4 26-35 52-35s34 31 52 35c-16 8-34 8-52 8S24 53 8 45z" fill="${W}"/>
      ${line('M27 42c11 4 22 5 33 5s22-1 33-5', N, 3)}
      <path d="M34 54h52v14c0 10-4 18-10 24H44c-6-6-10-14-10-24z" fill="${W}"/>
      <circle cx="31" cy="79" r="4.5" fill="none" stroke="${W}" stroke-width="2.6"/>
      <path d="M30 72c9 6 19 8 30 8s21-2 30-8c3 21-2 41-14 53l-6-11-10 15-10-15-6 11C32 113 27 93 30 72z" fill="${R}"/>
      ${line('M52 89c5 3 11 3 16 0', N, 2.6)}
      <circle class="hero-eye" cx="48" cy="65" r="3.2" fill="${N}"/>${line('M41 57l13 2', N, 2.6)}
      ${line('M34 55l52 14', N, 2.6)}<path d="M63 59h19v8a9.5 9.5 0 01-19 0z" fill="${N}"/>
    </svg>`,
    // Un trois-mâts devant la lune.
    ship: `<svg viewBox="0 0 120 120" aria-hidden="true">
      <circle class="moon-disc" cx="60" cy="60" r="56"/>
      <g class="moon-ship"><path d="M30 86h62c-3 8-9 12-17 12H44c-7 0-12-4-14-12z"/><path d="M44 82V52c8 6 12 16 13 30zM60 82V40c12 9 18 24 19 42zM82 82V58c6 5 9 13 10 24z"/><path d="M28 84l14-22v22z"/></g>
    </svg>`,
    chest: svg(`${ring}<path d="M15 30c0-9 7-14 17-14s17 5 17 14z" fill="${W}"/><rect x="15" y="33" width="34" height="17" rx="3" fill="${W}"/>${line('M22 17v13M42 17v13', N, 2.4)}<rect x="28" y="29" width="8" height="10" rx="2" fill="${N}"/>`),
    cannon: svg(`<path d="M8 30l40-14a7 7 0 014 13L14 44z" fill="${W}"/><circle cx="22" cy="46" r="12" fill="${W}"/><circle cx="22" cy="46" r="4" fill="${N}"/>${line('M6 58h40', W, 4)}`),
    bomb: svg(`${line('M40 19c2-8 8-10 13-9', W, 3.5)}<path d="M56 3l1.4 4.6L62 9l-4.6 1.4L56 15l-1.4-4.6L50 9l4.6-1.4z" fill="${W}"/><circle cx="28" cy="38" r="21" fill="${W}"/>${line('M15 33c2-7 7-11 13-12', N, 3.5)}`),
    // ----- interface -----
    trophy: svg(`${line('M17 13H7c0 11 4 17 11 19M47 13h10c0 11-4 17-11 19', W, 4)}<path d="M16 8h32v16c0 12-7 18-16 18s-16-6-16-18z" fill="${W}"/><path d="M28 42h8v8h8v6H20v-6h8z" fill="${W}"/>`),
    dice: svg(`<rect x="8" y="8" width="48" height="48" rx="11" fill="${W}"/><g fill="${N}"><circle cx="21" cy="21" r="4.5"/><circle cx="43" cy="21" r="4.5"/><circle cx="32" cy="32" r="4.5"/><circle cx="21" cy="43" r="4.5"/><circle cx="43" cy="43" r="4.5"/></g>`),
    wheel: svg(`<circle cx="32" cy="32" r="27" fill="${W}"/><circle cx="32" cy="32" r="19" fill="none" stroke="${N}" stroke-width="11" stroke-dasharray="9.95 9.95"/><circle cx="32" cy="32" r="6" fill="${N}"/>`),
    cards: svg(`<rect x="8" y="13" width="29" height="41" rx="5" transform="rotate(-12 22 33)" fill="${W}" opacity=".7"/><rect x="27" y="10" width="29" height="41" rx="5" transform="rotate(10 41 30)" fill="${W}"/><path d="M41 21c-5 6-8 8-8 12a4 4 0 007 2l-1 5h5l-1-5a4 4 0 007-2c0-4-4-6-9-12z" fill="${N}" transform="rotate(10 41 30)"/>`),
    gem: svg(`<path d="M18 10h28l12 14-26 32L6 24z" fill="${W}"/>${line('M6 24h52M18 10l6 14 8 32 8-32 6-14M24 24l8-14 8 14', N, 2.2)}`),
    plinko: svg(`<g fill="${W}"><circle cx="32" cy="9" r="6.5"/><circle cx="21" cy="26" r="4"/><circle cx="43" cy="26" r="4"/><circle cx="10" cy="43" r="4"/><circle cx="32" cy="43" r="4"/><circle cx="54" cy="43" r="4"/></g>${line('M6 57h10M27 57h10M48 57h10', W, 5)}`),
    sub: svg(`<path d="M6 40c0-9 8-14 22-14h14c12 0 18 5 18 14s-6 14-18 14H28C14 54 6 49 6 40z" fill="${W}"/><path d="M26 26v-9a4 4 0 014-4h8a4 4 0 014 4v9z" fill="${W}"/>${line('M36 13V6h7', W, 3.5)}${dot(24, 40, 4)}${dot(38, 40, 4)}${line('M6 34l-4-5M6 46l-4 5', W, 3.5)}`),
    boat: svg(`${line('M30 6v36', W, 3.5)}<path d="M34 10c12 6 18 16 19 30H34z" fill="${W}"/><path d="M5 46h54c-2 8-8 12-14 12H19C13 58 7 54 5 46z" fill="${W}"/>`),
  };
})();
