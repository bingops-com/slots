import { useEffect, useState } from 'react';
import { App, useApp } from './app';

export interface Ranked {
  rank: number;
  name: string;
  score: number;
  rounds: number;
  stake: number;
  game?: string;
}

export interface Leaderboard {
  season: { id: number };
  type: string;
  players: number;
  top: Ranked[];
  you: Ranked | null;
  hallOfFame: { season: number; podium: { name: string; score: number }[] }[];
}

export const BOARDS = {
  score: { label: 'Score', score: (s: number) => App.fmt(s) },
  multi: { label: 'Plus gros multiplicateur', score: (s: number) => `×${s.toLocaleString('fr-FR')}` },
  wagered: { label: 'Total misé', score: (s: number) => App.fmt(s) },
} as const;
export type Board = keyof typeof BOARDS;

export interface GameBoard {
  season: { id: number };
  game: string;
  players: number;
  top: { rank: number; name: string; mult: number; payout: number; rounds: number }[];
  you: { rank: number; name: string; mult: number; payout: number; rounds: number } | null;
}

// Le classement, relu toutes les dix secondes et après chaque manche classée.
// undefined : pas encore lu ; null : injoignable.
export function useLeaderboard(board: Board): Leaderboard | null | undefined {
  return useBoard<Leaderboard>(`/api/leaderboard?type=${board}`);
}

// Le classement d'un jeu : le plus gros gain de chacun, en multiple de la mise.
export function useGameBoard(game: string): GameBoard | null | undefined {
  return useBoard<GameBoard>(`/api/leaderboard/${game}`);
}

function useBoard<T>(url: string): T | null | undefined {
  const { ready, account, offline } = useApp();
  const [lb, setLb] = useState<T | null>();
  const rounds = account?.rounds;
  const name = account?.name;
  useEffect(() => {
    if (!ready) return;
    let gone = false;
    // Pendant qu'une manche se joue à l'écran, le tableau attend : il ne doit pas annoncer
    // le résultat avant la scène.
    const load = () =>
      App.state.shown !== null ||
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
        .then((data) => gone || setLb(data));
    void load();
    const timer = setInterval(load, 10_000);
    return () => {
      gone = true;
      clearInterval(timer);
    };
  }, [ready, url, rounds, name, offline]);
  return lb;
}
