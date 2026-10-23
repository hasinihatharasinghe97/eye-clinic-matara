/**
 * Classify a free-text patient address into one of Sri Lanka's 25 districts.
 * Matches the district name itself, common spelling variants, and main towns.
 */
const DISTRICT_PLACES = {
  Ampara: ['ampara', 'amparai', 'kalmunai', 'akkaraipattu', 'sammanthurai', 'pottuvil', 'uhana', 'dehiattakandiya', 'mahaoya', 'maha oya', 'padiyathalawa', 'nintavur', 'sainthamaruthu', 'addalaichenai'],
  Anuradhapura: ['anuradhapura', 'anuradapura', 'kekirawa', 'medawachchiya', 'thambuttegama', 'tambuttegama', 'eppawala', 'galenbindunuwewa', 'horowpothana', 'kebithigollewa', 'mihintale', 'nochchiyagama', 'thalawa', 'talawa', 'habarana', 'galnewa', 'padaviya', 'rambewa'],
  Badulla: ['badulla', 'bandarawela', 'haputale', 'welimada', 'mahiyanganaya', 'hali ela', 'hali-ela', 'passara', 'ella', 'diyatalawa', 'lunugala', 'kandaketiya', 'meegahakiula', 'soranatota', 'uva paranagama', 'haldummulla'],
  Batticaloa: ['batticaloa', 'eravur', 'kattankudy', 'kaththankudy', 'valaichchenai', 'vakarai', 'chenkalady', 'kaluwanchikudy', 'oddamavadi'],
  Colombo: ['colombo', 'dehiwala', 'mount lavinia', 'moratuwa', 'kotte', 'sri jayawardenepura', 'maharagama', 'nugegoda', 'kesbewa', 'piliyandala', 'homagama', 'kaduwela', 'malabe', 'battaramulla', 'kolonnawa', 'avissawella', 'padukka', 'hanwella', 'boralesgamuwa', 'kottawa', 'pannipitiya', 'rajagiriya', 'wellampitiya', 'ratmalana', 'athurugiriya', 'angoda', 'mulleriyawa', 'thalawathugoda', 'nawala', 'borella', 'wellawatte', 'kollupitiya', 'bambalapitiya', 'pettah', 'maradana', 'dematagoda', 'kirulapone', 'narahenpita', 'mattakkuliya', 'grandpass', 'kotahena'],
  Galle: ['galle', 'ambalangoda', 'hikkaduwa', 'elpitiya', 'baddegama', 'karapitiya', 'bentota', 'balapitiya', 'ahangama', 'habaraduwa', 'koggala', 'unawatuna', 'yakkalamulla', 'imaduwa', 'nagoda', 'udugama', 'neluwa', 'thawalama', 'karandeniya', 'akmeemana', 'bope poddala', 'wanduramba', 'induruwa', 'kosgoda', 'ahungalla', 'hiniduma'],
  Gampaha: ['gampaha', 'negombo', 'ja-ela', 'ja ela', 'jaela', 'wattala', 'kelaniya', 'kadawatha', 'ragama', 'minuwangoda', 'divulapitiya', 'mirigama', 'nittambuwa', 'veyangoda', 'kiribathgoda', 'katunayake', 'seeduwa', 'kandana', 'biyagama', 'delgoda', 'ganemulla', 'dompe', 'attanagalla', 'mahara', 'yakkala', 'kirindiwela', 'pugoda', 'malwana', 'hendala', 'kochchikade', 'pamunugama', 'ekala', 'weliweriya', 'radawana'],
  Hambantota: ['hambantota', 'tangalle', 'tangalla', 'tissamaharama', 'ambalantota', 'beliatta', 'weeraketiya', 'walasmulla', 'sooriyawewa', 'suriyawewa', 'middeniya', 'lunugamvehera', 'angunakolapelessa', 'okewela'],
  Jaffna: ['jaffna', 'chavakachcheri', 'point pedro', 'nallur', 'kopay', 'chunnakam', 'kankesanthurai', 'velanai', 'karainagar', 'tellippalai', 'manipay', 'chankanai', 'valvettithurai', 'kayts', 'nelliady'],
  Kalutara: ['kalutara', 'panadura', 'horana', 'beruwala', 'aluthgama', 'matugama', 'bandaragama', 'wadduwa', 'ingiriya', 'bulathsinhala', 'agalawatta', 'dodangoda', 'payagala', 'maggona', 'millaniya', 'palindanuwara', 'walallawita', 'mathugama', 'baduraliya', 'neboda'],
  Kandy: ['kandy', 'peradeniya', 'katugastota', 'gampola', 'nawalapitiya', 'kundasale', 'digana', 'akurana', 'pilimathalawa', 'kadugannawa', 'gelioya', 'galagedara', 'wattegama', 'teldeniya', 'medadumbara', 'harispattuwa', 'pujapitiya', 'pallekele', 'menikhinna', 'ampitiya', 'gurudeniya', 'hatharaliyadda', 'kengalla', 'madawala', 'panwila', 'udispattuwa', 'pathadumbara', 'yatinuwara', 'udunuwara', 'doluwa', 'galaha', 'murutalawa', 'gelioya'],
  Kegalle: ['kegalle', 'kegalla', 'mawanella', 'warakapola', 'rambukkana', 'ruwanwella', 'dehiowita', 'deraniyagala', 'galigamuwa', 'yatiyantota', 'aranayaka', 'bulathkohupitiya', 'kitulgala', 'hemmathagama', 'pinnawala'],
  Kilinochchi: ['kilinochchi', 'paranthan', 'pallai', 'poonakary'],
  Kurunegala: ['kurunegala', 'kuliyapitiya', 'pannala', 'narammala', 'wariyapola', 'nikaweratiya', 'polgahawela', 'alawwa', 'mawathagama', 'ibbagamuwa', 'giriulla', 'galgamuwa', 'hettipola', 'maho', 'melsiripura', 'bingiriya', 'ridigama', 'polpithigama', 'kobeigane', 'mallawapitiya', 'bamunakotuwa', 'dambadeniya', 'udubaddawa', 'rasnayakapura', 'ehetuwewa', 'pothuhera', 'weerambugedara', 'katupotha'],
  Mannar: ['mannar', 'talaimannar', 'murunkan', 'madhu', 'pesalai', 'nanattan'],
  Matale: ['matale', 'dambulla', 'galewela', 'naula', 'rattota', 'ukuwela', 'palapathwala', 'sigiriya', 'yatawatta', 'laggala', 'pallepola', 'wilgamuwa', 'kandalama', 'ambanganga'],
  Matara: ['matara', 'weligama', 'akuressa', 'hakmana', 'dikwella', 'deniyaya', 'kamburupitiya', 'devinuwara', 'dondra', 'mirissa', 'kotapola', 'pitabeddara', 'mulatiyana', 'thihagoda', 'malimbada', 'kirinda puhulwella', 'athuraliya', 'pasgoda', 'morawaka', 'dickwella'],
  Monaragala: ['monaragala', 'moneragala', 'wellawaya', 'bibile', 'buttala', 'siyambalanduwa', 'kataragama', 'medagama', 'madulla', 'thanamalwila', 'sevanagala', 'badalkumbura'],
  Mullaitivu: ['mullaitivu', 'mulativu', 'mullativu', 'puthukudiyiruppu', 'oddusuddan', 'mankulam', 'thunukkai', 'welioya', 'weli oya'],
  'Nuwara Eliya': ['nuwara eliya', 'nuwaraeliya', 'nuwara-eliya', 'hatton', 'talawakele', 'thalawakele', 'maskeliya', 'ginigathhena', 'ragala', 'walapane', 'kotmale', 'nanu oya', 'nanuoya', 'agarapathana', 'bogawantalawa', 'dickoya', 'norwood', 'pundaluoya', 'hanguranketa', 'maturata', 'rikillagaskada', 'udapussellawa', 'lindula'],
  Polonnaruwa: ['polonnaruwa', 'kaduruwela', 'hingurakgoda', 'medirigiriya', 'minneriya', 'welikanda', 'aralaganwila', 'dimbulagala', 'bakamuna', 'manampitiya', 'giritale', 'lankapura', 'elahera'],
  Puttalam: ['puttalam', 'chilaw', 'wennappuwa', 'marawila', 'nattandiya', 'dankotuwa', 'anamaduwa', 'kalpitiya', 'madampe', 'mundel', 'mahawewa', 'arachchikattuwa', 'pallama', 'nawagattegama', 'karuwalagaswewa', 'mahakumbukkadawala', 'wanathawilluwa', 'norochcholai'],
  Ratnapura: ['ratnapura', 'rathnapura', 'balangoda', 'embilipitiya', 'pelmadulla', 'eheliyagoda', 'kuruwita', 'kahawatta', 'rakwana', 'godakawela', 'kalawana', 'kiriella', 'opanayaka', 'nivithigala', 'weligepola', 'kolonna', 'imbulpe', 'ayagama', 'elapatha', 'kalthota'],
  Trincomalee: ['trincomalee', 'trinco', 'kinniya', 'kantale', 'mutur', 'muttur', 'kuchchaveli', 'nilaveli', 'seruwila', 'thambalagamuwa', 'gomarankadawala', 'morawewa', 'padavi sripura'],
  Vavuniya: ['vavuniya', 'cheddikulam', 'nedunkeni', 'omanthai', 'vengalacheddikulam'],
};

export const DISTRICTS = Object.keys(DISTRICT_PLACES);
export const UNKNOWN_DISTRICT = 'Unidentified';

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const MATCHERS = Object.entries(DISTRICT_PLACES).flatMap(([district, places]) =>
  [...new Set(places)].map((place) => ({
    district,
    // Whole-word match; allow any spacing/hyphen between words of a place name.
    re: new RegExp(`(^|[^a-z])${escape(place).replace(/[\s-]+/g, '[\\s-]*')}(?![a-z])`, 'g'),
  }))
);

/**
 * District for a patient's address. When several places match, the one written
 * last wins (addresses usually end with the town or district).
 */
export function districtFromAddress(address) {
  const text = String(address || '').toLowerCase();
  if (!text.trim()) return UNKNOWN_DISTRICT;
  let best = null;
  for (const { district, re } of MATCHERS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const end = m.index + m[0].length;
      if (!best || end > best.end || (end === best.end && m[0].length > best.len)) {
        best = { district, end, len: m[0].length };
      }
    }
  }
  return best ? best.district : UNKNOWN_DISTRICT;
}
