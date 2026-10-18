// OurAirports' municipality column is often a suburb or carries a region suffix ("Caselle",
// "Colombier-Saugnieu, Rhône"). This hand-kept table gives the name a traveller books to: the city,
// or the island for island airports, short, in English. build-airports.mjs applies it to every
// airport's city and to the metroName of airports outside METRO_GROUPS; build-origins.mjs applies it
// to the worldwide origin list. Add an entry whenever a displayed name looks wrong.
export const CITY_NAMES = {
  // Italy
  AOI: "Ancona", CRV: "Crotone", CUF: "Cuneo", EBA: "Elba", FLR: "Florence", GOA: "Genoa",
  NAP: "Naples", TRN: "Turin", TRS: "Trieste", VBS: "Brescia", VRN: "Verona", QSR: "Salerno",
  PMF: "Parma", CIY: "Comiso",
  // France
  BSL: "Basel-Mulhouse", ETZ: "Metz-Nancy", FNI: "Nîmes", LDE: "Lourdes", LIG: "Limoges",
  LIL: "Lille", LPY: "Le Puy", LYS: "Lyon", MPL: "Montpellier", MRS: "Marseille", NCE: "Nice",
  PGF: "Perpignan", PIS: "Poitiers", PUF: "Pau", RDZ: "Rodez", RNS: "Rennes", TLN: "Toulon",
  TLS: "Toulouse", TUF: "Tours", XCR: "Châlons-Vatry", OUI: "Ushant",
  // Spain
  ACE: "Lanzarote", FUE: "Fuerteventura", EAS: "San Sebastián", GMZ: "La Gomera", LCG: "A Coruña",
  LEN: "León", LEU: "Andorra-La Seu", LPA: "Gran Canaria", MAH: "Menorca", OVD: "Asturias",
  PMI: "Palma de Mallorca", RMU: "Murcia", SPC: "La Palma", VDE: "El Hierro", VIT: "Vitoria",
  TFN: "Tenerife North", TFS: "Tenerife South", CDT: "Castellón", REU: "Reus", XRY: "Jerez",
  // Portugal (islands by island name)
  FLW: "Flores", GRW: "Graciosa", HOR: "Horta", PIX: "Pico", PXO: "Porto Santo", SJZ: "São Jorge",
  SMA: "Santa Maria", TER: "Terceira",
  // Greece
  ATH: "Athens", CFU: "Corfu", CHQ: "Chania", AOK: "Karpathos", EFL: "Kefalonia", JIK: "Ikaria",
  JKH: "Chios", JKL: "Kalymnos", JSH: "Sitia", JSY: "Syros", JTR: "Santorini", JTY: "Astypalaia",
  KGS: "Kos", KIT: "Kythira", KSJ: "Kasos", KSO: "Kastoria", KZS: "Kastellorizo", LRS: "Leros",
  LXS: "Lemnos", MJT: "Lesbos", MLO: "Milos", SKU: "Skyros", SMI: "Samos", VOL: "Volos",
  // Thailand
  LOE: "Loei", LPT: "Lampang", MAQ: "Mae Sot", NAW: "Narathiwat", NNT: "Nan", PHY: "Phetchabun",
  SNO: "Sakon Nakhon", THS: "Sukhothai", TDX: "Trat", USM: "Koh Samui", UTP: "Pattaya",
  // Germany
  CGN: "Cologne", FRA: "Frankfurt", HHN: "Frankfurt-Hahn", FKB: "Karlsruhe/Baden-Baden",
  FMO: "Münster/Osnabrück", GWT: "Sylt", HDF: "Heringsdorf", HEI: "Heide-Büsum", KSF: "Kassel",
  LEJ: "Leipzig/Halle", NRN: "Weeze", PAD: "Paderborn", RLG: "Rostock", FCN: "Cuxhaven",
  HGL: "Heligoland",
  // United Kingdom
  BHX: "Birmingham", BFS: "Belfast", BHD: "Belfast City", EDI: "Edinburgh", EMA: "East Midlands",
  EXT: "Exeter", HUY: "Humberside", ILY: "Islay", INV: "Inverness", ISC: "Isles of Scilly",
  KOI: "Orkney", LBA: "Leeds", LDY: "Derry", LEQ: "Land's End", LSI: "Shetland", LWK: "Lerwick",
  MAN: "Manchester", MME: "Teesside", NCL: "Newcastle", PIK: "Prestwick", PPW: "Papa Westray",
  NWI: "Norwich", OBN: "Oban", SYY: "Stornoway", TRE: "Tiree", BEB: "Benbecula", BRR: "Barra", WRY: "Westray", COL: "Coll",
  LHR: "London", LGW: "London", STN: "London", LTN: "London", LCY: "London", SEN: "London",
  // Croatia
  BWK: "Brač", ZAG: "Zagreb", PUY: "Pula",
  // Norway
  BDU: "Bardufoss", BNN: "Brønnøysund", HAU: "Haugesund", HOV: "Ørsta-Volda", KSU: "Kristiansund",
  MOL: "Molde", SKN: "Stokmarknes", SRP: "Stord", SSJ: "Sandnessjøen", TRF: "Sandefjord",
  OLA: "Ørland",
  // Sweden
  GOT: "Gothenburg", BLE: "Borlänge", HFS: "Hagfors", KRF: "Kramfors", NYO: "Nyköping",
  SCR: "Sälen", SDL: "Sundsvall", VST: "Västerås",
  // Turkey
  ADB: "Izmir", COV: "Mersin", GZP: "Alanya", KZR: "Kütahya", NAV: "Cappadocia", TEQ: "Tekirdağ",
  YEI: "Bursa", SAW: "Istanbul",
  // Japan
  AKJ: "Asahikawa", ASJ: "Amami", FKS: "Fukushima", FSZ: "Shizuoka", FUJ: "Goto Islands",
  GAJ: "Yamagata", IBR: "Ibaraki", IWJ: "Iwami", KCZ: "Kochi", KMQ: "Kanazawa", MMB: "Memanbetsu",
  MMY: "Miyako-jima", MYE: "Miyake-jima", NGO: "Nagoya", NKM: "Nagoya", OIM: "Oshima", OKA: "Naha",
  ONJ: "Odate-Noshiro", SDJ: "Sendai", SHI: "Shimojishima", UBJ: "Ube", UKB: "Kobe", NRT: "Tokyo",
  KIX: "Osaka", ITM: "Osaka", HND: "Tokyo", TKN: "Tokunoshima", OIR: "Okushiri", OKI: "Oki Islands",
  OKE: "Okinoerabu",
  // United States
  ABE: "Allentown", ACV: "Eureka", AVP: "Scranton", BMI: "Bloomington", BPT: "Beaumont",
  CVG: "Cincinnati", EWR: "Newark", ELM: "Elmira", GSP: "Greenville-Spartanburg", GTR: "Columbus",
  HNL: "Honolulu", LIH: "Kauai", OGG: "Maui", KOA: "Kona", JHM: "Kapalua", XNA: "Northwest Arkansas",
  SRQ: "Sarasota", PVD: "Providence", RFD: "Rockford", PIE: "St. Petersburg", SFB: "Orlando Sanford",
  RDU: "Raleigh-Durham", DFW: "Dallas", FLL: "Fort Lauderdale", GCN: "Grand Canyon", TYS: "Knoxville",
  MQT: "Marquette", MBS: "Saginaw", CMI: "Champaign", CIU: "Sault Ste. Marie", TRI: "Tri-Cities",
  DJT: "West Palm Beach", MRI: "Anchorage", BFI: "Seattle", IAD: "Washington", DCA: "Washington",
  BWI: "Baltimore", CKB: "Clarksburg", CMX: "Houghton", OAJ: "Jacksonville", ECP: "Panama City",
  VPS: "Fort Walton Beach", WST: "Westerly", MUE: "Waimea", PIB: "Hattiesburg", LCK: "Columbus",
  SHD: "Staunton", TTN: "Trenton", PDK: "Atlanta", OPF: "Miami", TEB: "Teterboro",
};
