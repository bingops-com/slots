// Les dessins du projet sont des chaînes SVG (lib/art.js), partagées avec les scènes de jeu.
export default function Icon({ html }: { html: string }) {
  return <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: html }} />;
}

// Une icône de l'interface : dessinée en blanc, elle est posée sur une tuile bleue.
export function Tile({ name }: { name: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="ic tile" src={`/art/ui/${name}.webp`} alt="" />;
}
