import { makeTumble } from './tumble.js';

// Le Récif : les règles de Sweet Bonanza, parmi les coraux.
export default makeTumble({
  id: 'reef',
  art: 'reef',
  title: 'Le <span>Récif</span>',
  subtitle: 'Huit symboles pareils paient où qu\'ils soient ; en tours gratuits, des bulles multiplient jusqu\'à 100 fois, jusqu\'à 21 100 fois la mise.',
  multName: 'Bulle',
  free: 10,
  global: false,
  baseMult: false,
  max: 21100,
  like: 'Sweet Bonanza',
  rtp: '96,5 %',
  music: 'lagoon',
});
