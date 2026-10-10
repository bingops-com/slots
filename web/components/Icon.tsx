// Les dessins du projet sont des chaînes SVG (lib/art.js), partagées avec les scènes de jeu.
export default function Icon({ html }: { html: string }) {
  return <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: html }} />;
}
