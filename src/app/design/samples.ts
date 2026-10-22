import type { CardData } from '@/components/card/Card';
import type { Rarity } from '@/lib/rarity';

// The mock-up cards of the design system (real monuments, October 2026 data).
// Development only: photos load straight from Wikimedia Commons, which
// production never does. The excerpts are the mock-up's provisional ones.
const commons = (file: string, width: number | null = 640) => ({
  src: `https://commons.wikimedia.org/wiki/Special:FilePath/${file}${width ? `?width=${width}` : ''}`,
  fileUrl: `https://commons.wikimedia.org/wiki/File:${file}`,
});

export const samples = {
  eiffel: {
    name: 'tour Eiffel',
    rarity: 'legendary',
    department: 'Paris',
    region: 'Île-de-France',
    protection: 'inscrit',
    unesco: true,
    series: { name: 'Île-de-France', number: 1, total: 2386 },
    photo: { ...commons('Tour_Eiffel_Wikimedia_Commons.jpg', 720), width: 2900, height: 5367, author: 'Benh LIEU SONG', license: 'domaine public' },
    articleUrl: 'https://fr.wikipedia.org/wiki/Tour_Eiffel',
    excerpt:
      'Élevée par l’entreprise de Gustave Eiffel pour l’Exposition universelle de 1889, la tour de fer puddlé domine le Champ-de-Mars du haut de ses 330 mètres. D’abord décriée par une partie des artistes, elle est devenue l’emblème de Paris et l’un des monuments les plus visités au monde.',
  },
  notreDame: {
    name: 'cathédrale Notre-Dame de Paris',
    rarity: 'legendary',
    department: 'Paris',
    region: 'Île-de-France',
    protection: 'classe',
    unesco: true,
    series: { name: 'Île-de-France', number: 2, total: 2386 },
    photo: { ...commons('Notre-Dame_de_Paris_2013-07-24.jpg'), author: 'P e z i', license: 'CC BY-SA 3.0' },
  },
  chambord: {
    name: 'château de Chambord',
    rarity: 'legendary',
    department: 'Loir-et-Cher',
    region: 'Centre-Val de Loire',
    protection: 'classe',
    unesco: true,
    series: { name: 'Centre-Val de Loire', number: 1, total: 1874 },
    photo: { ...commons('France_Loir-et-Cher_Chambord_Chateau_03.jpg'), author: 'Calips', license: 'CC BY-SA 3.0' },
  },
  gard: {
    name: 'pont du Gard',
    rarity: 'legendary',
    department: 'Gard',
    region: 'Occitanie',
    protection: 'classe',
    unesco: true,
    series: { name: 'Occitanie', number: 2, total: 3512 },
    photo: { ...commons('Pont_du_Gard_BLS.jpg'), width: 12648, height: 4882, author: 'Benh LIEU SONG', license: 'CC BY-SA 3.0' },
  },
  // Deliberately broken photo URL: shows the fallback flat with the monument's name.
  boyard: {
    name: 'fort Boyard',
    rarity: 'legendary',
    department: 'Charente-Maritime',
    region: 'Nouvelle-Aquitaine',
    protection: 'inscrit',
    unesco: false,
    series: { name: 'Nouvelle-Aquitaine', number: 3, total: 4135 },
    photo: {
      src: 'https://commons.wikimedia.org/wiki/Special:FilePath/Photo_indisponible_maquette.jpg',
      fileUrl: 'https://commons.wikimedia.org/wiki/File:Fort_Boyard_%2851269094270%29.jpg',
      author: 'ERIC SALARD',
      license: 'CC BY-SA 2.0',
    },
  },
  thoronet: {
    name: 'abbaye du Thoronet',
    rarity: 'ultra',
    department: 'Var',
    region: 'Provence-Alpes-Côte d’Azur',
    protection: 'classe',
    unesco: false,
    series: { name: 'Provence-Alpes-Côte d’Azur', number: 4, total: 1452 },
    photo: { ...commons('Thoronet_Cloister_Garden.JPG'), author: 'SiefkinDR', license: 'domaine public' },
    articleUrl: 'https://fr.wikipedia.org/wiki/Abbaye_du_Thoronet',
    excerpt:
      'Fondée par des moines cisterciens au XIIe siècle dans un vallon boisé du Var, l’abbaye forme avec Sénanque et Silvacane les « trois sœurs provençales ». Son architecture dépouillée, toute de pierre nue, a profondément marqué Le Corbusier.',
  },
  soissons: {
    name: 'cathédrale Saint-Gervais-et-Saint-Protais de Soissons',
    rarity: 'ultra',
    department: 'Aisne',
    region: 'Hauts-de-France',
    protection: 'classe',
    unesco: false,
    series: { name: 'Hauts-de-France', number: 7, total: 1911 },
    photo: { ...commons('Soissons-cathedrale-facade.jpg'), author: null, license: 'CC BY-SA 2.5' },
  },
  stuarts: {
    name: 'château des Stuarts',
    rarity: 'super',
    department: 'Cher',
    region: 'Centre-Val de Loire',
    protection: 'classe',
    unesco: false,
    series: { name: 'Centre-Val de Loire', number: 31, total: 1874 },
    photo: { ...commons('AUBIGNY-SUR-N%C3%88RE_-_CH%C3%82TEAU_DES_STUARTS_-_COUR.JPG'), author: 'MOSSOT', license: 'CC BY-SA 3.0' },
  },
  isle: {
    name: 'palais de l’Isle',
    rarity: 'super',
    department: 'Haute-Savoie',
    region: 'Auvergne-Rhône-Alpes',
    protection: 'classe',
    unesco: false,
    series: { name: 'Auvergne-Rhône-Alpes', number: 18, total: 3197 },
    photo: { ...commons('Palais_de_l%27Isle_Annecy_%28%C3%A9t%C3%A9_2005%29.jpg'), width: 768, height: 1024, author: 'Droopy nico', license: 'CC BY-SA 1.0' },
  },
  napoleon: {
    name: 'monument à Napoléon',
    rarity: 'rare',
    department: 'Manche',
    region: 'Normandie',
    protection: 'classe',
    unesco: false,
    series: { name: 'Normandie', number: 112, total: 2241 },
    photo: {
      ...commons('Statue_r%C3%A9nov%C3%A9e_de_Napol%C3%A9on_Ier_%C3%A0_Cherbourg-en-Cotentin.jpg'),
      author: 'JMEnault, Ville de Cherbourg-en-Cotentin',
      license: 'CC BY-SA 4.0',
    },
  },
  compiegne: {
    name: 'remparts de Compiègne',
    rarity: 'uncommon',
    department: 'Oise',
    region: 'Hauts-de-France',
    protection: 'inscrit',
    unesco: false,
    series: { name: 'Hauts-de-France', number: 486, total: 1911 },
    photo: { ...commons('Remparts_de_Compi%C3%A8gne.jpg'), author: 'Raisonnier', license: 'CC BY-SA 3.0' },
  },
  attigny: {
    name: 'église Notre-Dame d’Attigny',
    rarity: 'common',
    department: 'Ardennes',
    region: 'Grand Est',
    protection: 'classe',
    unesco: false,
    series: { name: 'Grand Est', number: 1204, total: 2752 },
    photo: { ...commons('%C3%89glise_Notre-Dame_d%27Attigny.JPG'), author: 'Adri08', license: 'CC BY-SA 3.0' },
  },
  horloge: {
    name: 'tour de l’Horloge',
    rarity: 'common',
    department: 'Nièvre',
    region: 'Bourgogne-Franche-Comté',
    protection: 'inscrit',
    unesco: false,
    series: { name: 'Bourgogne-Franche-Comté', number: 1873, total: 2398 },
    photo: { ...commons('Nevers_beffroi_01.JPG', null), width: 396, height: 528, author: 'Cypris', license: 'CC BY-SA 3.0' },
  },
} satisfies Record<string, CardData>;

