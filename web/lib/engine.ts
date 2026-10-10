// Le moteur d'entraînement : les règles du serveur, compilées en WebAssembly depuis le
// même code Go (cmd/wasm). Il n'est chargé que lorsqu'on s'entraîne.

interface SlotsEngine {
  newWallet(): string;
  me(wallet: string): string;
  play(wallet: string, action: string, body: string): string;
}

declare global {
  // Posés par wasm_exec.js (fourni avec Go) puis par le moteur lui-même.
  var Go: (new () => { importObject: WebAssembly.Imports; run(instance: WebAssembly.Instance): Promise<void> }) | undefined;
  var SlotsEngine: SlotsEngine | undefined;
}

let loading: Promise<SlotsEngine> | null = null;

function script(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Chargement de ${src} impossible`));
    document.head.append(s);
  });
}

async function load(): Promise<SlotsEngine> {
  if (!globalThis.Go) await script('/wasm_exec.js');
  const go = new globalThis.Go!();
  const res = await fetch('/engine.wasm');
  if (!res.ok) throw new Error("Le moteur d'entraînement est introuvable");
  const { instance } = await WebAssembly.instantiate(await res.arrayBuffer(), go.importObject);
  void go.run(instance); // ne se termine jamais : le moteur reste à l'écoute
  for (let i = 0; i < 200 && !globalThis.SlotsEngine; i++) await new Promise((r) => setTimeout(r, 10));
  if (!globalThis.SlotsEngine) throw new Error("Le moteur d'entraînement n'a pas démarré");
  return globalThis.SlotsEngine;
}

export function engine(): Promise<SlotsEngine> {
  loading ??= load().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

// Actions jouées sur place à l'entraînement ; les mêmes noms que les routes du serveur.
export const ACTIONS = new Set([
  'dice', 'roulette', 'slots/bass', 'slots/beard', 'slots/bounty', 'slots/neptune', 'slots/reef', 'slots/dogs', 'blackjack/start', 'blackjack/action', 'mines/start', 'mines/reveal', 'mines/cashout', 'crash/start', 'crash/poll', 'crash/cashout', 'plinko', 'advance',
]);
