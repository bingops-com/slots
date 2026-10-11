'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SCENES } from '@/games';
import { byId } from '@/games/catalog';
import { App, useApp } from '@/lib/app';
import SideBoard from './SideBoard';
import { Tile } from './Icon';

// Plein écran : la scène et ses réglages occupent tout l'écran. Là où le navigateur ne
// sait pas le faire (iPhone), ils occupent au moins toute la fenêtre.
function useImmersive() {
  const [on, setOn] = useState(false);
  const leave = useCallback(() => {
    setOn(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, []);
  const toggle = useCallback(() => {
    if (on) return leave();
    setOn(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  }, [on, leave]);
  useEffect(() => {
    document.documentElement.classList.toggle('immersive', on);
    return () => document.documentElement.classList.remove('immersive');
  }, [on]);
  useEffect(() => {
    // Échap, ou le geste du système, fait sortir du plein écran : la page suit.
    const sync = () => document.fullscreenElement || setOn(false);
    document.addEventListener('fullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);
  return [on, toggle] as const;
}

export default function GameStage({ id }: { id: string }) {
  const { ready, practice, account, offline, epoch, user } = useApp();
  const root = useRef<HTMLElement>(null);
  const [failed, setFailed] = useState('');
  const [immersive, toggleImmersive] = useImmersive();
  const game = byId(id)!;

  useEffect(() => {
    if (!ready) return;
    const node = root.current!;
    let gone = false;
    let cleanup: void | (() => void);
    setFailed('');
    // Resynchronise le portefeuille et récupère une éventuelle partie en cours.
    App.api('/api/me')
      .then((me) => {
        if (gone) return;
        App.setUser(me.user);
        cleanup = SCENES[id].mount(node, me.active);
      })
      .catch((e: Error) => gone || setFailed(e.message));
    return () => {
      gone = true;
      if (cleanup) cleanup();
      node.replaceChildren();
    };
  }, [ready, id, practice, epoch]);

  return (
    <>
      <div className="game-bar">
        {practice ? (
          <p className="notice">
            Entraînement : la partie se joue sur cet appareil, rien n&apos;est envoyé au classement.{' '}
            {!account && !offline && <a href="#" onClick={(e) => { e.preventDefault(); App.openModal('register'); }}>Créer un compte pour jouer en classé</a>}
          </p>
        ) : (
          <p className="notice">Partie classée : chaque manche compte pour la saison.</p>
        )}
        {/* Ce qui remet des crédits en jeu reste à portée de main, près de la mise. */}
        <div className="game-actions">
          {user && practice && <button className="btn quiet small" onClick={() => App.resetPractice()}>Remettre à 10 000</button>}
          {user && !practice && user.canAdvance && <button className="btn quiet small" onClick={() => App.advance()}>Demander une avance</button>}
          <button className="btn quiet small" aria-pressed={immersive} onClick={toggleImmersive}>
            <Tile name="spyglass" />
            {immersive ? 'Quitter le plein écran' : 'Plein écran'}
          </button>
        </div>
      </div>
      {failed && <p className="notice">Le jeu n&apos;a pas pu démarrer : {failed}</p>}
      <div className="table">
        <section className="game" data-game={id} ref={root} />
        <SideBoard game={game.board ?? id} name={game.board ? byId(game.board)!.name : game.name} />
      </div>
    </>
  );
}
