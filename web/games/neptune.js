import { makeTumble } from './tumble.js';

// Neptune : les règles de Gates of Olympus, sous la mer.
export default makeTumble({
  id: 'neptune',
  art: 'neptune',
  title: 'Nep<span>tune</span>',
  subtitle: 'Huit symboles pareils paient où qu\'ils soient ; des orbes multiplient jusqu\'à 500 fois, jusqu\'à 5 000 fois la mise.',
  multName: 'Orbe',
  free: 15,
  global: true,
  baseMult: true,
  max: 5000,
  like: 'Gates of Olympus',
  rtp: '96,5 %',
  music: 'temple',
});