// The token table of the mock-up, light and dark values (src/styles/theme.css
// and the heritage collection's theme).
export const tokens = [
  ['--color-bg', 'Fond', '#f5ead8', '#201e1d'],
  ['--color-surface', 'Surface : panneaux, fenêtres', '#ebddc5', '#2e2b25'],
  ['--color-text', 'Texte', '#201e1d', '#f5ead8'],
  ['--color-text-muted', 'Texte secondaire', '#645c50', '#c0b6a5'],
  ['--color-track', 'Fond de jauge', '#dcd3c4', '#474238'],
  ['--color-accent', 'Terracotta : aplats, icônes, gros texte', '#c67139', '#f6a06b'],
  ['--color-accent-strong', 'Terracotta pour le texte courant', '#8c491a', '#ffc6a5'],
  ['--color-accent-tint', 'Fond teinté terracotta', '#ffe1d0', '#643312'],
  ['--color-on-accent', 'Texte sur aplat', '#201e1d', '#201e1d'],
  ['--color-sage', 'Sauge : sélection, échanges, UNESCO', '#7a8a5e', '#aebf92'],
  ['--color-sage-tint', 'Fond teinté sauge', '#e1eecc', '#3d472b'],
  ['--color-success', 'Succès', '#56633f', '#aebf92'],
  ['--color-warning', 'Alerte', '#8f5300', '#f0b860'],
  ['--color-danger', 'Erreur', '#a83a2c', '#f28b7d'],
].map(([name, role, light, dark]) => ({ name, role, light, dark }));

// The rarity table of the mock-up: share of the catalogue and card counts are
// its sample values; the colors are theme.css's.
export const rarityTable: Record<Rarity, { share: string; cards: string; fill: string; line: string }> = {
  legendary: { share: '0,25 %', cards: '67', fill: '#e0654a', line: '#a8362a' },
  ultra: { share: '2,5 %', cards: '669', fill: '#e9b949', line: '#8a6100' },
  super: { share: '7 %', cards: '1 873', fill: '#b48ac8', line: '#7a4a92' },
  rare: { share: '20 %', cards: '5 351', fill: '#6fa3cc', line: '#2f6a96' },
  uncommon: { share: '20 %', cards: '5 351', fill: '#9db07f', line: '#56633f' },
  common: { share: '50,25 %', cards: '13 444', fill: '#cfc5b4', line: '#645c50' },
};

// The default odds: each rarity's share of the catalogue.
export const defaultOdds = [
  { rarity: 'legendary', probability: 0.0025 },
  { rarity: 'ultra', probability: 0.025 },
  { rarity: 'super', probability: 0.07 },
  { rarity: 'rare', probability: 0.2 },
  { rarity: 'uncommon', probability: 0.2 },
  { rarity: 'common', probability: 0.5025 },
] as const;
