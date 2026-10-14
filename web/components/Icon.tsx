import { Languages, LogOut, Maximize2, Minimize2, UserRound, Volume2, VolumeX, WifiOff } from 'lucide-react';

// Les dessins du projet restent réservés aux jeux et à leur navigation.
export default function Icon({ html }: { html: string }) {
  return <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: html }} />;
}

const CONTROLS = { sound: Volume2, mute: VolumeX, language: Languages, logout: LogOut, user: UserRound, expand: Maximize2, shrink: Minimize2, offline: WifiOff };

// Un tracé unique, sans tuile ni image : les libellés portent le nom de l'action.
export function ControlIcon({ name }: { name: keyof typeof CONTROLS }) {
  const Glyph = CONTROLS[name];
  return <Glyph className="control-icon" size={18} strokeWidth={1.8} aria-hidden="true" focusable="false" />;
}
