/**
 * Auto-generated from docs/data/historical-person-names/cc0-mythic-ancient-names.csv
 * Source: Wikidata (CC0 1.0). Do not edit by hand — re-run:
 *   node scripts/generateCc0MythicAncientNames.mjs
 *   node scripts/emitMythicAncientNamesTs.mjs
 */
export type MythicNameGender = "male" | "female" | "unknown";
export type MythicNameCategory = "mythology" | "ancient_person";

export interface MythicAncientNameEntry {
  baseId: number;
  name: string;
  gender: MythicNameGender;
  category: MythicNameCategory;
  qid: string;
}

/** Entries keyed by FMG real-world name_base_id (cultural sphere). Never cross-mix spheres at pick time. */
export const MYTHIC_ANCIENT_NAMES: readonly MythicAncientNameEntry[] = [
  {
    baseId: 0,
    name: "Beowulf",
    gender: "unknown",
    category: "mythology",
    qid: "Q48328"
  },
  {
    baseId: 0,
    name: "Brunhild",
    gender: "unknown",
    category: "mythology",
    qid: "Q992632"
  },
  {
    baseId: 0,
    name: "Roland",
    gender: "male",
    category: "mythology",
    qid: "Q207535"
  },
  {
    baseId: 0,
    name: "Siegfried",
    gender: "unknown",
    category: "mythology",
    qid: "Q333146"
  },
  {
    baseId: 1,
    name: "Galahad",
    gender: "male",
    category: "mythology",
    qid: "Q831462"
  },
  {
    baseId: 1,
    name: "Gawain",
    gender: "male",
    category: "mythology",
    qid: "Q831685"
  },
  {
    baseId: 1,
    name: "Guinevere",
    gender: "female",
    category: "mythology",
    qid: "Q272054"
  },
  {
    baseId: 1,
    name: "King Arthur",
    gender: "male",
    category: "mythology",
    qid: "Q45792"
  },
  {
    baseId: 1,
    name: "Lancelot",
    gender: "male",
    category: "mythology",
    qid: "Q215681"
  },
  {
    baseId: 1,
    name: "Merlin",
    gender: "unknown",
    category: "mythology",
    qid: "Q76148"
  },
  {
    baseId: 1,
    name: "Mordred",
    gender: "male",
    category: "mythology",
    qid: "Q81109"
  },
  {
    baseId: 1,
    name: "Percival",
    gender: "male",
    category: "mythology",
    qid: "Q728510"
  },
  {
    baseId: 1,
    name: "Tristan",
    gender: "unknown",
    category: "mythology",
    qid: "Q413090"
  },
  {
    baseId: 4,
    name: "Abner of Burgos",
    gender: "male",
    category: "ancient_person",
    qid: "Q322560"
  },
  {
    baseId: 4,
    name: "Achila II",
    gender: "male",
    category: "ancient_person",
    qid: "Q393730"
  },
  {
    baseId: 4,
    name: "Adelgaster",
    gender: "male",
    category: "ancient_person",
    qid: "Q8188115"
  },
  {
    baseId: 4,
    name: "Attilanus of Zamora",
    gender: "male",
    category: "ancient_person",
    qid: "Q705797"
  },
  {
    baseId: 4,
    name: "Azriel",
    gender: "male",
    category: "ancient_person",
    qid: "Q557882"
  },
  {
    baseId: 4,
    name: "Bernhard",
    gender: "male",
    category: "ancient_person",
    qid: "Q824674"
  },
  {
    baseId: 4,
    name: "Diego de Acebo",
    gender: "male",
    category: "ancient_person",
    qid: "Q1220590"
  },
  {
    baseId: 4,
    name: "Dominicus Gundissalinus",
    gender: "male",
    category: "ancient_person",
    qid: "Q1237726"
  },
  {
    baseId: 4,
    name: "Durand of Huesca",
    gender: "male",
    category: "ancient_person",
    qid: "Q3041516"
  },
  {
    baseId: 4,
    name: "Emilian of Cogolla",
    gender: "male",
    category: "ancient_person",
    qid: "Q153204"
  },
  {
    baseId: 4,
    name: "Fandilus",
    gender: "male",
    category: "ancient_person",
    qid: "Q2082240"
  },
  {
    baseId: 4,
    name: "Fernando Díaz Gudiel",
    gender: "male",
    category: "ancient_person",
    qid: "Q5859476"
  },
  {
    baseId: 4,
    name: "Fernando Pérez",
    gender: "male",
    category: "ancient_person",
    qid: "Q5801647"
  },
  {
    baseId: 4,
    name: "Flaianus",
    gender: "male",
    category: "ancient_person",
    qid: "Q5457050"
  },
  {
    baseId: 4,
    name: "Florentius",
    gender: "male",
    category: "ancient_person",
    qid: "Q3746711"
  },
  {
    baseId: 4,
    name: "Francio of Cantabria",
    gender: "male",
    category: "ancient_person",
    qid: "Q5802517"
  },
  {
    baseId: 4,
    name: "Froila",
    gender: "male",
    category: "ancient_person",
    qid: "Q5505325"
  },
  {
    baseId: 4,
    name: "Fruela Díaz",
    gender: "male",
    category: "ancient_person",
    qid: "Q5506348"
  },
  {
    baseId: 4,
    name: "Fulgentius of Cartagena",
    gender: "male",
    category: "ancient_person",
    qid: "Q2616176"
  },
  {
    baseId: 4,
    name: "García Álvarez",
    gender: "male",
    category: "ancient_person",
    qid: "Q1493998"
  },
  {
    baseId: 4,
    name: "Gil de Torres",
    gender: "male",
    category: "ancient_person",
    qid: "Q748383"
  },
  {
    baseId: 4,
    name: "Gonzalo Miguel",
    gender: "male",
    category: "ancient_person",
    qid: "Q5883112"
  },
  {
    baseId: 4,
    name: "Gonzalo Pérez Gudiel",
    gender: "male",
    category: "ancient_person",
    qid: "Q2420654"
  },
  {
    baseId: 4,
    name: "Gonzalo de Aguilar",
    gender: "male",
    category: "ancient_person",
    qid: "Q5883357"
  },
  {
    baseId: 4,
    name: "Hugo of Santalla",
    gender: "male",
    category: "ancient_person",
    qid: "Q387106"
  },
  {
    baseId: 4,
    name: "Ibn Juzayy",
    gender: "male",
    category: "ancient_person",
    qid: "Q3773066"
  },
  {
    baseId: 4,
    name: "Ibn Luyun",
    gender: "male",
    category: "ancient_person",
    qid: "Q3147449"
  },
  {
    baseId: 4,
    name: "Isaac ibn Latif",
    gender: "male",
    category: "ancient_person",
    qid: "Q1673518"
  },
  {
    baseId: 4,
    name: "Jacob ben Reuben",
    gender: "male",
    category: "ancient_person",
    qid: "Q1679439"
  },
  {
    baseId: 4,
    name: "Juan de Ortega",
    gender: "male",
    category: "ancient_person",
    qid: "Q2713819"
  },
  {
    baseId: 4,
    name: "Judah ben Asher",
    gender: "male",
    category: "ancient_person",
    qid: "Q828097"
  },
  {
    baseId: 4,
    name: "Lucas de Tuy",
    gender: "male",
    category: "ancient_person",
    qid: "Q3065693"
  },
  {
    baseId: 4,
    name: "Munio of Zamora",
    gender: "male",
    category: "ancient_person",
    qid: "Q2356240"
  },
  {
    baseId: 4,
    name: "Opilano",
    gender: "male",
    category: "ancient_person",
    qid: "Q6051614"
  },
  {
    baseId: 4,
    name: "Pedro Ansúrez",
    gender: "male",
    category: "ancient_person",
    qid: "Q1159977"
  },
  {
    baseId: 4,
    name: "Pedro de Cuéllar",
    gender: "male",
    category: "ancient_person",
    qid: "Q6070467"
  },
  {
    baseId: 4,
    name: "Pedro de Peñafiel",
    gender: "male",
    category: "ancient_person",
    qid: "Q6070553"
  },
  {
    baseId: 4,
    name: "Pelayo Peláez",
    gender: "male",
    category: "ancient_person",
    qid: "Q6070890"
  },
  {
    baseId: 4,
    name: "Pere Tomás",
    gender: "male",
    category: "ancient_person",
    qid: "Q6070246"
  },
  {
    baseId: 4,
    name: "Pere de Montsó",
    gender: "male",
    category: "ancient_person",
    qid: "Q3899765"
  },
  {
    baseId: 4,
    name: "Peter González",
    gender: "male",
    category: "ancient_person",
    qid: "Q2715632"
  },
  {
    baseId: 4,
    name: "Pêro da Ponte",
    gender: "male",
    category: "ancient_person",
    qid: "Q1779292"
  },
  {
    baseId: 4,
    name: "Ramon de Caldes",
    gender: "male",
    category: "ancient_person",
    qid: "Q3608950"
  },
  {
    baseId: 4,
    name: "Salomon ibn Parhon",
    gender: "male",
    category: "ancient_person",
    qid: "Q3470074"
  },
  {
    baseId: 4,
    name: "Savaric I",
    gender: "male",
    category: "ancient_person",
    qid: "Q7427948"
  },
  {
    baseId: 4,
    name: "Shem-Tov ibn Falaquera",
    gender: "male",
    category: "ancient_person",
    qid: "Q1383938"
  },
  {
    baseId: 4,
    name: "Sisebut",
    gender: "male",
    category: "ancient_person",
    qid: "Q350656"
  },
  {
    baseId: 4,
    name: "Sisebut de Cardeña",
    gender: "male",
    category: "ancient_person",
    qid: "Q5678123"
  },
  {
    baseId: 4,
    name: "Teresa Gil",
    gender: "female",
    category: "ancient_person",
    qid: "Q6142561"
  },
  {
    baseId: 6,
    name: "Alako",
    gender: "unknown",
    category: "mythology",
    qid: "Q2016658"
  },
  {
    baseId: 6,
    name: "Alfadur",
    gender: "unknown",
    category: "mythology",
    qid: "Q9602646"
  },
  {
    baseId: 6,
    name: "Alfrigg",
    gender: "unknown",
    category: "mythology",
    qid: "Q2646410"
  },
  {
    baseId: 6,
    name: "Alsviðr",
    gender: "unknown",
    category: "mythology",
    qid: "Q432825"
  },
  {
    baseId: 6,
    name: "Alvaldi",
    gender: "male",
    category: "mythology",
    qid: "Q2021358"
  },
  {
    baseId: 6,
    name: "Alvíss",
    gender: "male",
    category: "mythology",
    qid: "Q1143134"
  },
  {
    baseId: 6,
    name: "Andhrímnir",
    gender: "unknown",
    category: "mythology",
    qid: "Q534156"
  },
  {
    baseId: 6,
    name: "Andvari",
    gender: "male",
    category: "mythology",
    qid: "Q525149"
  },
  {
    baseId: 6,
    name: "Annar",
    gender: "male",
    category: "mythology",
    qid: "Q2573198"
  },
  {
    baseId: 6,
    name: "Aslaug",
    gender: "female",
    category: "mythology",
    qid: "Q732678"
  },
  {
    baseId: 6,
    name: "Atla",
    gender: "female",
    category: "mythology",
    qid: "Q2143293"
  },
  {
    baseId: 6,
    name: "Aurvandill",
    gender: "male",
    category: "mythology",
    qid: "Q279501"
  },
  {
    baseId: 6,
    name: "Barri",
    gender: "unknown",
    category: "mythology",
    qid: "Q4863474"
  },
  {
    baseId: 6,
    name: "Bergelmir",
    gender: "male",
    category: "mythology",
    qid: "Q266233"
  },
  {
    baseId: 6,
    name: "Bifröst",
    gender: "unknown",
    category: "mythology",
    qid: "Q208525"
  },
  {
    baseId: 6,
    name: "Billingr",
    gender: "male",
    category: "mythology",
    qid: "Q953464"
  },
  {
    baseId: 6,
    name: "Bláin",
    gender: "unknown",
    category: "mythology",
    qid: "Q881142"
  },
  {
    baseId: 6,
    name: "Bragi",
    gender: "male",
    category: "mythology",
    qid: "Q199959"
  },
  {
    baseId: 6,
    name: "Brokkr",
    gender: "male",
    category: "mythology",
    qid: "Q926010"
  },
  {
    baseId: 6,
    name: "Byggvir",
    gender: "male",
    category: "mythology",
    qid: "Q1018519"
  },
  {
    baseId: 6,
    name: "Bödvar Bjarki",
    gender: "male",
    category: "mythology",
    qid: "Q2519089"
  },
  {
    baseId: 6,
    name: "Bøyg",
    gender: "unknown",
    category: "mythology",
    qid: "Q1789846"
  },
  {
    baseId: 6,
    name: "Búri",
    gender: "male",
    category: "mythology",
    qid: "Q336145"
  },
  {
    baseId: 6,
    name: "Býleistr",
    gender: "male",
    category: "mythology",
    qid: "Q1018548"
  },
  {
    baseId: 6,
    name: "Dagr",
    gender: "male",
    category: "mythology",
    qid: "Q1136295"
  },
  {
    baseId: 6,
    name: "Dellingr",
    gender: "male",
    category: "mythology",
    qid: "Q944790"
  },
  {
    baseId: 6,
    name: "Durinn",
    gender: "unknown",
    category: "mythology",
    qid: "Q1261767"
  },
  {
    baseId: 6,
    name: "Dvalinn",
    gender: "unknown",
    category: "mythology",
    qid: "Q1268297"
  },
  {
    baseId: 6,
    name: "Dáinn",
    gender: "unknown",
    category: "mythology",
    qid: "Q841703"
  },
  {
    baseId: 6,
    name: "Eggther",
    gender: "unknown",
    category: "mythology",
    qid: "Q981889"
  },
  {
    baseId: 6,
    name: "Eir",
    gender: "female",
    category: "mythology",
    qid: "Q427355"
  },
  {
    baseId: 6,
    name: "Elli",
    gender: "female",
    category: "mythology",
    qid: "Q1283197"
  },
  {
    baseId: 6,
    name: "Fimafeng",
    gender: "male",
    category: "mythology",
    qid: "Q2540845"
  },
  {
    baseId: 6,
    name: "Fin",
    gender: "unknown",
    category: "mythology",
    qid: "Q2481558"
  },
  {
    baseId: 6,
    name: "Fjölnir",
    gender: "male",
    category: "mythology",
    qid: "Q1400296"
  },
  {
    baseId: 6,
    name: "Fjölvar",
    gender: "unknown",
    category: "mythology",
    qid: "Q742527"
  },
  {
    baseId: 6,
    name: "Fjörgyn",
    gender: "female",
    category: "mythology",
    qid: "Q108807778"
  },
  {
    baseId: 6,
    name: "Forseti",
    gender: "male",
    category: "mythology",
    qid: "Q62548"
  },
  {
    baseId: 6,
    name: "Freyr",
    gender: "male",
    category: "mythology",
    qid: "Q131474"
  },
  {
    baseId: 6,
    name: "Frigg",
    gender: "female",
    category: "mythology",
    qid: "Q131654"
  },
  {
    baseId: 6,
    name: "Frotho I",
    gender: "male",
    category: "mythology",
    qid: "Q887924"
  },
  {
    baseId: 6,
    name: "Fulla",
    gender: "female",
    category: "mythology",
    qid: "Q847429"
  },
  {
    baseId: 6,
    name: "Fáfnir",
    gender: "male",
    category: "mythology",
    qid: "Q745315"
  },
  {
    baseId: 6,
    name: "Gandalf",
    gender: "unknown",
    category: "mythology",
    qid: "Q587350"
  },
  {
    baseId: 6,
    name: "Gaut",
    gender: "male",
    category: "mythology",
    qid: "Q1402029"
  },
  {
    baseId: 6,
    name: "Gersemi",
    gender: "female",
    category: "mythology",
    qid: "Q1515018"
  },
  {
    baseId: 6,
    name: "Gestumblindi",
    gender: "unknown",
    category: "mythology",
    qid: "Q1519694"
  },
  {
    baseId: 6,
    name: "Gjallarbrú",
    gender: "unknown",
    category: "mythology",
    qid: "Q1528902"
  },
  {
    baseId: 6,
    name: "Gjálp and Greip",
    gender: "unknown",
    category: "mythology",
    qid: "Q345799"
  },
  {
    baseId: 6,
    name: "Gjöll",
    gender: "unknown",
    category: "mythology",
    qid: "Q1500292"
  },
  {
    baseId: 6,
    name: "Glenr",
    gender: "male",
    category: "mythology",
    qid: "Q5569275"
  },
  {
    baseId: 6,
    name: "Grani",
    gender: "unknown",
    category: "mythology",
    qid: "Q2418385"
  },
  {
    baseId: 6,
    name: "Grerr",
    gender: "unknown",
    category: "mythology",
    qid: "Q1545912"
  },
  {
    baseId: 6,
    name: "Grimhild",
    gender: "female",
    category: "mythology",
    qid: "Q1565635"
  },
  {
    baseId: 6,
    name: "Grímnir",
    gender: "unknown",
    category: "mythology",
    qid: "Q1262034"
  },
  {
    baseId: 6,
    name: "Gróa",
    gender: "female",
    category: "mythology",
    qid: "Q1280875"
  },
  {
    baseId: 6,
    name: "Gudrun",
    gender: "female",
    category: "mythology",
    qid: "Q1257834"
  },
  {
    baseId: 6,
    name: "Gullfaxi",
    gender: "unknown",
    category: "mythology",
    qid: "Q1200682"
  },
  {
    baseId: 6,
    name: "Gullveig",
    gender: "female",
    category: "mythology",
    qid: "Q1324152"
  },
  {
    baseId: 6,
    name: "Gutthorm",
    gender: "male",
    category: "mythology",
    qid: "Q1557360"
  },
  {
    baseId: 6,
    name: "Gylfi",
    gender: "male",
    category: "mythology",
    qid: "Q2296321"
  },
  {
    baseId: 6,
    name: "Göll",
    gender: "female",
    category: "mythology",
    qid: "Q96657669"
  },
  {
    baseId: 6,
    name: "Hagbard",
    gender: "male",
    category: "mythology",
    qid: "Q1456415"
  },
  {
    baseId: 6,
    name: "Hagen",
    gender: "male",
    category: "mythology",
    qid: "Q1568447"
  },
  {
    baseId: 6,
    name: "Heidrek",
    gender: "male",
    category: "mythology",
    qid: "Q2215697"
  },
  {
    baseId: 6,
    name: "Heiðr",
    gender: "female",
    category: "mythology",
    qid: "Q2243464"
  },
  {
    baseId: 6,
    name: "Helblindi",
    gender: "male",
    category: "mythology",
    qid: "Q282516"
  },
  {
    baseId: 6,
    name: "Helgi Hundingsbane",
    gender: "male",
    category: "mythology",
    qid: "Q155432"
  },
  {
    baseId: 6,
    name: "Hermod",
    gender: "male",
    category: "mythology",
    qid: "Q579612"
  },
  {
    baseId: 6,
    name: "Hervör alvitr",
    gender: "female",
    category: "mythology",
    qid: "Q1115537"
  },
  {
    baseId: 6,
    name: "Hildr",
    gender: "female",
    category: "mythology",
    qid: "Q2580125"
  },
  {
    baseId: 6,
    name: "Himinglæva",
    gender: "female",
    category: "mythology",
    qid: "Q666857"
  },
  {
    baseId: 6,
    name: "Hlöd",
    gender: "unknown",
    category: "mythology",
    qid: "Q2383464"
  },
  {
    baseId: 6,
    name: "Hnoss",
    gender: "female",
    category: "mythology",
    qid: "Q1543730"
  },
  {
    baseId: 6,
    name: "Hoddmímis holt",
    gender: "unknown",
    category: "mythology",
    qid: "Q679137"
  },
  {
    baseId: 6,
    name: "Hreiðmarr",
    gender: "male",
    category: "mythology",
    qid: "Q1390232"
  },
  {
    baseId: 6,
    name: "Hringhorni",
    gender: "unknown",
    category: "mythology",
    qid: "Q1424849"
  },
  {
    baseId: 6,
    name: "Hrist",
    gender: "female",
    category: "mythology",
    qid: "Q10655862"
  },
  {
    baseId: 6,
    name: "Hræsvelgr",
    gender: "male",
    category: "mythology",
    qid: "Q564342"
  },
  {
    baseId: 6,
    name: "Hvergelmir",
    gender: "unknown",
    category: "mythology",
    qid: "Q536442"
  },
  {
    baseId: 6,
    name: "Högne",
    gender: "male",
    category: "mythology",
    qid: "Q937699"
  },
  {
    baseId: 6,
    name: "Ilmr",
    gender: "female",
    category: "mythology",
    qid: "Q3323186"
  },
  {
    baseId: 6,
    name: "Ingunar-Freyr",
    gender: "unknown",
    category: "mythology",
    qid: "Q519622"
  },
  {
    baseId: 6,
    name: "Iðunn",
    gender: "female",
    category: "mythology",
    qid: "Q204691"
  },
  {
    baseId: 6,
    name: "Jörð",
    gender: "female",
    category: "mythology",
    qid: "Q548730"
  },
  {
    baseId: 6,
    name: "Jötnar",
    gender: "unknown",
    category: "mythology",
    qid: "Q210053"
  },
  {
    baseId: 6,
    name: "Kvasir",
    gender: "male",
    category: "mythology",
    qid: "Q216763"
  },
  {
    baseId: 6,
    name: "Kári",
    gender: "male",
    category: "mythology",
    qid: "Q688566"
  },
  {
    baseId: 6,
    name: "Kólga",
    gender: "female",
    category: "mythology",
    qid: "Q179227"
  },
  {
    baseId: 6,
    name: "Laufey",
    gender: "female",
    category: "mythology",
    qid: "Q607641"
  },
  {
    baseId: 6,
    name: "Leikn",
    gender: "unknown",
    category: "mythology",
    qid: "Q388585"
  },
  {
    baseId: 6,
    name: "Loki",
    gender: "unknown",
    category: "mythology",
    qid: "Q133147"
  },
  {
    baseId: 6,
    name: "Lóðurr",
    gender: "male",
    category: "mythology",
    qid: "Q1501311"
  },
  {
    baseId: 6,
    name: "Magni",
    gender: "male",
    category: "mythology",
    qid: "Q1845668"
  },
  {
    baseId: 6,
    name: "Meili",
    gender: "male",
    category: "mythology",
    qid: "Q1617533"
  },
  {
    baseId: 6,
    name: "Miskorblindi",
    gender: "male",
    category: "mythology",
    qid: "Q2200742"
  },
  {
    baseId: 6,
    name: "Mundilfari",
    gender: "male",
    category: "mythology",
    qid: "Q578248"
  },
  {
    baseId: 6,
    name: "Muspell",
    gender: "male",
    category: "mythology",
    qid: "Q675304"
  },
  {
    baseId: 6,
    name: "Máni",
    gender: "male",
    category: "mythology",
    qid: "Q739765"
  },
  {
    baseId: 6,
    name: "Mímameiðr",
    gender: "unknown",
    category: "mythology",
    qid: "Q1273709"
  },
  {
    baseId: 6,
    name: "Mímir",
    gender: "male",
    category: "mythology",
    qid: "Q336496"
  },
  {
    baseId: 6,
    name: "Mímisbrunnr",
    gender: "unknown",
    category: "mythology",
    qid: "Q990571"
  },
  {
    baseId: 6,
    name: "Mótsognir",
    gender: "unknown",
    category: "mythology",
    qid: "Q1284136"
  },
  {
    baseId: 6,
    name: "Móðguðr",
    gender: "female",
    category: "mythology",
    qid: "Q1752972"
  },
  {
    baseId: 6,
    name: "Móði",
    gender: "male",
    category: "mythology",
    qid: "Q601453"
  },
  {
    baseId: 6,
    name: "Mökkurkálfi",
    gender: "unknown",
    category: "mythology",
    qid: "Q3267273"
  },
  {
    baseId: 6,
    name: "Naglfar",
    gender: "unknown",
    category: "mythology",
    qid: "Q846277"
  },
  {
    baseId: 6,
    name: "Naglfari",
    gender: "male",
    category: "mythology",
    qid: "Q2736538"
  },
  {
    baseId: 6,
    name: "Nanna",
    gender: "female",
    category: "mythology",
    qid: "Q500390"
  },
  {
    baseId: 6,
    name: "Nari",
    gender: "male",
    category: "mythology",
    qid: "Q1194706"
  },
  {
    baseId: 6,
    name: "Nepr",
    gender: "male",
    category: "mythology",
    qid: "Q929021"
  },
  {
    baseId: 6,
    name: "Ninus",
    gender: "male",
    category: "mythology",
    qid: "Q1152356"
  },
  {
    baseId: 6,
    name: "Niðhad",
    gender: "male",
    category: "mythology",
    qid: "Q1987427"
  },
  {
    baseId: 6,
    name: "Njord",
    gender: "male",
    category: "mythology",
    qid: "Q193879"
  },
  {
    baseId: 6,
    name: "Njörun",
    gender: "female",
    category: "mythology",
    qid: "Q431044"
  },
  {
    baseId: 6,
    name: "Norse dwarves",
    gender: "unknown",
    category: "mythology",
    qid: "Q2738581"
  },
  {
    baseId: 6,
    name: "Nótt",
    gender: "female",
    category: "mythology",
    qid: "Q576795"
  },
  {
    baseId: 6,
    name: "Odin",
    gender: "male",
    category: "mythology",
    qid: "Q43610"
  },
  {
    baseId: 6,
    name: "Ragnarök",
    gender: "unknown",
    category: "mythology",
    qid: "Q170148"
  },
  {
    baseId: 6,
    name: "Regin",
    gender: "male",
    category: "mythology",
    qid: "Q1502974"
  },
  {
    baseId: 6,
    name: "Rerir",
    gender: "male",
    category: "mythology",
    qid: "Q457767"
  },
  {
    baseId: 6,
    name: "Rindr",
    gender: "female",
    category: "mythology",
    qid: "Q1324396"
  },
  {
    baseId: 6,
    name: "Rán",
    gender: "female",
    category: "mythology",
    qid: "Q663348"
  },
  {
    baseId: 6,
    name: "Ríg",
    gender: "unknown",
    category: "mythology",
    qid: "Q15843446"
  },
  {
    baseId: 6,
    name: "Röskva",
    gender: "female",
    category: "mythology",
    qid: "Q1852740"
  },
  {
    baseId: 6,
    name: "Sif",
    gender: "female",
    category: "mythology",
    qid: "Q211613"
  },
  {
    baseId: 6,
    name: "Siggeir",
    gender: "male",
    category: "mythology",
    qid: "Q1810814"
  },
  {
    baseId: 6,
    name: "Sigi",
    gender: "male",
    category: "mythology",
    qid: "Q458489"
  },
  {
    baseId: 6,
    name: "Sigmund",
    gender: "male",
    category: "mythology",
    qid: "Q1158552"
  },
  {
    baseId: 6,
    name: "Sigrdrífa",
    gender: "female",
    category: "mythology",
    qid: "Q1076478"
  },
  {
    baseId: 6,
    name: "Sigrún",
    gender: "female",
    category: "mythology",
    qid: "Q3041936"
  },
  {
    baseId: 6,
    name: "Sigurd",
    gender: "male",
    category: "mythology",
    qid: "Q537554"
  },
  {
    baseId: 6,
    name: "Sigyn",
    gender: "female",
    category: "mythology",
    qid: "Q734508"
  },
  {
    baseId: 6,
    name: "Sindri",
    gender: "male",
    category: "mythology",
    qid: "Q1468430"
  },
  {
    baseId: 6,
    name: "Sinfjötli",
    gender: "male",
    category: "mythology",
    qid: "Q513564"
  },
  {
    baseId: 6,
    name: "Sister-wife of Njörðr",
    gender: "female",
    category: "mythology",
    qid: "Q18211476"
  },
  {
    baseId: 6,
    name: "Skaði",
    gender: "female",
    category: "mythology",
    qid: "Q244032"
  },
  {
    baseId: 6,
    name: "Skjöldr",
    gender: "male",
    category: "mythology",
    qid: "Q1771470"
  },
  {
    baseId: 6,
    name: "Skuld",
    gender: "female",
    category: "mythology",
    qid: "Q500473"
  },
  {
    baseId: 6,
    name: "Skírnir",
    gender: "male",
    category: "mythology",
    qid: "Q264522"
  },
  {
    baseId: 6,
    name: "Skögul",
    gender: "female",
    category: "mythology",
    qid: "Q6319136"
  },
  {
    baseId: 6,
    name: "Slidr",
    gender: "unknown",
    category: "mythology",
    qid: "Q1851773"
  },
  {
    baseId: 6,
    name: "Sons of Odin",
    gender: "unknown",
    category: "mythology",
    qid: "Q7562334"
  },
  {
    baseId: 6,
    name: "Starkad",
    gender: "male",
    category: "mythology",
    qid: "Q957042"
  },
  {
    baseId: 6,
    name: "Surtr",
    gender: "male",
    category: "mythology",
    qid: "Q211700"
  },
  {
    baseId: 6,
    name: "Svafrlami",
    gender: "male",
    category: "mythology",
    qid: "Q1817116"
  },
  {
    baseId: 6,
    name: "Svanhildr",
    gender: "female",
    category: "mythology",
    qid: "Q1758567"
  },
  {
    baseId: 6,
    name: "Svipdagr",
    gender: "male",
    category: "mythology",
    qid: "Q764214"
  },
  {
    baseId: 6,
    name: "Svipul",
    gender: "unknown",
    category: "mythology",
    qid: "Q7652719"
  },
  {
    baseId: 6,
    name: "Sváfa",
    gender: "female",
    category: "mythology",
    qid: "Q1085116"
  },
  {
    baseId: 6,
    name: "Sága",
    gender: "female",
    category: "mythology",
    qid: "Q1263128"
  },
  {
    baseId: 6,
    name: "Sága and Sökkvabekkr",
    gender: "unknown",
    category: "mythology",
    qid: "Q1799815"
  },
  {
    baseId: 6,
    name: "Sökkvabekkr",
    gender: "unknown",
    category: "mythology",
    qid: "Q16513498"
  },
  {
    baseId: 6,
    name: "Thor",
    gender: "male",
    category: "mythology",
    qid: "Q42952"
  },
  {
    baseId: 6,
    name: "Trebeta",
    gender: "male",
    category: "mythology",
    qid: "Q572358"
  },
  {
    baseId: 6,
    name: "Tyr",
    gender: "male",
    category: "mythology",
    qid: "Q172713"
  },
  {
    baseId: 6,
    name: "Urðarbrunnr",
    gender: "unknown",
    category: "mythology",
    qid: "Q1458366"
  },
  {
    baseId: 6,
    name: "Urðr",
    gender: "female",
    category: "mythology",
    qid: "Q946913"
  },
  {
    baseId: 6,
    name: "Veraldur",
    gender: "male",
    category: "mythology",
    qid: "Q61000566"
  },
  {
    baseId: 6,
    name: "Verðandi",
    gender: "female",
    category: "mythology",
    qid: "Q917725"
  },
  {
    baseId: 6,
    name: "Viðfinnr",
    gender: "male",
    category: "mythology",
    qid: "Q1621291"
  },
  {
    baseId: 6,
    name: "Váli",
    gender: "male",
    category: "mythology",
    qid: "Q2646624"
  },
  {
    baseId: 6,
    name: "Víðarr",
    gender: "male",
    category: "mythology",
    qid: "Q372614"
  },
  {
    baseId: 6,
    name: "Völsung",
    gender: "male",
    category: "mythology",
    qid: "Q1263694"
  },
  {
    baseId: 6,
    name: "Völsungs",
    gender: "unknown",
    category: "mythology",
    qid: "Q1242790"
  },
  {
    baseId: 6,
    name: "Yule Lads",
    gender: "unknown",
    category: "mythology",
    qid: "Q1715040"
  },
  {
    baseId: 6,
    name: "Árvakr",
    gender: "unknown",
    category: "mythology",
    qid: "Q12344299"
  },
  {
    baseId: 6,
    name: "Ægir",
    gender: "male",
    category: "mythology",
    qid: "Q204927"
  },
  {
    baseId: 6,
    name: "Élivágar",
    gender: "unknown",
    category: "mythology",
    qid: "Q274754"
  },
  {
    baseId: 6,
    name: "Ótr",
    gender: "male",
    category: "mythology",
    qid: "Q1967084"
  },
  {
    baseId: 6,
    name: "Óttar",
    gender: "male",
    category: "mythology",
    qid: "Q2449577"
  },
  {
    baseId: 6,
    name: "Öku-Thor",
    gender: "unknown",
    category: "mythology",
    qid: "Q296494"
  },
  {
    baseId: 6,
    name: "Ölrún",
    gender: "female",
    category: "mythology",
    qid: "Q80190608"
  },
  {
    baseId: 6,
    name: "Örvar-Oddr",
    gender: "male",
    category: "mythology",
    qid: "Q2275382"
  },
  {
    baseId: 6,
    name: "Þorbjörg Lítilvölva",
    gender: "female",
    category: "mythology",
    qid: "Q335816"
  },
  {
    baseId: 6,
    name: "Þorgerðr Hölgabrúðr",
    gender: "female",
    category: "mythology",
    qid: "Q16513995"
  },
  {
    baseId: 6,
    name: "Þrymr",
    gender: "male",
    category: "mythology",
    qid: "Q1123905"
  },
  {
    baseId: 6,
    name: "Þrúðr",
    gender: "female",
    category: "mythology",
    qid: "Q827758"
  },
  {
    baseId: 7,
    name: "Aba",
    gender: "female",
    category: "mythology",
    qid: "Q304227"
  },
  {
    baseId: 7,
    name: "Abantidas",
    gender: "male",
    category: "ancient_person",
    qid: "Q305524"
  },
  {
    baseId: 7,
    name: "Abarbarea",
    gender: "female",
    category: "mythology",
    qid: "Q279782"
  },
  {
    baseId: 7,
    name: "Aeantides of Lampsacus",
    gender: "male",
    category: "ancient_person",
    qid: "Q403403"
  },
  {
    baseId: 7,
    name: "Aegle",
    gender: "female",
    category: "mythology",
    qid: "Q26276980"
  },
  {
    baseId: 7,
    name: "Aelianus Tacticus",
    gender: "male",
    category: "ancient_person",
    qid: "Q380793"
  },
  {
    baseId: 7,
    name: "Agathon",
    gender: "male",
    category: "ancient_person",
    qid: "Q391497"
  },
  {
    baseId: 7,
    name: "Aglais",
    gender: "female",
    category: "ancient_person",
    qid: "Q83759154"
  },
  {
    baseId: 7,
    name: "Aineades",
    gender: "male",
    category: "ancient_person",
    qid: "Q405957"
  },
  {
    baseId: 7,
    name: "Aison",
    gender: "male",
    category: "ancient_person",
    qid: "Q327857"
  },
  {
    baseId: 7,
    name: "Amalthea",
    gender: "female",
    category: "mythology",
    qid: "Q107785"
  },
  {
    baseId: 7,
    name: "Amphitrite",
    gender: "female",
    category: "mythology",
    qid: "Q180222"
  },
  {
    baseId: 7,
    name: "Anchiroe",
    gender: "female",
    category: "mythology",
    qid: "Q29654988"
  },
  {
    baseId: 7,
    name: "Anchius",
    gender: "male",
    category: "mythology",
    qid: "Q15783253"
  },
  {
    baseId: 7,
    name: "Ancius",
    gender: "unknown",
    category: "mythology",
    qid: "Q3615218"
  },
  {
    baseId: 7,
    name: "Andes",
    gender: "male",
    category: "mythology",
    qid: "Q21548629"
  },
  {
    baseId: 7,
    name: "Anippe",
    gender: "female",
    category: "mythology",
    qid: "Q10411954"
  },
  {
    baseId: 7,
    name: "Anthédon",
    gender: "female",
    category: "mythology",
    qid: "Q21548693"
  },
  {
    baseId: 7,
    name: "Antimachus",
    gender: "male",
    category: "mythology",
    qid: "Q21548750"
  },
  {
    baseId: 7,
    name: "Aphareus",
    gender: "male",
    category: "mythology",
    qid: "Q26806435"
  },
  {
    baseId: 7,
    name: "Apollodorus of Acharnae",
    gender: "male",
    category: "ancient_person",
    qid: "Q328853"
  },
  {
    baseId: 7,
    name: "Areius",
    gender: "male",
    category: "mythology",
    qid: "Q55484966"
  },
  {
    baseId: 7,
    name: "Argeia",
    gender: "female",
    category: "mythology",
    qid: "Q644354"
  },
  {
    baseId: 7,
    name: "Argeus",
    gender: "male",
    category: "mythology",
    qid: "Q15783910"
  },
  {
    baseId: 7,
    name: "Argyra",
    gender: "female",
    category: "mythology",
    qid: "Q3560453"
  },
  {
    baseId: 7,
    name: "Aristophanes",
    gender: "male",
    category: "ancient_person",
    qid: "Q667194"
  },
  {
    baseId: 7,
    name: "Aristotle",
    gender: "male",
    category: "ancient_person",
    qid: "Q868"
  },
  {
    baseId: 7,
    name: "Asia",
    gender: "female",
    category: "mythology",
    qid: "Q605744"
  },
  {
    baseId: 7,
    name: "Asteas",
    gender: "male",
    category: "ancient_person",
    qid: "Q328002"
  },
  {
    baseId: 7,
    name: "Asteria",
    gender: "female",
    category: "mythology",
    qid: "Q18642285"
  },
  {
    baseId: 7,
    name: "Astraeus",
    gender: "male",
    category: "mythology",
    qid: "Q250588"
  },
  {
    baseId: 7,
    name: "Athenaeus",
    gender: "male",
    category: "ancient_person",
    qid: "Q294923"
  },
  {
    baseId: 7,
    name: "Atlas",
    gender: "male",
    category: "mythology",
    qid: "Q130818"
  },
  {
    baseId: 7,
    name: "Batea",
    gender: "female",
    category: "mythology",
    qid: "Q810744"
  },
  {
    baseId: 7,
    name: "Bolbe",
    gender: "female",
    category: "mythology",
    qid: "Q4810860"
  },
  {
    baseId: 7,
    name: "Briareus",
    gender: "male",
    category: "mythology",
    qid: "Q849647"
  },
  {
    baseId: 7,
    name: "Caliadne",
    gender: "female",
    category: "mythology",
    qid: "Q2559167"
  },
  {
    baseId: 7,
    name: "Callirhoe",
    gender: "female",
    category: "mythology",
    qid: "Q1722503"
  },
  {
    baseId: 7,
    name: "Calypso",
    gender: "female",
    category: "mythology",
    qid: "Q48961"
  },
  {
    baseId: 7,
    name: "Cassotis",
    gender: "female",
    category: "mythology",
    qid: "Q1735272"
  },
  {
    baseId: 7,
    name: "Castalia",
    gender: "female",
    category: "mythology",
    qid: "Q170053"
  },
  {
    baseId: 7,
    name: "Celusa",
    gender: "female",
    category: "mythology",
    qid: "Q57157139"
  },
  {
    baseId: 7,
    name: "Chares",
    gender: "male",
    category: "ancient_person",
    qid: "Q1063128"
  },
  {
    baseId: 7,
    name: "Charitaios",
    gender: "male",
    category: "ancient_person",
    qid: "Q1063233"
  },
  {
    baseId: 7,
    name: "Chlidanope",
    gender: "female",
    category: "mythology",
    qid: "Q18643251"
  },
  {
    baseId: 7,
    name: "Cisseis",
    gender: "female",
    category: "mythology",
    qid: "Q57521633"
  },
  {
    baseId: 7,
    name: "Clanis",
    gender: "male",
    category: "mythology",
    qid: "Q57664165"
  },
  {
    baseId: 7,
    name: "Cleocharia",
    gender: "female",
    category: "mythology",
    qid: "Q2980753"
  },
  {
    baseId: 7,
    name: "Cleone",
    gender: "female",
    category: "mythology",
    qid: "Q2754601"
  },
  {
    baseId: 7,
    name: "Cnossia",
    gender: "female",
    category: "mythology",
    qid: "Q10546716"
  },
  {
    baseId: 7,
    name: "Coeus",
    gender: "male",
    category: "mythology",
    qid: "Q182837"
  },
  {
    baseId: 7,
    name: "Cottus",
    gender: "male",
    category: "mythology",
    qid: "Q3318918"
  },
  {
    baseId: 7,
    name: "Crenaeus",
    gender: "male",
    category: "mythology",
    qid: "Q124316484"
  },
  {
    baseId: 7,
    name: "Creusa",
    gender: "female",
    category: "mythology",
    qid: "Q1232622"
  },
  {
    baseId: 7,
    name: "Crocale",
    gender: "female",
    category: "mythology",
    qid: "Q122067349"
  },
  {
    baseId: 7,
    name: "Cronus",
    gender: "male",
    category: "mythology",
    qid: "Q44204"
  },
  {
    baseId: 7,
    name: "Cyane",
    gender: "female",
    category: "mythology",
    qid: "Q1423058"
  },
  {
    baseId: 7,
    name: "Cyllarus",
    gender: "male",
    category: "mythology",
    qid: "Q3676711"
  },
  {
    baseId: 7,
    name: "Cyllene",
    gender: "female",
    category: "mythology",
    qid: "Q7595427"
  },
  {
    baseId: 7,
    name: "Daphne",
    gender: "female",
    category: "mythology",
    qid: "Q194015"
  },
  {
    baseId: 7,
    name: "Daphnis",
    gender: "male",
    category: "mythology",
    qid: "Q122227110"
  },
  {
    baseId: 7,
    name: "Daulis",
    gender: "female",
    category: "mythology",
    qid: "Q17461398"
  },
  {
    baseId: 7,
    name: "Deiniades",
    gender: "male",
    category: "ancient_person",
    qid: "Q1183292"
  },
  {
    baseId: 7,
    name: "Demoleon",
    gender: "male",
    category: "mythology",
    qid: "Q59772137"
  },
  {
    baseId: 7,
    name: "Demosthenes",
    gender: "male",
    category: "ancient_person",
    qid: "Q117253"
  },
  {
    baseId: 7,
    name: "Dionysicles of Miletus",
    gender: "male",
    category: "ancient_person",
    qid: "Q1226971"
  },
  {
    baseId: 7,
    name: "Dipylon Master",
    gender: "male",
    category: "ancient_person",
    qid: "Q943544"
  },
  {
    baseId: 7,
    name: "Drosera",
    gender: "female",
    category: "mythology",
    qid: "Q5308511"
  },
  {
    baseId: 7,
    name: "Elatus",
    gender: "male",
    category: "mythology",
    qid: "Q60300036"
  },
  {
    baseId: 7,
    name: "Elbows Out",
    gender: "unknown",
    category: "ancient_person",
    qid: "Q1325382"
  },
  {
    baseId: 7,
    name: "Elymus",
    gender: "male",
    category: "mythology",
    qid: "Q65054738"
  },
  {
    baseId: 7,
    name: "Epainetos",
    gender: "male",
    category: "ancient_person",
    qid: "Q1029554"
  },
  {
    baseId: 7,
    name: "Ephydatia",
    gender: "female",
    category: "mythology",
    qid: "Q5820239"
  },
  {
    baseId: 7,
    name: "Epicharmus of Kos",
    gender: "male",
    category: "ancient_person",
    qid: "Q312410"
  },
  {
    baseId: 7,
    name: "Epiktetos",
    gender: "male",
    category: "ancient_person",
    qid: "Q938972"
  },
  {
    baseId: 7,
    name: "Euboea",
    gender: "female",
    category: "mythology",
    qid: "Q1372109"
  },
  {
    baseId: 7,
    name: "Eucheiros",
    gender: "male",
    category: "ancient_person",
    qid: "Q974212"
  },
  {
    baseId: 7,
    name: "Euphronios",
    gender: "male",
    category: "ancient_person",
    qid: "Q358508"
  },
  {
    baseId: 7,
    name: "Eurryroe",
    gender: "female",
    category: "mythology",
    qid: "Q106795677"
  },
  {
    baseId: 7,
    name: "Eurynome",
    gender: "female",
    category: "mythology",
    qid: "Q548099"
  },
  {
    baseId: 7,
    name: "Eurynomus",
    gender: "male",
    category: "mythology",
    qid: "Q61046327"
  },
  {
    baseId: 7,
    name: "Eurytion",
    gender: "male",
    category: "mythology",
    qid: "Q124357578"
  },
  {
    baseId: 7,
    name: "Euthymides",
    gender: "male",
    category: "ancient_person",
    qid: "Q560260"
  },
  {
    baseId: 7,
    name: "Evadne",
    gender: "female",
    category: "mythology",
    qid: "Q1259960"
  },
  {
    baseId: 7,
    name: "Glaucia",
    gender: "female",
    category: "mythology",
    qid: "Q5567263"
  },
  {
    baseId: 7,
    name: "Glaukia",
    gender: "female",
    category: "mythology",
    qid: "Q126890351"
  },
  {
    baseId: 7,
    name: "Gyges",
    gender: "male",
    category: "mythology",
    qid: "Q1187298"
  },
  {
    baseId: 7,
    name: "Helops",
    gender: "unknown",
    category: "mythology",
    qid: "Q125968721"
  },
  {
    baseId: 7,
    name: "Hermonax",
    gender: "male",
    category: "ancient_person",
    qid: "Q328215"
  },
  {
    baseId: 7,
    name: "Hesione",
    gender: "female",
    category: "mythology",
    qid: "Q669635"
  },
  {
    baseId: 7,
    name: "Hylaeus",
    gender: "male",
    category: "mythology",
    qid: "Q124559102"
  },
  {
    baseId: 7,
    name: "Hyles",
    gender: "male",
    category: "mythology",
    qid: "Q124422562"
  },
  {
    baseId: 7,
    name: "Hylonome",
    gender: "female",
    category: "mythology",
    qid: "Q391070"
  },
  {
    baseId: 7,
    name: "Inachides",
    gender: "unknown",
    category: "mythology",
    qid: "Q126898460"
  },
  {
    baseId: 7,
    name: "Iphinous",
    gender: "male",
    category: "mythology",
    qid: "Q126087412"
  },
  {
    baseId: 7,
    name: "Ismenis",
    gender: "female",
    category: "mythology",
    qid: "Q6085037"
  },
  {
    baseId: 7,
    name: "Kalligeneia",
    gender: "female",
    category: "mythology",
    qid: "Q126911214"
  },
  {
    baseId: 7,
    name: "Kalliroe",
    gender: "female",
    category: "mythology",
    qid: "Q126911246"
  },
  {
    baseId: 7,
    name: "Kealtes",
    gender: "male",
    category: "ancient_person",
    qid: "Q1303181"
  },
  {
    baseId: 7,
    name: "Kleitias",
    gender: "male",
    category: "ancient_person",
    qid: "Q722963"
  },
  {
    baseId: 7,
    name: "Kretheis",
    gender: "female",
    category: "mythology",
    qid: "Q126709504"
  },
  {
    baseId: 7,
    name: "Langia",
    gender: "female",
    category: "mythology",
    qid: "Q12754452"
  },
  {
    baseId: 7,
    name: "Latreus",
    gender: "male",
    category: "mythology",
    qid: "Q107552580"
  },
  {
    baseId: 7,
    name: "Lelantos",
    gender: "male",
    category: "mythology",
    qid: "Q3270327"
  },
  {
    baseId: 7,
    name: "Lilaea",
    gender: "female",
    category: "mythology",
    qid: "Q460094"
  },
  {
    baseId: 7,
    name: "Limnaee",
    gender: "female",
    category: "mythology",
    qid: "Q1825523"
  },
  {
    baseId: 7,
    name: "Liriope",
    gender: "female",
    category: "mythology",
    qid: "Q1815682"
  },
  {
    baseId: 7,
    name: "Lotis",
    gender: "female",
    category: "mythology",
    qid: "Q2465677"
  },
  {
    baseId: 7,
    name: "Lycabas",
    gender: "male",
    category: "mythology",
    qid: "Q124821370"
  },
  {
    baseId: 7,
    name: "Lycotas",
    gender: "male",
    category: "mythology",
    qid: "Q124767454"
  },
  {
    baseId: 7,
    name: "Lycus",
    gender: "male",
    category: "mythology",
    qid: "Q124654213"
  },
  {
    baseId: 7,
    name: "Lydos",
    gender: "male",
    category: "ancient_person",
    qid: "Q946281"
  },
  {
    baseId: 7,
    name: "Lysis of Taras",
    gender: "male",
    category: "ancient_person",
    qid: "Q720939"
  },
  {
    baseId: 7,
    name: "Makron",
    gender: "male",
    category: "ancient_person",
    qid: "Q427706"
  },
  {
    baseId: 7,
    name: "Melite",
    gender: "female",
    category: "mythology",
    qid: "Q126833753"
  },
  {
    baseId: 7,
    name: "Merope",
    gender: "female",
    category: "mythology",
    qid: "Q427122"
  },
  {
    baseId: 7,
    name: "Messeis",
    gender: "female",
    category: "mythology",
    qid: "Q107313059"
  },
  {
    baseId: 7,
    name: "Metagenes",
    gender: "male",
    category: "ancient_person",
    qid: "Q1176269"
  },
  {
    baseId: 7,
    name: "Methone",
    gender: "female",
    category: "mythology",
    qid: "Q3855694"
  },
  {
    baseId: 7,
    name: "Metis",
    gender: "female",
    category: "mythology",
    qid: "Q190565"
  },
  {
    baseId: 7,
    name: "Metope",
    gender: "female",
    category: "mythology",
    qid: "Q1237258"
  },
  {
    baseId: 7,
    name: "Mimas",
    gender: "male",
    category: "mythology",
    qid: "Q125813526"
  },
  {
    baseId: 7,
    name: "Mis",
    gender: "male",
    category: "ancient_person",
    qid: "Q138447956"
  },
  {
    baseId: 7,
    name: "Mnemosyne",
    gender: "female",
    category: "mythology",
    qid: "Q102884"
  },
  {
    baseId: 7,
    name: "Mnesilochus",
    gender: "male",
    category: "ancient_person",
    qid: "Q1178108"
  },
  {
    baseId: 7,
    name: "Myrtoessa",
    gender: "female",
    category: "mythology",
    qid: "Q10592638"
  },
  {
    baseId: 7,
    name: "Neaira",
    gender: "female",
    category: "ancient_person",
    qid: "Q431067"
  },
  {
    baseId: 7,
    name: "Nearchos",
    gender: "male",
    category: "ancient_person",
    qid: "Q330410"
  },
  {
    baseId: 7,
    name: "Nemea",
    gender: "female",
    category: "mythology",
    qid: "Q1977078"
  },
  {
    baseId: 7,
    name: "Nemesis",
    gender: "female",
    category: "mythology",
    qid: "Q185747"
  },
  {
    baseId: 7,
    name: "Nessus",
    gender: "unknown",
    category: "mythology",
    qid: "Q466866"
  },
  {
    baseId: 7,
    name: "Nicocles",
    gender: "male",
    category: "ancient_person",
    qid: "Q715078"
  },
  {
    baseId: 7,
    name: "Nikosthenes",
    gender: "male",
    category: "ancient_person",
    qid: "Q275165"
  },
  {
    baseId: 7,
    name: "Oceanus",
    gender: "male",
    category: "mythology",
    qid: "Q161419"
  },
  {
    baseId: 7,
    name: "Oenone",
    gender: "female",
    category: "mythology",
    qid: "Q858671"
  },
  {
    baseId: 7,
    name: "Oikopheles",
    gender: "male",
    category: "ancient_person",
    qid: "Q1356545"
  },
  {
    baseId: 7,
    name: "Olymbros",
    gender: "unknown",
    category: "mythology",
    qid: "Q126552519"
  },
  {
    baseId: 7,
    name: "Onesimos",
    gender: "male",
    category: "ancient_person",
    qid: "Q475054"
  },
  {
    baseId: 7,
    name: "Orseis",
    gender: "female",
    category: "mythology",
    qid: "Q979627"
  },
  {
    baseId: 7,
    name: "Ostasos",
    gender: "unknown",
    category: "mythology",
    qid: "Q126552589"
  },
  {
    baseId: 7,
    name: "Pallas",
    gender: "male",
    category: "mythology",
    qid: "Q457294"
  },
  {
    baseId: 7,
    name: "Paria",
    gender: "female",
    category: "mythology",
    qid: "Q12757019"
  },
  {
    baseId: 7,
    name: "Pegasis",
    gender: "female",
    category: "mythology",
    qid: "Q10622216"
  },
  {
    baseId: 7,
    name: "Peitho",
    gender: "female",
    category: "mythology",
    qid: "Q611171"
  },
  {
    baseId: 7,
    name: "Periander",
    gender: "male",
    category: "ancient_person",
    qid: "Q11941122"
  },
  {
    baseId: 7,
    name: "Periboea",
    gender: "female",
    category: "mythology",
    qid: "Q17197552"
  },
  {
    baseId: 7,
    name: "Perses",
    gender: "male",
    category: "mythology",
    qid: "Q660924"
  },
  {
    baseId: 7,
    name: "Phaenias of Eresus",
    gender: "male",
    category: "ancient_person",
    qid: "Q943529"
  },
  {
    baseId: 7,
    name: "Pharmakeia",
    gender: "unknown",
    category: "mythology",
    qid: "Q126710308"
  },
  {
    baseId: 7,
    name: "Philyra",
    gender: "female",
    category: "mythology",
    qid: "Q398524"
  },
  {
    baseId: 7,
    name: "Phlegraeus",
    gender: "male",
    category: "mythology",
    qid: "Q126118957"
  },
  {
    baseId: 7,
    name: "Phocylides",
    gender: "male",
    category: "ancient_person",
    qid: "Q972799"
  },
  {
    baseId: 7,
    name: "Phoebe",
    gender: "female",
    category: "mythology",
    qid: "Q183281"
  },
  {
    baseId: 7,
    name: "Phoenissa",
    gender: "female",
    category: "mythology",
    qid: "Q106808293"
  },
  {
    baseId: 7,
    name: "Pirene",
    gender: "female",
    category: "mythology",
    qid: "Q4843985"
  },
  {
    baseId: 7,
    name: "Pitane",
    gender: "female",
    category: "mythology",
    qid: "Q25393568"
  },
  {
    baseId: 7,
    name: "Plataea",
    gender: "female",
    category: "mythology",
    qid: "Q6078094"
  },
  {
    baseId: 7,
    name: "Pleione",
    gender: "female",
    category: "mythology",
    qid: "Q463865"
  },
  {
    baseId: 7,
    name: "Plouto",
    gender: "female",
    category: "mythology",
    qid: "Q662968"
  },
  {
    baseId: 7,
    name: "Polkan",
    gender: "male",
    category: "mythology",
    qid: "Q1990860"
  },
  {
    baseId: 7,
    name: "Polyxo",
    gender: "female",
    category: "mythology",
    qid: "Q2103187"
  },
  {
    baseId: 7,
    name: "Praxithea",
    gender: "female",
    category: "mythology",
    qid: "Q13058657"
  },
  {
    baseId: 7,
    name: "Pronoe",
    gender: "female",
    category: "mythology",
    qid: "Q2112864"
  },
  {
    baseId: 7,
    name: "Pylenor",
    gender: "male",
    category: "mythology",
    qid: "Q16327570"
  },
  {
    baseId: 7,
    name: "Pyracmus",
    gender: "male",
    category: "mythology",
    qid: "Q125274680"
  },
  {
    baseId: 7,
    name: "Rhodos",
    gender: "female",
    category: "mythology",
    qid: "Q641286"
  },
  {
    baseId: 7,
    name: "Rhoecus",
    gender: "male",
    category: "mythology",
    qid: "Q12758406"
  },
  {
    baseId: 7,
    name: "Rhoetus",
    gender: "male",
    category: "mythology",
    qid: "Q124962285"
  },
  {
    baseId: 7,
    name: "Sakonides",
    gender: "male",
    category: "ancient_person",
    qid: "Q1331545"
  },
  {
    baseId: 7,
    name: "Salmacis",
    gender: "female",
    category: "mythology",
    qid: "Q828579"
  },
  {
    baseId: 7,
    name: "Samia",
    gender: "female",
    category: "mythology",
    qid: "Q12884308"
  },
  {
    baseId: 7,
    name: "Sinope",
    gender: "female",
    category: "mythology",
    qid: "Q1539539"
  },
  {
    baseId: 7,
    name: "Skythes",
    gender: "male",
    category: "ancient_person",
    qid: "Q1297344"
  },
  {
    baseId: 7,
    name: "Smikros",
    gender: "male",
    category: "ancient_person",
    qid: "Q510558"
  },
  {
    baseId: 7,
    name: "Stilbe",
    gender: "unknown",
    category: "mythology",
    qid: "Q1576404"
  },
  {
    baseId: 7,
    name: "Stilbon",
    gender: "male",
    category: "mythology",
    qid: "Q7616947"
  },
  {
    baseId: 7,
    name: "Strophia",
    gender: "female",
    category: "mythology",
    qid: "Q3661549"
  },
  {
    baseId: 7,
    name: "Styphelus",
    gender: "male",
    category: "mythology",
    qid: "Q125377972"
  },
  {
    baseId: 7,
    name: "Styx",
    gender: "female",
    category: "mythology",
    qid: "Q542758"
  },
  {
    baseId: 7,
    name: "Symaithis",
    gender: "female",
    category: "mythology",
    qid: "Q28224106"
  },
  {
    baseId: 7,
    name: "Theodorus",
    gender: "male",
    category: "ancient_person",
    qid: "Q139020003"
  },
  {
    baseId: 7,
    name: "Thronia",
    gender: "female",
    category: "mythology",
    qid: "Q135921774"
  },
  {
    baseId: 7,
    name: "Thyia",
    gender: "female",
    category: "mythology",
    qid: "Q949266"
  },
  {
    baseId: 7,
    name: "Tiasa",
    gender: "female",
    category: "mythology",
    qid: "Q7800294"
  },
  {
    baseId: 7,
    name: "Tyche",
    gender: "female",
    category: "mythology",
    qid: "Q213440"
  },
  {
    baseId: 7,
    name: "Zeuxo",
    gender: "female",
    category: "mythology",
    qid: "Q197039"
  },
  {
    baseId: 7,
    name: "mother of Aetolus",
    gender: "female",
    category: "mythology",
    qid: "Q122964728"
  },
  {
    baseId: 8,
    name: "Abaris",
    gender: "male",
    category: "mythology",
    qid: "Q305570"
  },
  {
    baseId: 8,
    name: "Abellio",
    gender: "male",
    category: "mythology",
    qid: "Q318682"
  },
  {
    baseId: 8,
    name: "Acmon",
    gender: "male",
    category: "mythology",
    qid: "Q420261"
  },
  {
    baseId: 8,
    name: "Acron",
    gender: "male",
    category: "mythology",
    qid: "Q16160516"
  },
  {
    baseId: 8,
    name: "Aeternitas",
    gender: "female",
    category: "mythology",
    qid: "Q381914"
  },
  {
    baseId: 8,
    name: "Agdistis",
    gender: "unknown",
    category: "mythology",
    qid: "Q392120"
  },
  {
    baseId: 8,
    name: "Aius Locutius",
    gender: "male",
    category: "mythology",
    qid: "Q411066"
  },
  {
    baseId: 8,
    name: "Ambrose",
    gender: "male",
    category: "ancient_person",
    qid: "Q43689"
  },
  {
    baseId: 8,
    name: "Amulius",
    gender: "male",
    category: "mythology",
    qid: "Q889656"
  },
  {
    baseId: 8,
    name: "Ancaria",
    gender: "female",
    category: "mythology",
    qid: "Q3615151"
  },
  {
    baseId: 8,
    name: "Anextiomarus",
    gender: "male",
    category: "mythology",
    qid: "Q529652"
  },
  {
    baseId: 8,
    name: "Anna",
    gender: "female",
    category: "mythology",
    qid: "Q559304"
  },
  {
    baseId: 8,
    name: "Anna Perenna",
    gender: "female",
    category: "mythology",
    qid: "Q539796"
  },
  {
    baseId: 8,
    name: "Annona",
    gender: "female",
    category: "mythology",
    qid: "Q581656"
  },
  {
    baseId: 8,
    name: "Antevorta",
    gender: "female",
    category: "mythology",
    qid: "Q1250207"
  },
  {
    baseId: 8,
    name: "Antoninus Pius",
    gender: "male",
    category: "ancient_person",
    qid: "Q1429"
  },
  {
    baseId: 8,
    name: "Anxur",
    gender: "male",
    category: "mythology",
    qid: "Q26690196"
  },
  {
    baseId: 8,
    name: "Apollo",
    gender: "male",
    category: "mythology",
    qid: "Q900649"
  },
  {
    baseId: 8,
    name: "Apotropaei",
    gender: "unknown",
    category: "mythology",
    qid: "Q25338401"
  },
  {
    baseId: 8,
    name: "Appias",
    gender: "unknown",
    category: "mythology",
    qid: "Q56036020"
  },
  {
    baseId: 8,
    name: "Aquilon",
    gender: "male",
    category: "mythology",
    qid: "Q2859290"
  },
  {
    baseId: 8,
    name: "Arrian",
    gender: "male",
    category: "ancient_person",
    qid: "Q31845"
  },
  {
    baseId: 8,
    name: "Ascanius",
    gender: "male",
    category: "mythology",
    qid: "Q655566"
  },
  {
    baseId: 8,
    name: "Athanasius of Alexandria",
    gender: "male",
    category: "ancient_person",
    qid: "Q44024"
  },
  {
    baseId: 8,
    name: "Augustine of Hippo",
    gender: "male",
    category: "ancient_person",
    qid: "Q8018"
  },
  {
    baseId: 8,
    name: "Augustus",
    gender: "male",
    category: "ancient_person",
    qid: "Q1405"
  },
  {
    baseId: 8,
    name: "Aulus Terentius Varro",
    gender: "male",
    category: "ancient_person",
    qid: "Q141723"
  },
  {
    baseId: 8,
    name: "Auster",
    gender: "male",
    category: "mythology",
    qid: "Q611138"
  },
  {
    baseId: 8,
    name: "Aëtius of Antioch",
    gender: "male",
    category: "ancient_person",
    qid: "Q16442"
  },
  {
    baseId: 8,
    name: "Balbinus",
    gender: "male",
    category: "ancient_person",
    qid: "Q1805"
  },
  {
    baseId: 8,
    name: "Bellona",
    gender: "female",
    category: "mythology",
    qid: "Q207234"
  },
  {
    baseId: 8,
    name: "Bona Dea",
    gender: "female",
    category: "mythology",
    qid: "Q724896"
  },
  {
    baseId: 8,
    name: "Caca",
    gender: "female",
    category: "mythology",
    qid: "Q1024984"
  },
  {
    baseId: 8,
    name: "Cacus",
    gender: "male",
    category: "mythology",
    qid: "Q754686"
  },
  {
    baseId: 8,
    name: "Caligula",
    gender: "male",
    category: "ancient_person",
    qid: "Q1409"
  },
  {
    baseId: 8,
    name: "Capricornus",
    gender: "unknown",
    category: "mythology",
    qid: "Q11294655"
  },
  {
    baseId: 8,
    name: "Capys",
    gender: "male",
    category: "mythology",
    qid: "Q20018046"
  },
  {
    baseId: 8,
    name: "Caracalla",
    gender: "male",
    category: "ancient_person",
    qid: "Q1446"
  },
  {
    baseId: 8,
    name: "Caritas",
    gender: "female",
    category: "mythology",
    qid: "Q128715023"
  },
  {
    baseId: 8,
    name: "Catiline",
    gender: "male",
    category: "ancient_person",
    qid: "Q75826"
  },
  {
    baseId: 8,
    name: "Cicero",
    gender: "male",
    category: "ancient_person",
    qid: "Q1541"
  },
  {
    baseId: 8,
    name: "Cissonius",
    gender: "male",
    category: "mythology",
    qid: "Q1093253"
  },
  {
    baseId: 8,
    name: "Claudius",
    gender: "male",
    category: "ancient_person",
    qid: "Q1411"
  },
  {
    baseId: 8,
    name: "Clement I",
    gender: "male",
    category: "ancient_person",
    qid: "Q42887"
  },
  {
    baseId: 8,
    name: "Cloacina",
    gender: "female",
    category: "mythology",
    qid: "Q2879107"
  },
  {
    baseId: 8,
    name: "Commodus",
    gender: "male",
    category: "ancient_person",
    qid: "Q1434"
  },
  {
    baseId: 8,
    name: "Constantine the Great",
    gender: "male",
    category: "ancient_person",
    qid: "Q8413"
  },
  {
    baseId: 8,
    name: "Cornelius Nepos",
    gender: "male",
    category: "ancient_person",
    qid: "Q109594"
  },
  {
    baseId: 8,
    name: "Cybele",
    gender: "female",
    category: "mythology",
    qid: "Q188236"
  },
  {
    baseId: 8,
    name: "Cyril of Alexandria",
    gender: "male",
    category: "ancient_person",
    qid: "Q44079"
  },
  {
    baseId: 8,
    name: "Decius",
    gender: "male",
    category: "ancient_person",
    qid: "Q1830"
  },
  {
    baseId: 8,
    name: "Deiopea",
    gender: "female",
    category: "mythology",
    qid: "Q3704814"
  },
  {
    baseId: 8,
    name: "Deverra",
    gender: "female",
    category: "mythology",
    qid: "Q3025430"
  },
  {
    baseId: 8,
    name: "Didius Julianus",
    gender: "male",
    category: "ancient_person",
    qid: "Q1440"
  },
  {
    baseId: 8,
    name: "Dies",
    gender: "female",
    category: "mythology",
    qid: "Q18206465"
  },
  {
    baseId: 8,
    name: "Diocletian",
    gender: "male",
    category: "ancient_person",
    qid: "Q43107"
  },
  {
    baseId: 8,
    name: "Diogenes Laërtius",
    gender: "male",
    category: "ancient_person",
    qid: "Q59138"
  },
  {
    baseId: 8,
    name: "Disciplina",
    gender: "female",
    category: "mythology",
    qid: "Q3495260"
  },
  {
    baseId: 8,
    name: "Domitian",
    gender: "male",
    category: "ancient_person",
    qid: "Q1423"
  },
  {
    baseId: 8,
    name: "Domitius Marsus",
    gender: "male",
    category: "ancient_person",
    qid: "Q8809"
  },
  {
    baseId: 8,
    name: "Edusa",
    gender: "female",
    category: "mythology",
    qid: "Q3622563"
  },
  {
    baseId: 8,
    name: "Elagabalus",
    gender: "male",
    category: "ancient_person",
    qid: "Q1762"
  },
  {
    baseId: 8,
    name: "Engratia",
    gender: "female",
    category: "ancient_person",
    qid: "Q32313"
  },
  {
    baseId: 8,
    name: "Eusebius of Caesarea",
    gender: "male",
    category: "ancient_person",
    qid: "Q142999"
  },
  {
    baseId: 8,
    name: "Falacer",
    gender: "male",
    category: "mythology",
    qid: "Q3738525"
  },
  {
    baseId: 8,
    name: "Faustina",
    gender: "female",
    category: "ancient_person",
    qid: "Q63533"
  },
  {
    baseId: 8,
    name: "Flavius Victor",
    gender: "male",
    category: "ancient_person",
    qid: "Q18874"
  },
  {
    baseId: 8,
    name: "Flora",
    gender: "female",
    category: "mythology",
    qid: "Q209644"
  },
  {
    baseId: 8,
    name: "Forculus",
    gender: "male",
    category: "mythology",
    qid: "Q18548363"
  },
  {
    baseId: 8,
    name: "Gaius Cornelius Gallus",
    gender: "male",
    category: "ancient_person",
    qid: "Q8825"
  },
  {
    baseId: 8,
    name: "Gaius Julius Iullus",
    gender: "male",
    category: "ancient_person",
    qid: "Q138217"
  },
  {
    baseId: 8,
    name: "Gaius Maecenas",
    gender: "male",
    category: "ancient_person",
    qid: "Q8833"
  },
  {
    baseId: 8,
    name: "Gaius Maecenas Melissus",
    gender: "male",
    category: "ancient_person",
    qid: "Q8800"
  },
  {
    baseId: 8,
    name: "Gaius Mucius Scaevola",
    gender: "male",
    category: "mythology",
    qid: "Q312660"
  },
  {
    baseId: 8,
    name: "Gaius Valgius Rufus",
    gender: "male",
    category: "ancient_person",
    qid: "Q8817"
  },
  {
    baseId: 8,
    name: "Galba",
    gender: "male",
    category: "ancient_person",
    qid: "Q1414"
  },
  {
    baseId: 8,
    name: "Galen",
    gender: "male",
    category: "ancient_person",
    qid: "Q8778"
  },
  {
    baseId: 8,
    name: "Garamantis",
    gender: "female",
    category: "mythology",
    qid: "Q1493870"
  },
  {
    baseId: 8,
    name: "Gnaeus Domitius Calvinus",
    gender: "male",
    category: "ancient_person",
    qid: "Q63447"
  },
  {
    baseId: 8,
    name: "Gordian I",
    gender: "male",
    category: "ancient_person",
    qid: "Q1782"
  },
  {
    baseId: 8,
    name: "Gordian II",
    gender: "male",
    category: "ancient_person",
    qid: "Q1803"
  },
  {
    baseId: 8,
    name: "Gordian III",
    gender: "male",
    category: "ancient_person",
    qid: "Q1812"
  },
  {
    baseId: 8,
    name: "Gregory of Nazianzus",
    gender: "male",
    category: "ancient_person",
    qid: "Q44011"
  },
  {
    baseId: 8,
    name: "Hadrian",
    gender: "male",
    category: "ancient_person",
    qid: "Q1427"
  },
  {
    baseId: 8,
    name: "Hercules",
    gender: "male",
    category: "mythology",
    qid: "Q240679"
  },
  {
    baseId: 8,
    name: "Horace",
    gender: "male",
    category: "ancient_person",
    qid: "Q6197"
  },
  {
    baseId: 8,
    name: "Iapyx",
    gender: "male",
    category: "mythology",
    qid: "Q1180888"
  },
  {
    baseId: 8,
    name: "Ignatius of Antioch",
    gender: "male",
    category: "ancient_person",
    qid: "Q44170"
  },
  {
    baseId: 8,
    name: "Josephus",
    gender: "male",
    category: "ancient_person",
    qid: "Q134461"
  },
  {
    baseId: 8,
    name: "Jovian",
    gender: "male",
    category: "ancient_person",
    qid: "Q34074"
  },
  {
    baseId: 8,
    name: "Julia the Elder",
    gender: "female",
    category: "ancient_person",
    qid: "Q2259"
  },
  {
    baseId: 8,
    name: "Julian",
    gender: "male",
    category: "ancient_person",
    qid: "Q33941"
  },
  {
    baseId: 8,
    name: "Julius Caesar",
    gender: "male",
    category: "ancient_person",
    qid: "Q1048"
  },
  {
    baseId: 8,
    name: "Julius I",
    gender: "male",
    category: "ancient_person",
    qid: "Q103101"
  },
  {
    baseId: 8,
    name: "Julius Nepos",
    gender: "male",
    category: "ancient_person",
    qid: "Q103860"
  },
  {
    baseId: 8,
    name: "Junius Rusticus",
    gender: "male",
    category: "ancient_person",
    qid: "Q18999"
  },
  {
    baseId: 8,
    name: "Juturna",
    gender: "female",
    category: "mythology",
    qid: "Q139448"
  },
  {
    baseId: 8,
    name: "Latinus",
    gender: "male",
    category: "mythology",
    qid: "Q779406"
  },
  {
    baseId: 8,
    name: "Lavinia",
    gender: "female",
    category: "mythology",
    qid: "Q1137364"
  },
  {
    baseId: 8,
    name: "Lawrence of Rome",
    gender: "male",
    category: "ancient_person",
    qid: "Q17590"
  },
  {
    baseId: 8,
    name: "Leo I",
    gender: "male",
    category: "ancient_person",
    qid: "Q43954"
  },
  {
    baseId: 8,
    name: "Liber",
    gender: "male",
    category: "mythology",
    qid: "Q1145491"
  },
  {
    baseId: 8,
    name: "Libera",
    gender: "female",
    category: "mythology",
    qid: "Q2633166"
  },
  {
    baseId: 8,
    name: "Linus",
    gender: "male",
    category: "ancient_person",
    qid: "Q47144"
  },
  {
    baseId: 8,
    name: "Lucifer",
    gender: "male",
    category: "mythology",
    qid: "Q4270105"
  },
  {
    baseId: 8,
    name: "Lucius Domitius Ahenobarbus",
    gender: "male",
    category: "ancient_person",
    qid: "Q120122"
  },
  {
    baseId: 8,
    name: "Lucius Neratius Priscus",
    gender: "male",
    category: "ancient_person",
    qid: "Q63389"
  },
  {
    baseId: 8,
    name: "Lucius Tarutius Firmanus",
    gender: "male",
    category: "ancient_person",
    qid: "Q138724"
  },
  {
    baseId: 8,
    name: "Lucius Varius Rufus",
    gender: "male",
    category: "ancient_person",
    qid: "Q8820"
  },
  {
    baseId: 8,
    name: "Lucius Verus",
    gender: "male",
    category: "ancient_person",
    qid: "Q1433"
  },
  {
    baseId: 8,
    name: "Macarius of Egypt",
    gender: "male",
    category: "ancient_person",
    qid: "Q43920"
  },
  {
    baseId: 8,
    name: "Macrinus",
    gender: "male",
    category: "ancient_person",
    qid: "Q1752"
  },
  {
    baseId: 8,
    name: "Marcellus I",
    gender: "male",
    category: "ancient_person",
    qid: "Q102131"
  },
  {
    baseId: 8,
    name: "Marcus Aurelius",
    gender: "male",
    category: "ancient_person",
    qid: "Q1430"
  },
  {
    baseId: 8,
    name: "Marcus Fulvius Paetinus",
    gender: "male",
    category: "ancient_person",
    qid: "Q135279"
  },
  {
    baseId: 8,
    name: "Mark Antony",
    gender: "male",
    category: "ancient_person",
    qid: "Q51673"
  },
  {
    baseId: 8,
    name: "Mark the Evangelist",
    gender: "male",
    category: "ancient_person",
    qid: "Q31966"
  },
  {
    baseId: 8,
    name: "Martial",
    gender: "male",
    category: "ancient_person",
    qid: "Q2098"
  },
  {
    baseId: 8,
    name: "Maximinus Thrax",
    gender: "male",
    category: "ancient_person",
    qid: "Q1777"
  },
  {
    baseId: 8,
    name: "Mellona",
    gender: "female",
    category: "mythology",
    qid: "Q3142105"
  },
  {
    baseId: 8,
    name: "Mercury",
    gender: "male",
    category: "mythology",
    qid: "Q1150"
  },
  {
    baseId: 8,
    name: "Nero",
    gender: "male",
    category: "ancient_person",
    qid: "Q1413"
  },
  {
    baseId: 8,
    name: "Nerva",
    gender: "male",
    category: "ancient_person",
    qid: "Q1424"
  },
  {
    baseId: 8,
    name: "Numitor",
    gender: "male",
    category: "mythology",
    qid: "Q660623"
  },
  {
    baseId: 8,
    name: "Ocnus",
    gender: "male",
    category: "mythology",
    qid: "Q1929263"
  },
  {
    baseId: 8,
    name: "Otho",
    gender: "male",
    category: "ancient_person",
    qid: "Q1416"
  },
  {
    baseId: 8,
    name: "Ovid",
    gender: "male",
    category: "ancient_person",
    qid: "Q7198"
  },
  {
    baseId: 8,
    name: "Owl of Athena",
    gender: "unknown",
    category: "mythology",
    qid: "Q1196035"
  },
  {
    baseId: 8,
    name: "Pales",
    gender: "unknown",
    category: "mythology",
    qid: "Q654604"
  },
  {
    baseId: 8,
    name: "Paul the Apostle",
    gender: "male",
    category: "ancient_person",
    qid: "Q9200"
  },
  {
    baseId: 8,
    name: "Pavor",
    gender: "male",
    category: "mythology",
    qid: "Q12137419"
  },
  {
    baseId: 8,
    name: "Pax",
    gender: "female",
    category: "mythology",
    qid: "Q1132674"
  },
  {
    baseId: 8,
    name: "Pertinax",
    gender: "male",
    category: "ancient_person",
    qid: "Q1436"
  },
  {
    baseId: 8,
    name: "Philip the Arab",
    gender: "male",
    category: "ancient_person",
    qid: "Q1817"
  },
  {
    baseId: 8,
    name: "Philotis",
    gender: "female",
    category: "mythology",
    qid: "Q7186297"
  },
  {
    baseId: 8,
    name: "Phlegon of Tralles",
    gender: "male",
    category: "ancient_person",
    qid: "Q138531"
  },
  {
    baseId: 8,
    name: "Plautus",
    gender: "male",
    category: "ancient_person",
    qid: "Q47160"
  },
  {
    baseId: 8,
    name: "Pliny the Elder",
    gender: "male",
    category: "ancient_person",
    qid: "Q82778"
  },
  {
    baseId: 8,
    name: "Plotius Tucca",
    gender: "male",
    category: "ancient_person",
    qid: "Q6184"
  },
  {
    baseId: 8,
    name: "Plutarch",
    gender: "male",
    category: "ancient_person",
    qid: "Q41523"
  },
  {
    baseId: 8,
    name: "Pontius Pilatus",
    gender: "male",
    category: "ancient_person",
    qid: "Q17131"
  },
  {
    baseId: 8,
    name: "Procas",
    gender: "male",
    category: "mythology",
    qid: "Q887384"
  },
  {
    baseId: 8,
    name: "Propertius",
    gender: "male",
    category: "ancient_person",
    qid: "Q8827"
  },
  {
    baseId: 8,
    name: "Pseudo-Marius",
    gender: "male",
    category: "ancient_person",
    qid: "Q110659"
  },
  {
    baseId: 8,
    name: "Ptolemy",
    gender: "male",
    category: "ancient_person",
    qid: "Q34943"
  },
  {
    baseId: 8,
    name: "Pupienus",
    gender: "male",
    category: "ancient_person",
    qid: "Q1797"
  },
  {
    baseId: 8,
    name: "Quinctilius Varus",
    gender: "male",
    category: "ancient_person",
    qid: "Q8808"
  },
  {
    baseId: 8,
    name: "Quintus Curtius Rufus",
    gender: "male",
    category: "ancient_person",
    qid: "Q5959"
  },
  {
    baseId: 8,
    name: "Rediculus",
    gender: "unknown",
    category: "mythology",
    qid: "Q7305935"
  },
  {
    baseId: 8,
    name: "Remmius Palaemon",
    gender: "male",
    category: "ancient_person",
    qid: "Q24548"
  },
  {
    baseId: 8,
    name: "Remus",
    gender: "male",
    category: "mythology",
    qid: "Q1242632"
  },
  {
    baseId: 8,
    name: "Rhea Silvia",
    gender: "female",
    category: "mythology",
    qid: "Q219936"
  },
  {
    baseId: 8,
    name: "Robigus",
    gender: "unknown",
    category: "mythology",
    qid: "Q10752043"
  },
  {
    baseId: 8,
    name: "Roma",
    gender: "female",
    category: "mythology",
    qid: "Q953033"
  },
  {
    baseId: 8,
    name: "Romulus",
    gender: "male",
    category: "mythology",
    qid: "Q2186"
  },
  {
    baseId: 8,
    name: "Saint Afra",
    gender: "female",
    category: "ancient_person",
    qid: "Q114845"
  },
  {
    baseId: 8,
    name: "Saint Cecilia",
    gender: "female",
    category: "ancient_person",
    qid: "Q80513"
  },
  {
    baseId: 8,
    name: "Sallust",
    gender: "male",
    category: "ancient_person",
    qid: "Q7170"
  },
  {
    baseId: 8,
    name: "Scipio Aemilianus",
    gender: "male",
    category: "ancient_person",
    qid: "Q2307"
  },
  {
    baseId: 8,
    name: "Scipio Africanus",
    gender: "male",
    category: "ancient_person",
    qid: "Q2253"
  },
  {
    baseId: 8,
    name: "Seneca",
    gender: "male",
    category: "ancient_person",
    qid: "Q2054"
  },
  {
    baseId: 8,
    name: "Septimius Severus",
    gender: "male",
    category: "ancient_person",
    qid: "Q1442"
  },
  {
    baseId: 8,
    name: "Severus",
    gender: "male",
    category: "ancient_person",
    qid: "Q46814"
  },
  {
    baseId: 8,
    name: "Severus Alexander",
    gender: "male",
    category: "ancient_person",
    qid: "Q1769"
  },
  {
    baseId: 8,
    name: "Soter",
    gender: "male",
    category: "ancient_person",
    qid: "Q101280"
  },
  {
    baseId: 8,
    name: "Suadela",
    gender: "female",
    category: "mythology",
    qid: "Q1459682"
  },
  {
    baseId: 8,
    name: "Subruncinator",
    gender: "unknown",
    category: "mythology",
    qid: "Q3502626"
  },
  {
    baseId: 8,
    name: "Suetonius",
    gender: "male",
    category: "ancient_person",
    qid: "Q10133"
  },
  {
    baseId: 8,
    name: "Tacitus",
    gender: "male",
    category: "ancient_person",
    qid: "Q2161"
  },
  {
    baseId: 8,
    name: "Theodore of Amasea",
    gender: "male",
    category: "ancient_person",
    qid: "Q37599"
  },
  {
    baseId: 8,
    name: "Thomas the Apostle",
    gender: "male",
    category: "ancient_person",
    qid: "Q43669"
  },
  {
    baseId: 8,
    name: "Tiberinus",
    gender: "male",
    category: "mythology",
    qid: "Q937512"
  },
  {
    baseId: 8,
    name: "Tiberius",
    gender: "male",
    category: "ancient_person",
    qid: "Q1407"
  },
  {
    baseId: 8,
    name: "Tibullus",
    gender: "male",
    category: "ancient_person",
    qid: "Q109598"
  },
  {
    baseId: 8,
    name: "Tiburtus",
    gender: "male",
    category: "mythology",
    qid: "Q3528137"
  },
  {
    baseId: 8,
    name: "Titus",
    gender: "male",
    category: "ancient_person",
    qid: "Q1421"
  },
  {
    baseId: 8,
    name: "Titus Calidius Severus",
    gender: "male",
    category: "ancient_person",
    qid: "Q122437"
  },
  {
    baseId: 8,
    name: "Titus Livius",
    gender: "male",
    category: "ancient_person",
    qid: "Q2039"
  },
  {
    baseId: 8,
    name: "Tosco",
    gender: "unknown",
    category: "mythology",
    qid: "Q3995887"
  },
  {
    baseId: 8,
    name: "Trajan",
    gender: "male",
    category: "ancient_person",
    qid: "Q1425"
  },
  {
    baseId: 8,
    name: "Valeria Maximilla",
    gender: "female",
    category: "ancient_person",
    qid: "Q45535"
  },
  {
    baseId: 8,
    name: "Vegetius",
    gender: "male",
    category: "ancient_person",
    qid: "Q4298"
  },
  {
    baseId: 8,
    name: "Vertumnus",
    gender: "male",
    category: "mythology",
    qid: "Q374311"
  },
  {
    baseId: 8,
    name: "Vespasian",
    gender: "male",
    category: "ancient_person",
    qid: "Q1419"
  },
  {
    baseId: 8,
    name: "Virgil",
    gender: "male",
    category: "ancient_person",
    qid: "Q1398"
  },
  {
    baseId: 8,
    name: "Visidianus",
    gender: "male",
    category: "mythology",
    qid: "Q2528300"
  },
  {
    baseId: 8,
    name: "Vitellius",
    gender: "male",
    category: "ancient_person",
    qid: "Q1417"
  },
  {
    baseId: 8,
    name: "Voluptas",
    gender: "female",
    category: "mythology",
    qid: "Q651660"
  },
  {
    baseId: 11,
    name: "Chang'e",
    gender: "female",
    category: "mythology",
    qid: "Q466462"
  },
  {
    baseId: 11,
    name: "Fuxi",
    gender: "male",
    category: "mythology",
    qid: "Q236972"
  },
  {
    baseId: 11,
    name: "Jade Emperor",
    gender: "male",
    category: "mythology",
    qid: "Q860434"
  },
  {
    baseId: 11,
    name: "Nezha",
    gender: "male",
    category: "mythology",
    qid: "Q547105"
  },
  {
    baseId: 11,
    name: "Nüwa",
    gender: "female",
    category: "mythology",
    qid: "Q641632"
  },
  {
    baseId: 11,
    name: "Sun Wukong",
    gender: "male",
    category: "mythology",
    qid: "Q11773777"
  },
  {
    baseId: 11,
    name: "Yellow Emperor",
    gender: "male",
    category: "mythology",
    qid: "Q29201"
  },
  {
    baseId: 12,
    name: "Adakayanushitakikihime",
    gender: "female",
    category: "mythology",
    qid: "Q133260613"
  },
  {
    baseId: 12,
    name: "Ahashima",
    gender: "male",
    category: "mythology",
    qid: "Q13275856"
  },
  {
    baseId: 12,
    name: "Aizu-hime-no-Kami",
    gender: "unknown",
    category: "mythology",
    qid: "Q56350355"
  },
  {
    baseId: 12,
    name: "Amamikatsuhime no Mikoto",
    gender: "female",
    category: "mythology",
    qid: "Q106160485"
  },
  {
    baseId: 12,
    name: "Amanosakitama no Mikoto",
    gender: "male",
    category: "mythology",
    qid: "Q106241395"
  },
  {
    baseId: 12,
    name: "Ame no Hiratome",
    gender: "female",
    category: "mythology",
    qid: "Q85879124"
  },
  {
    baseId: 12,
    name: "Ame no Ikutama",
    gender: "male",
    category: "mythology",
    qid: "Q97184246"
  },
  {
    baseId: 12,
    name: "Ame no Mikemochi",
    gender: "male",
    category: "mythology",
    qid: "Q110064530"
  },
  {
    baseId: 12,
    name: "Ame no Mikudaru",
    gender: "male",
    category: "mythology",
    qid: "Q110120205"
  },
  {
    baseId: 12,
    name: "Ame no Tomi",
    gender: "male",
    category: "mythology",
    qid: "Q24899653"
  },
  {
    baseId: 12,
    name: "Ame-no-Hibaraooshinadomi-no-Kami",
    gender: "male",
    category: "mythology",
    qid: "Q60996386"
  },
  {
    baseId: 12,
    name: "Ame-no-Oshikumone",
    gender: "male",
    category: "mythology",
    qid: "Q91088537"
  },
  {
    baseId: 12,
    name: "Ame-no-Tsudoechine",
    gender: "female",
    category: "mythology",
    qid: "Q55533659"
  },
  {
    baseId: 12,
    name: "Ashinataka-no-Kami",
    gender: "unknown",
    category: "mythology",
    qid: "Q55533749"
  },
  {
    baseId: 12,
    name: "Ashinazuchi",
    gender: "male",
    category: "mythology",
    qid: "Q109554668"
  },
  {
    baseId: 12,
    name: "Atago Gongen",
    gender: "unknown",
    category: "mythology",
    qid: "Q1101132"
  },
  {
    baseId: 12,
    name: "Chikatō-no-Kami",
    gender: "unknown",
    category: "mythology",
    qid: "Q38276367"
  },
  {
    baseId: 12,
    name: "Chimata-no-Kami",
    gender: "unknown",
    category: "mythology",
    qid: "Q24887893"
  },
  {
    baseId: 12,
    name: "Chimyō Gongen",
    gender: "unknown",
    category: "mythology",
    qid: "Q11514781"
  },
  {
    baseId: 12,
    name: "Eighty Gods",
    gender: "male",
    category: "mythology",
    qid: "Q65249011"
  },
  {
    baseId: 12,
    name: "Fuha-no-Mojikunusunu",
    gender: "male",
    category: "mythology",
    qid: "Q65266248"
  },
  {
    baseId: 12,
    name: "Fukabuchi-no-Mizuyarehana",
    gender: "male",
    category: "mythology",
    qid: "Q65272471"
  },
  {
    baseId: 12,
    name: "Funozuno",
    gender: "male",
    category: "mythology",
    qid: "Q65266238"
  },
  {
    baseId: 12,
    name: "Furutama",
    gender: "male",
    category: "mythology",
    qid: "Q106241380"
  },
  {
    baseId: 12,
    name: "Futemimi",
    gender: "female",
    category: "mythology",
    qid: "Q65266228"
  },
  {
    baseId: 12,
    name: "Hachiōji Gongen",
    gender: "unknown",
    category: "mythology",
    qid: "Q11391615"
  },
  {
    baseId: 12,
    name: "Hakone Gongen",
    gender: "unknown",
    category: "mythology",
    qid: "Q11603375"
  },
  {
    baseId: 12,
    name: "Hakusan Gongen",
    gender: "unknown",
    category: "mythology",
    qid: "Q11579578"
  },
  {
    baseId: 12,
    name: "Hayaakitsuhiko",
    gender: "male",
    category: "mythology",
    qid: "Q116026335"
  },
  {
    baseId: 12,
    name: "Hayaakitsuhime",
    gender: "female",
    category: "mythology",
    qid: "Q116026336"
  },
  {
    baseId: 12,
    name: "Hikawa-hime",
    gender: "female",
    category: "mythology",
    qid: "Q65270244"
  },
  {
    baseId: 12,
    name: "Hikokamiwake-no-Mikoto",
    gender: "male",
    category: "mythology",
    qid: "Q70537095"
  },
  {
    baseId: 12,
    name: "Himegami",
    gender: "female",
    category: "mythology",
    qid: "Q22070227"
  },
  {
    baseId: 12,
    name: "Himuro Gongen",
    gender: "unknown",
    category: "mythology",
    qid: "Q134844607"
  },
  {
    baseId: 12,
    name: "Hinarashibime",
    gender: "female",
    category: "mythology",
    qid: "Q135330162"
  },
  {
    baseId: 12,
    name: "Honoakari",
    gender: "male",
    category: "mythology",
    qid: "Q60673696"
  },
  {
    baseId: 12,
    name: "Hyōzu no Kami",
    gender: "unknown",
    category: "mythology",
    qid: "Q135195558"
  },
  {
    baseId: 12,
    name: "Ibukidonushi no Kami",
    gender: "unknown",
    category: "mythology",
    qid: "Q86734190"
  },
  {
    baseId: 12,
    name: "Ihika",
    gender: "unknown",
    category: "mythology",
    qid: "Q24866003"
  },
  {
    baseId: 12,
    name: "Ikugui",
    gender: "unknown",
    category: "mythology",
    qid: "Q135011342"
  },
  {
    baseId: 12,
    name: "Ikutamatakitamahime Kami",
    gender: "unknown",
    category: "mythology",
    qid: "Q135330219"
  },
  {
    baseId: 12,
    name: "Isetsuhiko",
    gender: "male",
    category: "mythology",
    qid: "Q17193127"
  },
  {
    baseId: 12,
    name: "Isurugi Gongen",
    gender: "unknown",
    category: "mythology",
    qid: "Q11585202"
  },
  {
    baseId: 12,
    name: "Itsuhayahime-no-Mikoto",
    gender: "unknown",
    category: "mythology",
    qid: "Q48753263"
  },
  {
    baseId: 12,
    name: "Iwaoshiwaku no Ko",
    gender: "unknown",
    category: "mythology",
    qid: "Q24866029"
  },
  {
    baseId: 12,
    name: "Izuhayao-no-Mikoto",
    gender: "male",
    category: "mythology",
    qid: "Q48749523"
  },
  {
    baseId: 12,
    name: "Izuna Gongen",
    gender: "unknown",
    category: "mythology",
    qid: "Q11666654"
  },
  {
    baseId: 12,
    name: "Izusan Gongen",
    gender: "unknown",
    category: "mythology",
    qid: "Q11380566"
  },
  {
    baseId: 12,
    name: "Izushiyamae no okami",
    gender: "unknown",
    category: "mythology",
    qid: "Q112298467"
  },
  {
    baseId: 12,
    name: "Jūzenji",
    gender: "unknown",
    category: "mythology",
    qid: "Q123524325"
  },
  {
    baseId: 12,
    name: "Kamo Taketsunomi",
    gender: "male",
    category: "mythology",
    qid: "Q11634939"
  },
  {
    baseId: 12,
    name: "Kamo Wake-ikazuchi",
    gender: "male",
    category: "mythology",
    qid: "Q11634943"
  },
  {
    baseId: 12,
    name: "Kamuna'obi",
    gender: "unknown",
    category: "mythology",
    qid: "Q86725467"
  },
  {
    baseId: 12,
    name: "Kasuga Gongen",
    gender: "unknown",
    category: "mythology",
    qid: "Q11088804"
  },
  {
    baseId: 12,
    name: "Katakurabe no Mikoto",
    gender: "unknown",
    category: "mythology",
    qid: "Q60995918"
  },
  {
    baseId: 12,
    name: "Kihisakamitakahiko",
    gender: "unknown",
    category: "mythology",
    qid: "Q123511661"
  },
  {
    baseId: 12,
    name: "Kihisatsumi",
    gender: "unknown",
    category: "mythology",
    qid: "Q123511663"
  },
  {
    baseId: 12,
    name: "Kodamahiko-no-Mikoto",
    gender: "unknown",
    category: "mythology",
    qid: "Q109594446"
  },
  {
    baseId: 12,
    name: "Kompira",
    gender: "unknown",
    category: "mythology",
    qid: "Q167077"
  },
  {
    baseId: 12,
    name: "Konohanachiruhime",
    gender: "female",
    category: "mythology",
    qid: "Q48745675"
  },
  {
    baseId: 12,
    name: "Kumano Gongen",
    gender: "unknown",
    category: "mythology",
    qid: "Q11568925"
  },
  {
    baseId: 12,
    name: "Kuninotoshimi-no-Kami",
    gender: "male",
    category: "mythology",
    qid: "Q48759713"
  },
  {
    baseId: 12,
    name: "Kushimachi no Mikoto",
    gender: "male",
    category: "mythology",
    qid: "Q108039939"
  },
  {
    baseId: 12,
    name: "Kushiyatama",
    gender: "male",
    category: "mythology",
    qid: "Q86734749"
  },
  {
    baseId: 12,
    name: "Kuzu Daimyōjin",
    gender: "unknown",
    category: "mythology",
    qid: "Q112368210"
  },
  {
    baseId: 12,
    name: "Michikaeshi Ōkami",
    gender: "unknown",
    category: "mythology",
    qid: "Q134891408"
  },
  {
    baseId: 12,
    name: "Mimatsuhiko-Irodo-no-Mikoto",
    gender: "unknown",
    category: "mythology",
    qid: "Q86728909"
  },
  {
    baseId: 12,
    name: "Mishokutsuomi no Mikoto",
    gender: "male",
    category: "mythology",
    qid: "Q110796235"
  },
  {
    baseId: 12,
    name: "Moritaku-no-Kami",
    gender: "unknown",
    category: "mythology",
    qid: "Q38276368"
  },
  {
    baseId: 12,
    name: "Munasukihime",
    gender: "unknown",
    category: "mythology",
    qid: "Q24863211"
  },
  {
    baseId: 12,
    name: "Nago",
    gender: "unknown",
    category: "mythology",
    qid: "Q126542856"
  },
  {
    baseId: 12,
    name: "Nezu Gongen",
    gender: "unknown",
    category: "mythology",
    qid: "Q11536449"
  },
  {
    baseId: 12,
    name: "Niemotsu no Ko",
    gender: "unknown",
    category: "mythology",
    qid: "Q55532732"
  },
  {
    baseId: 12,
    name: "Oasahiko-no-Mikoto",
    gender: "male",
    category: "mythology",
    qid: "Q134846383"
  },
  {
    baseId: 12,
    name: "Omizunu",
    gender: "male",
    category: "mythology",
    qid: "Q48745416"
  },
  {
    baseId: 12,
    name: "Sakitamahime",
    gender: "unknown",
    category: "mythology",
    qid: "Q135330068"
  },
  {
    baseId: 12,
    name: "Sanki Daigongen",
    gender: "unknown",
    category: "mythology",
    qid: "Q11358323"
  },
  {
    baseId: 12,
    name: "Sannō Gongen",
    gender: "unknown",
    category: "mythology",
    qid: "Q11470054"
  },
  {
    baseId: 12,
    name: "Sashikuni Wakahime",
    gender: "female",
    category: "mythology",
    qid: "Q38276815"
  },
  {
    baseId: 12,
    name: "Sashikuni Ōkami",
    gender: "male",
    category: "mythology",
    qid: "Q48745417"
  },
  {
    baseId: 12,
    name: "Seiryū Gongen",
    gender: "unknown",
    category: "mythology",
    qid: "Q11561324"
  },
  {
    baseId: 12,
    name: "Sugane",
    gender: "unknown",
    category: "mythology",
    qid: "Q123511648"
  },
  {
    baseId: 12,
    name: "Suhijini",
    gender: "female",
    category: "mythology",
    qid: "Q84865529"
  },
  {
    baseId: 12,
    name: "Tajimamorosuku no kami",
    gender: "unknown",
    category: "mythology",
    qid: "Q112298337"
  },
  {
    baseId: 12,
    name: "Takamen",
    gender: "male",
    category: "mythology",
    qid: "Q134350458"
  },
  {
    baseId: 12,
    name: "Takei-Otomo-no-Ookami",
    gender: "unknown",
    category: "mythology",
    qid: "Q86728307"
  },
  {
    baseId: 12,
    name: "Takeminawake no Mikoto",
    gender: "unknown",
    category: "mythology",
    qid: "Q86730053"
  },
  {
    baseId: 12,
    name: "Takeuioki-no-Mikoto",
    gender: "male",
    category: "mythology",
    qid: "Q134845057"
  },
  {
    baseId: 12,
    name: "Tamahime no Mikoto",
    gender: "unknown",
    category: "mythology",
    qid: "Q109598469"
  },
  {
    baseId: 12,
    name: "Tamaru-hime",
    gender: "unknown",
    category: "mythology",
    qid: "Q56347882"
  },
  {
    baseId: 12,
    name: "Tanabatabime-no-Mikoto",
    gender: "unknown",
    category: "mythology",
    qid: "Q48750893"
  },
  {
    baseId: 12,
    name: "Tateyama Gongen",
    gender: "unknown",
    category: "mythology",
    qid: "Q11597837"
  },
  {
    baseId: 12,
    name: "Tenazuchi",
    gender: "female",
    category: "mythology",
    qid: "Q109554669"
  },
  {
    baseId: 12,
    name: "Torinarumi no kami",
    gender: "male",
    category: "mythology",
    qid: "Q55522639"
  },
  {
    baseId: 12,
    name: "Totori no kami",
    gender: "female",
    category: "mythology",
    qid: "Q48760952"
  },
  {
    baseId: 12,
    name: "Totsuyami-Sakitara-no-Kami",
    gender: "male",
    category: "mythology",
    qid: "Q55523289"
  },
  {
    baseId: 12,
    name: "Tsunuga Arashito",
    gender: "male",
    category: "mythology",
    qid: "Q17216052"
  },
  {
    baseId: 12,
    name: "Tsunugui",
    gender: "unknown",
    category: "mythology",
    qid: "Q135011341"
  },
  {
    baseId: 12,
    name: "Uhijini",
    gender: "male",
    category: "mythology",
    qid: "Q84865505"
  },
  {
    baseId: 12,
    name: "Unochihiko",
    gender: "male",
    category: "mythology",
    qid: "Q123511657"
  },
  {
    baseId: 12,
    name: "Utsushihikanasaku",
    gender: "male",
    category: "mythology",
    qid: "Q86736058"
  },
  {
    baseId: 12,
    name: "Yachinomi-no-Mikoto",
    gender: "unknown",
    category: "mythology",
    qid: "Q65249081"
  },
  {
    baseId: 12,
    name: "Yametsuhime",
    gender: "unknown",
    category: "mythology",
    qid: "Q98082969"
  },
  {
    baseId: 12,
    name: "Yashimajinumi no kami",
    gender: "male",
    category: "mythology",
    qid: "Q55522907"
  },
  {
    baseId: 12,
    name: "Yashimamuji",
    gender: "male",
    category: "mythology",
    qid: "Q65249018"
  },
  {
    baseId: 12,
    name: "Yatsuagata Sukune",
    gender: "unknown",
    category: "mythology",
    qid: "Q56347860"
  },
  {
    baseId: 12,
    name: "Yazuka-Otoko-no-Mikoto",
    gender: "male",
    category: "mythology",
    qid: "Q86728350"
  },
  {
    baseId: 12,
    name: "Yuga Daigongen",
    gender: "unknown",
    category: "mythology",
    qid: "Q11573853"
  },
  {
    baseId: 12,
    name: "Zaō Gongen",
    gender: "unknown",
    category: "mythology",
    qid: "Q10514059"
  },
  {
    baseId: 12,
    name: "Ōmiyanome",
    gender: "female",
    category: "mythology",
    qid: "Q24865597"
  },
  {
    baseId: 12,
    name: "Ōnotehime-no-Kami",
    gender: "female",
    category: "mythology",
    qid: "Q85878978"
  },
  {
    baseId: 12,
    name: "Ōtonobe",
    gender: "female",
    category: "mythology",
    qid: "Q84868574"
  },
  {
    baseId: 12,
    name: "Ōtonoji",
    gender: "male",
    category: "mythology",
    qid: "Q84868546"
  },
  {
    baseId: 18,
    name: "Abbasa",
    gender: "female",
    category: "ancient_person",
    qid: "Q305965"
  },
  {
    baseId: 18,
    name: "Abdul Qadir Gilani",
    gender: "male",
    category: "ancient_person",
    qid: "Q307365"
  },
  {
    baseId: 18,
    name: "Abu Bakr al-Kalabadhi",
    gender: "male",
    category: "ancient_person",
    qid: "Q334857"
  },
  {
    baseId: 18,
    name: "Abu Dawud al-Sijistani",
    gender: "male",
    category: "ancient_person",
    qid: "Q336558"
  },
  {
    baseId: 18,
    name: "Abu Firas al-Hamdani",
    gender: "male",
    category: "ancient_person",
    qid: "Q481409"
  },
  {
    baseId: 18,
    name: "Abu Isa at-Tirmidhi",
    gender: "male",
    category: "ancient_person",
    qid: "Q293578"
  },
  {
    baseId: 18,
    name: "Abu Ma'shar al-Balkhi",
    gender: "male",
    category: "ancient_person",
    qid: "Q11373"
  },
  {
    baseId: 18,
    name: "Abu Mikhnaf",
    gender: "male",
    category: "ancient_person",
    qid: "Q337009"
  },
  {
    baseId: 18,
    name: "Abu Nuwas",
    gender: "male",
    category: "ancient_person",
    qid: "Q5670"
  },
  {
    baseId: 18,
    name: "Abu al-Faraj al-Isfahani",
    gender: "male",
    category: "ancient_person",
    qid: "Q335599"
  },
  {
    baseId: 18,
    name: "Abu-Sa'id Jannabi",
    gender: "male",
    category: "ancient_person",
    qid: "Q288260"
  },
  {
    baseId: 18,
    name: "Abū Ḥanīfa Dīnawarī",
    gender: "male",
    category: "ancient_person",
    qid: "Q293520"
  },
  {
    baseId: 18,
    name: "Abū-Sa'īd Abul-Khayr",
    gender: "male",
    category: "ancient_person",
    qid: "Q335282"
  },
  {
    baseId: 18,
    name: "Ahmed ar-Rifa'i",
    gender: "male",
    category: "ancient_person",
    qid: "Q401463"
  },
  {
    baseId: 18,
    name: "Al-Baladhuri",
    gender: "male",
    category: "ancient_person",
    qid: "Q293528"
  },
  {
    baseId: 18,
    name: "Al-Basasiri",
    gender: "male",
    category: "ancient_person",
    qid: "Q288840"
  },
  {
    baseId: 18,
    name: "Al-Bayhaqi",
    gender: "male",
    category: "ancient_person",
    qid: "Q293663"
  },
  {
    baseId: 18,
    name: "Al-Fadl ibn Sahl",
    gender: "male",
    category: "ancient_person",
    qid: "Q292178"
  },
  {
    baseId: 18,
    name: "Al-Hilli",
    gender: "male",
    category: "ancient_person",
    qid: "Q290506"
  },
  {
    baseId: 18,
    name: "Al-Karaji",
    gender: "male",
    category: "ancient_person",
    qid: "Q461062"
  },
  {
    baseId: 18,
    name: "Al-Kindi",
    gender: "male",
    category: "ancient_person",
    qid: "Q179759"
  },
  {
    baseId: 18,
    name: "Al-Mas'udi",
    gender: "male",
    category: "ancient_person",
    qid: "Q168705"
  },
  {
    baseId: 18,
    name: "Al-Mawardi",
    gender: "male",
    category: "ancient_person",
    qid: "Q335635"
  },
  {
    baseId: 18,
    name: "Al-Mu'tadid",
    gender: "male",
    category: "ancient_person",
    qid: "Q284567"
  },
  {
    baseId: 18,
    name: "Al-Mu'tamid",
    gender: "male",
    category: "ancient_person",
    qid: "Q284721"
  },
  {
    baseId: 18,
    name: "Al-Mu'tazz",
    gender: "male",
    category: "ancient_person",
    qid: "Q281989"
  },
  {
    baseId: 18,
    name: "Al-Muktafi",
    gender: "male",
    category: "ancient_person",
    qid: "Q284701"
  },
  {
    baseId: 18,
    name: "Al-Muntasir",
    gender: "male",
    category: "ancient_person",
    qid: "Q284012"
  },
  {
    baseId: 18,
    name: "Al-Muqanna",
    gender: "male",
    category: "ancient_person",
    qid: "Q287761"
  },
  {
    baseId: 18,
    name: "Al-Muqtadi",
    gender: "male",
    category: "ancient_person",
    qid: "Q293683"
  },
  {
    baseId: 18,
    name: "Al-Muqtafi",
    gender: "male",
    category: "ancient_person",
    qid: "Q293617"
  },
  {
    baseId: 18,
    name: "Al-Musta'in",
    gender: "male",
    category: "ancient_person",
    qid: "Q284157"
  },
  {
    baseId: 18,
    name: "Al-Musta'sim",
    gender: "male",
    category: "ancient_person",
    qid: "Q293454"
  },
  {
    baseId: 18,
    name: "Al-Mustadi",
    gender: "male",
    category: "ancient_person",
    qid: "Q293646"
  },
  {
    baseId: 18,
    name: "Al-Mustakfi",
    gender: "male",
    category: "ancient_person",
    qid: "Q293640"
  },
  {
    baseId: 18,
    name: "Al-Mustanjid",
    gender: "male",
    category: "ancient_person",
    qid: "Q293448"
  },
  {
    baseId: 18,
    name: "Al-Mustansir",
    gender: "male",
    category: "ancient_person",
    qid: "Q293545"
  },
  {
    baseId: 18,
    name: "Al-Mustarshid",
    gender: "male",
    category: "ancient_person",
    qid: "Q293621"
  },
  {
    baseId: 18,
    name: "Al-Mustazhir",
    gender: "male",
    category: "ancient_person",
    qid: "Q293632"
  },
  {
    baseId: 18,
    name: "Al-Muti",
    gender: "male",
    category: "ancient_person",
    qid: "Q284730"
  },
  {
    baseId: 18,
    name: "Al-Muttaqi",
    gender: "male",
    category: "ancient_person",
    qid: "Q284759"
  },
  {
    baseId: 18,
    name: "Al-Muwaffaq",
    gender: "male",
    category: "ancient_person",
    qid: "Q291410"
  },
  {
    baseId: 18,
    name: "Al-Muzani",
    gender: "male",
    category: "ancient_person",
    qid: "Q48703"
  },
  {
    baseId: 18,
    name: "Al-Nasa'i",
    gender: "male",
    category: "ancient_person",
    qid: "Q293535"
  },
  {
    baseId: 18,
    name: "Al-Nasir",
    gender: "male",
    category: "ancient_person",
    qid: "Q284750"
  },
  {
    baseId: 18,
    name: "Al-Qa'im",
    gender: "male",
    category: "ancient_person",
    qid: "Q293626"
  },
  {
    baseId: 18,
    name: "Al-Qadir",
    gender: "male",
    category: "ancient_person",
    qid: "Q284427"
  },
  {
    baseId: 18,
    name: "Al-Qahir",
    gender: "male",
    category: "ancient_person",
    qid: "Q284711"
  },
  {
    baseId: 18,
    name: "Al-Rashid",
    gender: "male",
    category: "ancient_person",
    qid: "Q293509"
  },
  {
    baseId: 18,
    name: "Al-Waqidi",
    gender: "male",
    category: "ancient_person",
    qid: "Q285255"
  },
  {
    baseId: 18,
    name: "Al-Wathiq",
    gender: "male",
    category: "ancient_person",
    qid: "Q284585"
  },
  {
    baseId: 18,
    name: "Ali al-Hadi",
    gender: "male",
    category: "ancient_person",
    qid: "Q315377"
  },
  {
    baseId: 18,
    name: "Ali al-Rida",
    gender: "male",
    category: "ancient_person",
    qid: "Q25105"
  },
  {
    baseId: 18,
    name: "At-Ta'i",
    gender: "male",
    category: "ancient_person",
    qid: "Q284779"
  },
  {
    baseId: 18,
    name: "Az-Zahir",
    gender: "male",
    category: "ancient_person",
    qid: "Q293450"
  },
  {
    baseId: 18,
    name: "Baha ad-Din Shoieb",
    gender: "male",
    category: "ancient_person",
    qid: "Q253568"
  },
  {
    baseId: 18,
    name: "Bayazid Bastami",
    gender: "male",
    category: "ancient_person",
    qid: "Q380241"
  },
  {
    baseId: 18,
    name: "Farabi",
    gender: "male",
    category: "ancient_person",
    qid: "Q160460"
  },
  {
    baseId: 18,
    name: "Fatima al-Fihriya",
    gender: "female",
    category: "ancient_person",
    qid: "Q182363"
  },
  {
    baseId: 18,
    name: "Fātima bint Mūsā",
    gender: "female",
    category: "ancient_person",
    qid: "Q445398"
  },
  {
    baseId: 18,
    name: "Hasan al-Askari",
    gender: "male",
    category: "ancient_person",
    qid: "Q315920"
  },
  {
    baseId: 18,
    name: "Ibn Khordadbeh",
    gender: "male",
    category: "ancient_person",
    qid: "Q380004"
  },
  {
    baseId: 18,
    name: "Ibn Majah",
    gender: "male",
    category: "ancient_person",
    qid: "Q381469"
  },
  {
    baseId: 18,
    name: "Ibn al-Haytham",
    gender: "male",
    category: "ancient_person",
    qid: "Q11104"
  },
  {
    baseId: 18,
    name: "Ibrahim al-Nazzam",
    gender: "male",
    category: "ancient_person",
    qid: "Q287501"
  },
  {
    baseId: 18,
    name: "Imam Zufar",
    gender: "male",
    category: "ancient_person",
    qid: "Q228203"
  },
  {
    baseId: 18,
    name: "Inan",
    gender: "female",
    category: "ancient_person",
    qid: "Q11926586"
  },
  {
    baseId: 18,
    name: "Ishaq Ibn Rahwayh",
    gender: "male",
    category: "ancient_person",
    qid: "Q439344"
  },
  {
    baseId: 18,
    name: "Ishodad of Merv",
    gender: "male",
    category: "ancient_person",
    qid: "Q213120"
  },
  {
    baseId: 18,
    name: "Mansur Al-Hallaj",
    gender: "male",
    category: "ancient_person",
    qid: "Q172862"
  },
  {
    baseId: 18,
    name: "Mu'nis al-Khadim",
    gender: "male",
    category: "ancient_person",
    qid: "Q287837"
  },
  {
    baseId: 18,
    name: "Muhammad al-Jawad",
    gender: "male",
    category: "ancient_person",
    qid: "Q25088"
  },
  {
    baseId: 18,
    name: "Musa al-Kazim",
    gender: "male",
    category: "ancient_person",
    qid: "Q315031"
  },
  {
    baseId: 18,
    name: "Muslim ibn al-Ḥajjāj",
    gender: "male",
    category: "ancient_person",
    qid: "Q140124"
  },
  {
    baseId: 18,
    name: "Nafi' al-Madani",
    gender: "male",
    category: "ancient_person",
    qid: "Q112465"
  },
  {
    baseId: 18,
    name: "Nasir al-Din al-Tusi",
    gender: "male",
    category: "ancient_person",
    qid: "Q302835"
  },
  {
    baseId: 18,
    name: "Nizam al-Mulk",
    gender: "male",
    category: "ancient_person",
    qid: "Q298427"
  },
  {
    baseId: 18,
    name: "Rabia of Basri",
    gender: "female",
    category: "ancient_person",
    qid: "Q256506"
  },
  {
    baseId: 18,
    name: "Saadia Gaon",
    gender: "male",
    category: "ancient_person",
    qid: "Q328748"
  },
  {
    baseId: 18,
    name: "Sahl ibn Bishr",
    gender: "male",
    category: "ancient_person",
    qid: "Q353889"
  },
  {
    baseId: 18,
    name: "Shapur ibn Sahl",
    gender: "male",
    category: "ancient_person",
    qid: "Q325676"
  },
  {
    baseId: 18,
    name: "Sharif Radhi",
    gender: "male",
    category: "ancient_person",
    qid: "Q130561"
  },
  {
    baseId: 18,
    name: "Sharif al-Murtadha",
    gender: "male",
    category: "ancient_person",
    qid: "Q130169"
  },
  {
    baseId: 18,
    name: "Shihab al-Din Suhrawardi",
    gender: "male",
    category: "ancient_person",
    qid: "Q282883"
  },
  {
    baseId: 18,
    name: "Shmym al-Ḥillī",
    gender: "male",
    category: "ancient_person",
    qid: "Q6807343"
  },
  {
    baseId: 18,
    name: "Subuk",
    gender: "male",
    category: "ancient_person",
    qid: "Q7632290"
  },
  {
    baseId: 18,
    name: "Thābit ibn Qurra",
    gender: "male",
    category: "ancient_person",
    qid: "Q250568"
  },
  {
    baseId: 18,
    name: "al-Yaʿqubi",
    gender: "male",
    category: "ancient_person",
    qid: "Q293689"
  },
  {
    baseId: 22,
    name: "Annea",
    gender: "unknown",
    category: "mythology",
    qid: "Q565968"
  },
  {
    baseId: 22,
    name: "Ansotica",
    gender: "female",
    category: "mythology",
    qid: "Q570056"
  },
  {
    baseId: 22,
    name: "Aobh",
    gender: "female",
    category: "mythology",
    qid: "Q615537"
  },
  {
    baseId: 22,
    name: "Arawn",
    gender: "unknown",
    category: "mythology",
    qid: "Q626770"
  },
  {
    baseId: 22,
    name: "Arvalus",
    gender: "male",
    category: "mythology",
    qid: "Q716910"
  },
  {
    baseId: 22,
    name: "Baeserta",
    gender: "unknown",
    category: "mythology",
    qid: "Q799755"
  },
  {
    baseId: 22,
    name: "Bandua",
    gender: "male",
    category: "mythology",
    qid: "Q806376"
  },
  {
    baseId: 22,
    name: "Bith",
    gender: "unknown",
    category: "mythology",
    qid: "Q878793"
  },
  {
    baseId: 22,
    name: "Brath",
    gender: "male",
    category: "mythology",
    qid: "Q12384644"
  },
  {
    baseId: 22,
    name: "Buxenus",
    gender: "unknown",
    category: "mythology",
    qid: "Q1018287"
  },
  {
    baseId: 22,
    name: "Bébinn",
    gender: "unknown",
    category: "mythology",
    qid: "Q1019353"
  },
  {
    baseId: 22,
    name: "Cailleach",
    gender: "female",
    category: "mythology",
    qid: "Q1025867"
  },
  {
    baseId: 22,
    name: "Cernunnos",
    gender: "male",
    category: "mythology",
    qid: "Q739737"
  },
  {
    baseId: 22,
    name: "Dumiatis",
    gender: "male",
    category: "mythology",
    qid: "Q1264987"
  },
  {
    baseId: 22,
    name: "Emrys",
    gender: "unknown",
    category: "mythology",
    qid: "Q10483170"
  },
  {
    baseId: 22,
    name: "Fish-man",
    gender: "male",
    category: "mythology",
    qid: "Q1586937"
  },
  {
    baseId: 22,
    name: "Frìd",
    gender: "unknown",
    category: "mythology",
    qid: "Q13194676"
  },
  {
    baseId: 22,
    name: "Hooded Spirits",
    gender: "unknown",
    category: "mythology",
    qid: "Q1425293"
  },
  {
    baseId: 22,
    name: "Latiaran",
    gender: "female",
    category: "mythology",
    qid: "Q11753178"
  },
  {
    baseId: 22,
    name: "Lir",
    gender: "male",
    category: "mythology",
    qid: "Q1827715"
  },
  {
    baseId: 22,
    name: "Math fab Mathonwy",
    gender: "male",
    category: "mythology",
    qid: "Q2097638"
  },
  {
    baseId: 22,
    name: "Nabia",
    gender: "female",
    category: "mythology",
    qid: "Q3321513"
  },
  {
    baseId: 22,
    name: "Reo",
    gender: "male",
    category: "mythology",
    qid: "Q3392532"
  },
  {
    baseId: 22,
    name: "Sluagh",
    gender: "unknown",
    category: "mythology",
    qid: "Q3136673"
  },
  {
    baseId: 22,
    name: "Suleviae",
    gender: "female",
    category: "mythology",
    qid: "Q1399677"
  },
  {
    baseId: 22,
    name: "Veteris",
    gender: "unknown",
    category: "mythology",
    qid: "Q1354248"
  },
  {
    baseId: 23,
    name: "Enki",
    gender: "male",
    category: "mythology",
    qid: "Q189726"
  },
  {
    baseId: 23,
    name: "Enlil",
    gender: "male",
    category: "mythology",
    qid: "Q214672"
  },
  {
    baseId: 23,
    name: "Gilgamesh",
    gender: "unknown",
    category: "mythology",
    qid: "Q75352"
  },
  {
    baseId: 23,
    name: "Inanna",
    gender: "female",
    category: "mythology",
    qid: "Q272523"
  },
  {
    baseId: 23,
    name: "Ishtar",
    gender: "female",
    category: "mythology",
    qid: "Q47553"
  },
  {
    baseId: 23,
    name: "Marduk",
    gender: "male",
    category: "mythology",
    qid: "Q190123"
  },
  {
    baseId: 24,
    name: "Ahriman",
    gender: "unknown",
    category: "mythology",
    qid: "Q3607025"
  },
  {
    baseId: 24,
    name: "Ahura Mazda",
    gender: "unknown",
    category: "mythology",
    qid: "Q179575"
  },
  {
    baseId: 24,
    name: "Rostam",
    gender: "male",
    category: "mythology",
    qid: "Q60062"
  },
  {
    baseId: 42,
    name: "Abraham",
    gender: "male",
    category: "mythology",
    qid: "Q9181"
  },
  {
    baseId: 42,
    name: "Adam",
    gender: "unknown",
    category: "mythology",
    qid: "Q70899"
  },
  {
    baseId: 42,
    name: "David",
    gender: "male",
    category: "mythology",
    qid: "Q41370"
  },
  {
    baseId: 42,
    name: "Eve",
    gender: "female",
    category: "mythology",
    qid: "Q239464"
  },
  {
    baseId: 42,
    name: "Joshua",
    gender: "male",
    category: "mythology",
    qid: "Q7734"
  },
  {
    baseId: 42,
    name: "Moses",
    gender: "male",
    category: "mythology",
    qid: "Q9077"
  },
  {
    baseId: 42,
    name: "Noah",
    gender: "male",
    category: "mythology",
    qid: "Q81422"
  },
  {
    baseId: 42,
    name: "Solomon",
    gender: "male",
    category: "mythology",
    qid: "Q37085"
  }
] as const;

export const MYTHIC_NAMES_BY_BASE: Readonly<Record<number, readonly MythicAncientNameEntry[]>> = {
  "0": [
    {
      baseId: 0,
      name: "Beowulf",
      gender: "unknown",
      category: "mythology",
      qid: "Q48328"
    },
    {
      baseId: 0,
      name: "Brunhild",
      gender: "unknown",
      category: "mythology",
      qid: "Q992632"
    },
    {
      baseId: 0,
      name: "Roland",
      gender: "male",
      category: "mythology",
      qid: "Q207535"
    },
    {
      baseId: 0,
      name: "Siegfried",
      gender: "unknown",
      category: "mythology",
      qid: "Q333146"
    }
  ],
  "1": [
    {
      baseId: 1,
      name: "Galahad",
      gender: "male",
      category: "mythology",
      qid: "Q831462"
    },
    {
      baseId: 1,
      name: "Gawain",
      gender: "male",
      category: "mythology",
      qid: "Q831685"
    },
    {
      baseId: 1,
      name: "Guinevere",
      gender: "female",
      category: "mythology",
      qid: "Q272054"
    },
    {
      baseId: 1,
      name: "King Arthur",
      gender: "male",
      category: "mythology",
      qid: "Q45792"
    },
    {
      baseId: 1,
      name: "Lancelot",
      gender: "male",
      category: "mythology",
      qid: "Q215681"
    },
    {
      baseId: 1,
      name: "Merlin",
      gender: "unknown",
      category: "mythology",
      qid: "Q76148"
    },
    {
      baseId: 1,
      name: "Mordred",
      gender: "male",
      category: "mythology",
      qid: "Q81109"
    },
    {
      baseId: 1,
      name: "Percival",
      gender: "male",
      category: "mythology",
      qid: "Q728510"
    },
    {
      baseId: 1,
      name: "Tristan",
      gender: "unknown",
      category: "mythology",
      qid: "Q413090"
    }
  ],
  "4": [
    {
      baseId: 4,
      name: "Abner of Burgos",
      gender: "male",
      category: "ancient_person",
      qid: "Q322560"
    },
    {
      baseId: 4,
      name: "Achila II",
      gender: "male",
      category: "ancient_person",
      qid: "Q393730"
    },
    {
      baseId: 4,
      name: "Adelgaster",
      gender: "male",
      category: "ancient_person",
      qid: "Q8188115"
    },
    {
      baseId: 4,
      name: "Attilanus of Zamora",
      gender: "male",
      category: "ancient_person",
      qid: "Q705797"
    },
    {
      baseId: 4,
      name: "Azriel",
      gender: "male",
      category: "ancient_person",
      qid: "Q557882"
    },
    {
      baseId: 4,
      name: "Bernhard",
      gender: "male",
      category: "ancient_person",
      qid: "Q824674"
    },
    {
      baseId: 4,
      name: "Diego de Acebo",
      gender: "male",
      category: "ancient_person",
      qid: "Q1220590"
    },
    {
      baseId: 4,
      name: "Dominicus Gundissalinus",
      gender: "male",
      category: "ancient_person",
      qid: "Q1237726"
    },
    {
      baseId: 4,
      name: "Durand of Huesca",
      gender: "male",
      category: "ancient_person",
      qid: "Q3041516"
    },
    {
      baseId: 4,
      name: "Emilian of Cogolla",
      gender: "male",
      category: "ancient_person",
      qid: "Q153204"
    },
    {
      baseId: 4,
      name: "Fandilus",
      gender: "male",
      category: "ancient_person",
      qid: "Q2082240"
    },
    {
      baseId: 4,
      name: "Fernando Díaz Gudiel",
      gender: "male",
      category: "ancient_person",
      qid: "Q5859476"
    },
    {
      baseId: 4,
      name: "Fernando Pérez",
      gender: "male",
      category: "ancient_person",
      qid: "Q5801647"
    },
    {
      baseId: 4,
      name: "Flaianus",
      gender: "male",
      category: "ancient_person",
      qid: "Q5457050"
    },
    {
      baseId: 4,
      name: "Florentius",
      gender: "male",
      category: "ancient_person",
      qid: "Q3746711"
    },
    {
      baseId: 4,
      name: "Francio of Cantabria",
      gender: "male",
      category: "ancient_person",
      qid: "Q5802517"
    },
    {
      baseId: 4,
      name: "Froila",
      gender: "male",
      category: "ancient_person",
      qid: "Q5505325"
    },
    {
      baseId: 4,
      name: "Fruela Díaz",
      gender: "male",
      category: "ancient_person",
      qid: "Q5506348"
    },
    {
      baseId: 4,
      name: "Fulgentius of Cartagena",
      gender: "male",
      category: "ancient_person",
      qid: "Q2616176"
    },
    {
      baseId: 4,
      name: "García Álvarez",
      gender: "male",
      category: "ancient_person",
      qid: "Q1493998"
    },
    {
      baseId: 4,
      name: "Gil de Torres",
      gender: "male",
      category: "ancient_person",
      qid: "Q748383"
    },
    {
      baseId: 4,
      name: "Gonzalo Miguel",
      gender: "male",
      category: "ancient_person",
      qid: "Q5883112"
    },
    {
      baseId: 4,
      name: "Gonzalo Pérez Gudiel",
      gender: "male",
      category: "ancient_person",
      qid: "Q2420654"
    },
    {
      baseId: 4,
      name: "Gonzalo de Aguilar",
      gender: "male",
      category: "ancient_person",
      qid: "Q5883357"
    },
    {
      baseId: 4,
      name: "Hugo of Santalla",
      gender: "male",
      category: "ancient_person",
      qid: "Q387106"
    },
    {
      baseId: 4,
      name: "Ibn Juzayy",
      gender: "male",
      category: "ancient_person",
      qid: "Q3773066"
    },
    {
      baseId: 4,
      name: "Ibn Luyun",
      gender: "male",
      category: "ancient_person",
      qid: "Q3147449"
    },
    {
      baseId: 4,
      name: "Isaac ibn Latif",
      gender: "male",
      category: "ancient_person",
      qid: "Q1673518"
    },
    {
      baseId: 4,
      name: "Jacob ben Reuben",
      gender: "male",
      category: "ancient_person",
      qid: "Q1679439"
    },
    {
      baseId: 4,
      name: "Juan de Ortega",
      gender: "male",
      category: "ancient_person",
      qid: "Q2713819"
    },
    {
      baseId: 4,
      name: "Judah ben Asher",
      gender: "male",
      category: "ancient_person",
      qid: "Q828097"
    },
    {
      baseId: 4,
      name: "Lucas de Tuy",
      gender: "male",
      category: "ancient_person",
      qid: "Q3065693"
    },
    {
      baseId: 4,
      name: "Munio of Zamora",
      gender: "male",
      category: "ancient_person",
      qid: "Q2356240"
    },
    {
      baseId: 4,
      name: "Opilano",
      gender: "male",
      category: "ancient_person",
      qid: "Q6051614"
    },
    {
      baseId: 4,
      name: "Pedro Ansúrez",
      gender: "male",
      category: "ancient_person",
      qid: "Q1159977"
    },
    {
      baseId: 4,
      name: "Pedro de Cuéllar",
      gender: "male",
      category: "ancient_person",
      qid: "Q6070467"
    },
    {
      baseId: 4,
      name: "Pedro de Peñafiel",
      gender: "male",
      category: "ancient_person",
      qid: "Q6070553"
    },
    {
      baseId: 4,
      name: "Pelayo Peláez",
      gender: "male",
      category: "ancient_person",
      qid: "Q6070890"
    },
    {
      baseId: 4,
      name: "Pere Tomás",
      gender: "male",
      category: "ancient_person",
      qid: "Q6070246"
    },
    {
      baseId: 4,
      name: "Pere de Montsó",
      gender: "male",
      category: "ancient_person",
      qid: "Q3899765"
    },
    {
      baseId: 4,
      name: "Peter González",
      gender: "male",
      category: "ancient_person",
      qid: "Q2715632"
    },
    {
      baseId: 4,
      name: "Pêro da Ponte",
      gender: "male",
      category: "ancient_person",
      qid: "Q1779292"
    },
    {
      baseId: 4,
      name: "Ramon de Caldes",
      gender: "male",
      category: "ancient_person",
      qid: "Q3608950"
    },
    {
      baseId: 4,
      name: "Salomon ibn Parhon",
      gender: "male",
      category: "ancient_person",
      qid: "Q3470074"
    },
    {
      baseId: 4,
      name: "Savaric I",
      gender: "male",
      category: "ancient_person",
      qid: "Q7427948"
    },
    {
      baseId: 4,
      name: "Shem-Tov ibn Falaquera",
      gender: "male",
      category: "ancient_person",
      qid: "Q1383938"
    },
    {
      baseId: 4,
      name: "Sisebut",
      gender: "male",
      category: "ancient_person",
      qid: "Q350656"
    },
    {
      baseId: 4,
      name: "Sisebut de Cardeña",
      gender: "male",
      category: "ancient_person",
      qid: "Q5678123"
    },
    {
      baseId: 4,
      name: "Teresa Gil",
      gender: "female",
      category: "ancient_person",
      qid: "Q6142561"
    }
  ],
  "6": [
    {
      baseId: 6,
      name: "Alako",
      gender: "unknown",
      category: "mythology",
      qid: "Q2016658"
    },
    {
      baseId: 6,
      name: "Alfadur",
      gender: "unknown",
      category: "mythology",
      qid: "Q9602646"
    },
    {
      baseId: 6,
      name: "Alfrigg",
      gender: "unknown",
      category: "mythology",
      qid: "Q2646410"
    },
    {
      baseId: 6,
      name: "Alsviðr",
      gender: "unknown",
      category: "mythology",
      qid: "Q432825"
    },
    {
      baseId: 6,
      name: "Alvaldi",
      gender: "male",
      category: "mythology",
      qid: "Q2021358"
    },
    {
      baseId: 6,
      name: "Alvíss",
      gender: "male",
      category: "mythology",
      qid: "Q1143134"
    },
    {
      baseId: 6,
      name: "Andhrímnir",
      gender: "unknown",
      category: "mythology",
      qid: "Q534156"
    },
    {
      baseId: 6,
      name: "Andvari",
      gender: "male",
      category: "mythology",
      qid: "Q525149"
    },
    {
      baseId: 6,
      name: "Annar",
      gender: "male",
      category: "mythology",
      qid: "Q2573198"
    },
    {
      baseId: 6,
      name: "Aslaug",
      gender: "female",
      category: "mythology",
      qid: "Q732678"
    },
    {
      baseId: 6,
      name: "Atla",
      gender: "female",
      category: "mythology",
      qid: "Q2143293"
    },
    {
      baseId: 6,
      name: "Aurvandill",
      gender: "male",
      category: "mythology",
      qid: "Q279501"
    },
    {
      baseId: 6,
      name: "Barri",
      gender: "unknown",
      category: "mythology",
      qid: "Q4863474"
    },
    {
      baseId: 6,
      name: "Bergelmir",
      gender: "male",
      category: "mythology",
      qid: "Q266233"
    },
    {
      baseId: 6,
      name: "Bifröst",
      gender: "unknown",
      category: "mythology",
      qid: "Q208525"
    },
    {
      baseId: 6,
      name: "Billingr",
      gender: "male",
      category: "mythology",
      qid: "Q953464"
    },
    {
      baseId: 6,
      name: "Bláin",
      gender: "unknown",
      category: "mythology",
      qid: "Q881142"
    },
    {
      baseId: 6,
      name: "Bragi",
      gender: "male",
      category: "mythology",
      qid: "Q199959"
    },
    {
      baseId: 6,
      name: "Brokkr",
      gender: "male",
      category: "mythology",
      qid: "Q926010"
    },
    {
      baseId: 6,
      name: "Byggvir",
      gender: "male",
      category: "mythology",
      qid: "Q1018519"
    },
    {
      baseId: 6,
      name: "Bödvar Bjarki",
      gender: "male",
      category: "mythology",
      qid: "Q2519089"
    },
    {
      baseId: 6,
      name: "Bøyg",
      gender: "unknown",
      category: "mythology",
      qid: "Q1789846"
    },
    {
      baseId: 6,
      name: "Búri",
      gender: "male",
      category: "mythology",
      qid: "Q336145"
    },
    {
      baseId: 6,
      name: "Býleistr",
      gender: "male",
      category: "mythology",
      qid: "Q1018548"
    },
    {
      baseId: 6,
      name: "Dagr",
      gender: "male",
      category: "mythology",
      qid: "Q1136295"
    },
    {
      baseId: 6,
      name: "Dellingr",
      gender: "male",
      category: "mythology",
      qid: "Q944790"
    },
    {
      baseId: 6,
      name: "Durinn",
      gender: "unknown",
      category: "mythology",
      qid: "Q1261767"
    },
    {
      baseId: 6,
      name: "Dvalinn",
      gender: "unknown",
      category: "mythology",
      qid: "Q1268297"
    },
    {
      baseId: 6,
      name: "Dáinn",
      gender: "unknown",
      category: "mythology",
      qid: "Q841703"
    },
    {
      baseId: 6,
      name: "Eggther",
      gender: "unknown",
      category: "mythology",
      qid: "Q981889"
    },
    {
      baseId: 6,
      name: "Eir",
      gender: "female",
      category: "mythology",
      qid: "Q427355"
    },
    {
      baseId: 6,
      name: "Elli",
      gender: "female",
      category: "mythology",
      qid: "Q1283197"
    },
    {
      baseId: 6,
      name: "Fimafeng",
      gender: "male",
      category: "mythology",
      qid: "Q2540845"
    },
    {
      baseId: 6,
      name: "Fin",
      gender: "unknown",
      category: "mythology",
      qid: "Q2481558"
    },
    {
      baseId: 6,
      name: "Fjölnir",
      gender: "male",
      category: "mythology",
      qid: "Q1400296"
    },
    {
      baseId: 6,
      name: "Fjölvar",
      gender: "unknown",
      category: "mythology",
      qid: "Q742527"
    },
    {
      baseId: 6,
      name: "Fjörgyn",
      gender: "female",
      category: "mythology",
      qid: "Q108807778"
    },
    {
      baseId: 6,
      name: "Forseti",
      gender: "male",
      category: "mythology",
      qid: "Q62548"
    },
    {
      baseId: 6,
      name: "Freyr",
      gender: "male",
      category: "mythology",
      qid: "Q131474"
    },
    {
      baseId: 6,
      name: "Frigg",
      gender: "female",
      category: "mythology",
      qid: "Q131654"
    },
    {
      baseId: 6,
      name: "Frotho I",
      gender: "male",
      category: "mythology",
      qid: "Q887924"
    },
    {
      baseId: 6,
      name: "Fulla",
      gender: "female",
      category: "mythology",
      qid: "Q847429"
    },
    {
      baseId: 6,
      name: "Fáfnir",
      gender: "male",
      category: "mythology",
      qid: "Q745315"
    },
    {
      baseId: 6,
      name: "Gandalf",
      gender: "unknown",
      category: "mythology",
      qid: "Q587350"
    },
    {
      baseId: 6,
      name: "Gaut",
      gender: "male",
      category: "mythology",
      qid: "Q1402029"
    },
    {
      baseId: 6,
      name: "Gersemi",
      gender: "female",
      category: "mythology",
      qid: "Q1515018"
    },
    {
      baseId: 6,
      name: "Gestumblindi",
      gender: "unknown",
      category: "mythology",
      qid: "Q1519694"
    },
    {
      baseId: 6,
      name: "Gjallarbrú",
      gender: "unknown",
      category: "mythology",
      qid: "Q1528902"
    },
    {
      baseId: 6,
      name: "Gjálp and Greip",
      gender: "unknown",
      category: "mythology",
      qid: "Q345799"
    },
    {
      baseId: 6,
      name: "Gjöll",
      gender: "unknown",
      category: "mythology",
      qid: "Q1500292"
    },
    {
      baseId: 6,
      name: "Glenr",
      gender: "male",
      category: "mythology",
      qid: "Q5569275"
    },
    {
      baseId: 6,
      name: "Grani",
      gender: "unknown",
      category: "mythology",
      qid: "Q2418385"
    },
    {
      baseId: 6,
      name: "Grerr",
      gender: "unknown",
      category: "mythology",
      qid: "Q1545912"
    },
    {
      baseId: 6,
      name: "Grimhild",
      gender: "female",
      category: "mythology",
      qid: "Q1565635"
    },
    {
      baseId: 6,
      name: "Grímnir",
      gender: "unknown",
      category: "mythology",
      qid: "Q1262034"
    },
    {
      baseId: 6,
      name: "Gróa",
      gender: "female",
      category: "mythology",
      qid: "Q1280875"
    },
    {
      baseId: 6,
      name: "Gudrun",
      gender: "female",
      category: "mythology",
      qid: "Q1257834"
    },
    {
      baseId: 6,
      name: "Gullfaxi",
      gender: "unknown",
      category: "mythology",
      qid: "Q1200682"
    },
    {
      baseId: 6,
      name: "Gullveig",
      gender: "female",
      category: "mythology",
      qid: "Q1324152"
    },
    {
      baseId: 6,
      name: "Gutthorm",
      gender: "male",
      category: "mythology",
      qid: "Q1557360"
    },
    {
      baseId: 6,
      name: "Gylfi",
      gender: "male",
      category: "mythology",
      qid: "Q2296321"
    },
    {
      baseId: 6,
      name: "Göll",
      gender: "female",
      category: "mythology",
      qid: "Q96657669"
    },
    {
      baseId: 6,
      name: "Hagbard",
      gender: "male",
      category: "mythology",
      qid: "Q1456415"
    },
    {
      baseId: 6,
      name: "Hagen",
      gender: "male",
      category: "mythology",
      qid: "Q1568447"
    },
    {
      baseId: 6,
      name: "Heidrek",
      gender: "male",
      category: "mythology",
      qid: "Q2215697"
    },
    {
      baseId: 6,
      name: "Heiðr",
      gender: "female",
      category: "mythology",
      qid: "Q2243464"
    },
    {
      baseId: 6,
      name: "Helblindi",
      gender: "male",
      category: "mythology",
      qid: "Q282516"
    },
    {
      baseId: 6,
      name: "Helgi Hundingsbane",
      gender: "male",
      category: "mythology",
      qid: "Q155432"
    },
    {
      baseId: 6,
      name: "Hermod",
      gender: "male",
      category: "mythology",
      qid: "Q579612"
    },
    {
      baseId: 6,
      name: "Hervör alvitr",
      gender: "female",
      category: "mythology",
      qid: "Q1115537"
    },
    {
      baseId: 6,
      name: "Hildr",
      gender: "female",
      category: "mythology",
      qid: "Q2580125"
    },
    {
      baseId: 6,
      name: "Himinglæva",
      gender: "female",
      category: "mythology",
      qid: "Q666857"
    },
    {
      baseId: 6,
      name: "Hlöd",
      gender: "unknown",
      category: "mythology",
      qid: "Q2383464"
    },
    {
      baseId: 6,
      name: "Hnoss",
      gender: "female",
      category: "mythology",
      qid: "Q1543730"
    },
    {
      baseId: 6,
      name: "Hoddmímis holt",
      gender: "unknown",
      category: "mythology",
      qid: "Q679137"
    },
    {
      baseId: 6,
      name: "Hreiðmarr",
      gender: "male",
      category: "mythology",
      qid: "Q1390232"
    },
    {
      baseId: 6,
      name: "Hringhorni",
      gender: "unknown",
      category: "mythology",
      qid: "Q1424849"
    },
    {
      baseId: 6,
      name: "Hrist",
      gender: "female",
      category: "mythology",
      qid: "Q10655862"
    },
    {
      baseId: 6,
      name: "Hræsvelgr",
      gender: "male",
      category: "mythology",
      qid: "Q564342"
    },
    {
      baseId: 6,
      name: "Hvergelmir",
      gender: "unknown",
      category: "mythology",
      qid: "Q536442"
    },
    {
      baseId: 6,
      name: "Högne",
      gender: "male",
      category: "mythology",
      qid: "Q937699"
    },
    {
      baseId: 6,
      name: "Ilmr",
      gender: "female",
      category: "mythology",
      qid: "Q3323186"
    },
    {
      baseId: 6,
      name: "Ingunar-Freyr",
      gender: "unknown",
      category: "mythology",
      qid: "Q519622"
    },
    {
      baseId: 6,
      name: "Iðunn",
      gender: "female",
      category: "mythology",
      qid: "Q204691"
    },
    {
      baseId: 6,
      name: "Jörð",
      gender: "female",
      category: "mythology",
      qid: "Q548730"
    },
    {
      baseId: 6,
      name: "Jötnar",
      gender: "unknown",
      category: "mythology",
      qid: "Q210053"
    },
    {
      baseId: 6,
      name: "Kvasir",
      gender: "male",
      category: "mythology",
      qid: "Q216763"
    },
    {
      baseId: 6,
      name: "Kári",
      gender: "male",
      category: "mythology",
      qid: "Q688566"
    },
    {
      baseId: 6,
      name: "Kólga",
      gender: "female",
      category: "mythology",
      qid: "Q179227"
    },
    {
      baseId: 6,
      name: "Laufey",
      gender: "female",
      category: "mythology",
      qid: "Q607641"
    },
    {
      baseId: 6,
      name: "Leikn",
      gender: "unknown",
      category: "mythology",
      qid: "Q388585"
    },
    {
      baseId: 6,
      name: "Loki",
      gender: "unknown",
      category: "mythology",
      qid: "Q133147"
    },
    {
      baseId: 6,
      name: "Lóðurr",
      gender: "male",
      category: "mythology",
      qid: "Q1501311"
    },
    {
      baseId: 6,
      name: "Magni",
      gender: "male",
      category: "mythology",
      qid: "Q1845668"
    },
    {
      baseId: 6,
      name: "Meili",
      gender: "male",
      category: "mythology",
      qid: "Q1617533"
    },
    {
      baseId: 6,
      name: "Miskorblindi",
      gender: "male",
      category: "mythology",
      qid: "Q2200742"
    },
    {
      baseId: 6,
      name: "Mundilfari",
      gender: "male",
      category: "mythology",
      qid: "Q578248"
    },
    {
      baseId: 6,
      name: "Muspell",
      gender: "male",
      category: "mythology",
      qid: "Q675304"
    },
    {
      baseId: 6,
      name: "Máni",
      gender: "male",
      category: "mythology",
      qid: "Q739765"
    },
    {
      baseId: 6,
      name: "Mímameiðr",
      gender: "unknown",
      category: "mythology",
      qid: "Q1273709"
    },
    {
      baseId: 6,
      name: "Mímir",
      gender: "male",
      category: "mythology",
      qid: "Q336496"
    },
    {
      baseId: 6,
      name: "Mímisbrunnr",
      gender: "unknown",
      category: "mythology",
      qid: "Q990571"
    },
    {
      baseId: 6,
      name: "Mótsognir",
      gender: "unknown",
      category: "mythology",
      qid: "Q1284136"
    },
    {
      baseId: 6,
      name: "Móðguðr",
      gender: "female",
      category: "mythology",
      qid: "Q1752972"
    },
    {
      baseId: 6,
      name: "Móði",
      gender: "male",
      category: "mythology",
      qid: "Q601453"
    },
    {
      baseId: 6,
      name: "Mökkurkálfi",
      gender: "unknown",
      category: "mythology",
      qid: "Q3267273"
    },
    {
      baseId: 6,
      name: "Naglfar",
      gender: "unknown",
      category: "mythology",
      qid: "Q846277"
    },
    {
      baseId: 6,
      name: "Naglfari",
      gender: "male",
      category: "mythology",
      qid: "Q2736538"
    },
    {
      baseId: 6,
      name: "Nanna",
      gender: "female",
      category: "mythology",
      qid: "Q500390"
    },
    {
      baseId: 6,
      name: "Nari",
      gender: "male",
      category: "mythology",
      qid: "Q1194706"
    },
    {
      baseId: 6,
      name: "Nepr",
      gender: "male",
      category: "mythology",
      qid: "Q929021"
    },
    {
      baseId: 6,
      name: "Ninus",
      gender: "male",
      category: "mythology",
      qid: "Q1152356"
    },
    {
      baseId: 6,
      name: "Niðhad",
      gender: "male",
      category: "mythology",
      qid: "Q1987427"
    },
    {
      baseId: 6,
      name: "Njord",
      gender: "male",
      category: "mythology",
      qid: "Q193879"
    },
    {
      baseId: 6,
      name: "Njörun",
      gender: "female",
      category: "mythology",
      qid: "Q431044"
    },
    {
      baseId: 6,
      name: "Norse dwarves",
      gender: "unknown",
      category: "mythology",
      qid: "Q2738581"
    },
    {
      baseId: 6,
      name: "Nótt",
      gender: "female",
      category: "mythology",
      qid: "Q576795"
    },
    {
      baseId: 6,
      name: "Odin",
      gender: "male",
      category: "mythology",
      qid: "Q43610"
    },
    {
      baseId: 6,
      name: "Ragnarök",
      gender: "unknown",
      category: "mythology",
      qid: "Q170148"
    },
    {
      baseId: 6,
      name: "Regin",
      gender: "male",
      category: "mythology",
      qid: "Q1502974"
    },
    {
      baseId: 6,
      name: "Rerir",
      gender: "male",
      category: "mythology",
      qid: "Q457767"
    },
    {
      baseId: 6,
      name: "Rindr",
      gender: "female",
      category: "mythology",
      qid: "Q1324396"
    },
    {
      baseId: 6,
      name: "Rán",
      gender: "female",
      category: "mythology",
      qid: "Q663348"
    },
    {
      baseId: 6,
      name: "Ríg",
      gender: "unknown",
      category: "mythology",
      qid: "Q15843446"
    },
    {
      baseId: 6,
      name: "Röskva",
      gender: "female",
      category: "mythology",
      qid: "Q1852740"
    },
    {
      baseId: 6,
      name: "Sif",
      gender: "female",
      category: "mythology",
      qid: "Q211613"
    },
    {
      baseId: 6,
      name: "Siggeir",
      gender: "male",
      category: "mythology",
      qid: "Q1810814"
    },
    {
      baseId: 6,
      name: "Sigi",
      gender: "male",
      category: "mythology",
      qid: "Q458489"
    },
    {
      baseId: 6,
      name: "Sigmund",
      gender: "male",
      category: "mythology",
      qid: "Q1158552"
    },
    {
      baseId: 6,
      name: "Sigrdrífa",
      gender: "female",
      category: "mythology",
      qid: "Q1076478"
    },
    {
      baseId: 6,
      name: "Sigrún",
      gender: "female",
      category: "mythology",
      qid: "Q3041936"
    },
    {
      baseId: 6,
      name: "Sigurd",
      gender: "male",
      category: "mythology",
      qid: "Q537554"
    },
    {
      baseId: 6,
      name: "Sigyn",
      gender: "female",
      category: "mythology",
      qid: "Q734508"
    },
    {
      baseId: 6,
      name: "Sindri",
      gender: "male",
      category: "mythology",
      qid: "Q1468430"
    },
    {
      baseId: 6,
      name: "Sinfjötli",
      gender: "male",
      category: "mythology",
      qid: "Q513564"
    },
    {
      baseId: 6,
      name: "Sister-wife of Njörðr",
      gender: "female",
      category: "mythology",
      qid: "Q18211476"
    },
    {
      baseId: 6,
      name: "Skaði",
      gender: "female",
      category: "mythology",
      qid: "Q244032"
    },
    {
      baseId: 6,
      name: "Skjöldr",
      gender: "male",
      category: "mythology",
      qid: "Q1771470"
    },
    {
      baseId: 6,
      name: "Skuld",
      gender: "female",
      category: "mythology",
      qid: "Q500473"
    },
    {
      baseId: 6,
      name: "Skírnir",
      gender: "male",
      category: "mythology",
      qid: "Q264522"
    },
    {
      baseId: 6,
      name: "Skögul",
      gender: "female",
      category: "mythology",
      qid: "Q6319136"
    },
    {
      baseId: 6,
      name: "Slidr",
      gender: "unknown",
      category: "mythology",
      qid: "Q1851773"
    },
    {
      baseId: 6,
      name: "Sons of Odin",
      gender: "unknown",
      category: "mythology",
      qid: "Q7562334"
    },
    {
      baseId: 6,
      name: "Starkad",
      gender: "male",
      category: "mythology",
      qid: "Q957042"
    },
    {
      baseId: 6,
      name: "Surtr",
      gender: "male",
      category: "mythology",
      qid: "Q211700"
    },
    {
      baseId: 6,
      name: "Svafrlami",
      gender: "male",
      category: "mythology",
      qid: "Q1817116"
    },
    {
      baseId: 6,
      name: "Svanhildr",
      gender: "female",
      category: "mythology",
      qid: "Q1758567"
    },
    {
      baseId: 6,
      name: "Svipdagr",
      gender: "male",
      category: "mythology",
      qid: "Q764214"
    },
    {
      baseId: 6,
      name: "Svipul",
      gender: "unknown",
      category: "mythology",
      qid: "Q7652719"
    },
    {
      baseId: 6,
      name: "Sváfa",
      gender: "female",
      category: "mythology",
      qid: "Q1085116"
    },
    {
      baseId: 6,
      name: "Sága",
      gender: "female",
      category: "mythology",
      qid: "Q1263128"
    },
    {
      baseId: 6,
      name: "Sága and Sökkvabekkr",
      gender: "unknown",
      category: "mythology",
      qid: "Q1799815"
    },
    {
      baseId: 6,
      name: "Sökkvabekkr",
      gender: "unknown",
      category: "mythology",
      qid: "Q16513498"
    },
    {
      baseId: 6,
      name: "Thor",
      gender: "male",
      category: "mythology",
      qid: "Q42952"
    },
    {
      baseId: 6,
      name: "Trebeta",
      gender: "male",
      category: "mythology",
      qid: "Q572358"
    },
    {
      baseId: 6,
      name: "Tyr",
      gender: "male",
      category: "mythology",
      qid: "Q172713"
    },
    {
      baseId: 6,
      name: "Urðarbrunnr",
      gender: "unknown",
      category: "mythology",
      qid: "Q1458366"
    },
    {
      baseId: 6,
      name: "Urðr",
      gender: "female",
      category: "mythology",
      qid: "Q946913"
    },
    {
      baseId: 6,
      name: "Veraldur",
      gender: "male",
      category: "mythology",
      qid: "Q61000566"
    },
    {
      baseId: 6,
      name: "Verðandi",
      gender: "female",
      category: "mythology",
      qid: "Q917725"
    },
    {
      baseId: 6,
      name: "Viðfinnr",
      gender: "male",
      category: "mythology",
      qid: "Q1621291"
    },
    {
      baseId: 6,
      name: "Váli",
      gender: "male",
      category: "mythology",
      qid: "Q2646624"
    },
    {
      baseId: 6,
      name: "Víðarr",
      gender: "male",
      category: "mythology",
      qid: "Q372614"
    },
    {
      baseId: 6,
      name: "Völsung",
      gender: "male",
      category: "mythology",
      qid: "Q1263694"
    },
    {
      baseId: 6,
      name: "Völsungs",
      gender: "unknown",
      category: "mythology",
      qid: "Q1242790"
    },
    {
      baseId: 6,
      name: "Yule Lads",
      gender: "unknown",
      category: "mythology",
      qid: "Q1715040"
    },
    {
      baseId: 6,
      name: "Árvakr",
      gender: "unknown",
      category: "mythology",
      qid: "Q12344299"
    },
    {
      baseId: 6,
      name: "Ægir",
      gender: "male",
      category: "mythology",
      qid: "Q204927"
    },
    {
      baseId: 6,
      name: "Élivágar",
      gender: "unknown",
      category: "mythology",
      qid: "Q274754"
    },
    {
      baseId: 6,
      name: "Ótr",
      gender: "male",
      category: "mythology",
      qid: "Q1967084"
    },
    {
      baseId: 6,
      name: "Óttar",
      gender: "male",
      category: "mythology",
      qid: "Q2449577"
    },
    {
      baseId: 6,
      name: "Öku-Thor",
      gender: "unknown",
      category: "mythology",
      qid: "Q296494"
    },
    {
      baseId: 6,
      name: "Ölrún",
      gender: "female",
      category: "mythology",
      qid: "Q80190608"
    },
    {
      baseId: 6,
      name: "Örvar-Oddr",
      gender: "male",
      category: "mythology",
      qid: "Q2275382"
    },
    {
      baseId: 6,
      name: "Þorbjörg Lítilvölva",
      gender: "female",
      category: "mythology",
      qid: "Q335816"
    },
    {
      baseId: 6,
      name: "Þorgerðr Hölgabrúðr",
      gender: "female",
      category: "mythology",
      qid: "Q16513995"
    },
    {
      baseId: 6,
      name: "Þrymr",
      gender: "male",
      category: "mythology",
      qid: "Q1123905"
    },
    {
      baseId: 6,
      name: "Þrúðr",
      gender: "female",
      category: "mythology",
      qid: "Q827758"
    }
  ],
  "7": [
    {
      baseId: 7,
      name: "Aba",
      gender: "female",
      category: "mythology",
      qid: "Q304227"
    },
    {
      baseId: 7,
      name: "Abantidas",
      gender: "male",
      category: "ancient_person",
      qid: "Q305524"
    },
    {
      baseId: 7,
      name: "Abarbarea",
      gender: "female",
      category: "mythology",
      qid: "Q279782"
    },
    {
      baseId: 7,
      name: "Aeantides of Lampsacus",
      gender: "male",
      category: "ancient_person",
      qid: "Q403403"
    },
    {
      baseId: 7,
      name: "Aegle",
      gender: "female",
      category: "mythology",
      qid: "Q26276980"
    },
    {
      baseId: 7,
      name: "Aelianus Tacticus",
      gender: "male",
      category: "ancient_person",
      qid: "Q380793"
    },
    {
      baseId: 7,
      name: "Agathon",
      gender: "male",
      category: "ancient_person",
      qid: "Q391497"
    },
    {
      baseId: 7,
      name: "Aglais",
      gender: "female",
      category: "ancient_person",
      qid: "Q83759154"
    },
    {
      baseId: 7,
      name: "Aineades",
      gender: "male",
      category: "ancient_person",
      qid: "Q405957"
    },
    {
      baseId: 7,
      name: "Aison",
      gender: "male",
      category: "ancient_person",
      qid: "Q327857"
    },
    {
      baseId: 7,
      name: "Amalthea",
      gender: "female",
      category: "mythology",
      qid: "Q107785"
    },
    {
      baseId: 7,
      name: "Amphitrite",
      gender: "female",
      category: "mythology",
      qid: "Q180222"
    },
    {
      baseId: 7,
      name: "Anchiroe",
      gender: "female",
      category: "mythology",
      qid: "Q29654988"
    },
    {
      baseId: 7,
      name: "Anchius",
      gender: "male",
      category: "mythology",
      qid: "Q15783253"
    },
    {
      baseId: 7,
      name: "Ancius",
      gender: "unknown",
      category: "mythology",
      qid: "Q3615218"
    },
    {
      baseId: 7,
      name: "Andes",
      gender: "male",
      category: "mythology",
      qid: "Q21548629"
    },
    {
      baseId: 7,
      name: "Anippe",
      gender: "female",
      category: "mythology",
      qid: "Q10411954"
    },
    {
      baseId: 7,
      name: "Anthédon",
      gender: "female",
      category: "mythology",
      qid: "Q21548693"
    },
    {
      baseId: 7,
      name: "Antimachus",
      gender: "male",
      category: "mythology",
      qid: "Q21548750"
    },
    {
      baseId: 7,
      name: "Aphareus",
      gender: "male",
      category: "mythology",
      qid: "Q26806435"
    },
    {
      baseId: 7,
      name: "Apollodorus of Acharnae",
      gender: "male",
      category: "ancient_person",
      qid: "Q328853"
    },
    {
      baseId: 7,
      name: "Areius",
      gender: "male",
      category: "mythology",
      qid: "Q55484966"
    },
    {
      baseId: 7,
      name: "Argeia",
      gender: "female",
      category: "mythology",
      qid: "Q644354"
    },
    {
      baseId: 7,
      name: "Argeus",
      gender: "male",
      category: "mythology",
      qid: "Q15783910"
    },
    {
      baseId: 7,
      name: "Argyra",
      gender: "female",
      category: "mythology",
      qid: "Q3560453"
    },
    {
      baseId: 7,
      name: "Aristophanes",
      gender: "male",
      category: "ancient_person",
      qid: "Q667194"
    },
    {
      baseId: 7,
      name: "Aristotle",
      gender: "male",
      category: "ancient_person",
      qid: "Q868"
    },
    {
      baseId: 7,
      name: "Asia",
      gender: "female",
      category: "mythology",
      qid: "Q605744"
    },
    {
      baseId: 7,
      name: "Asteas",
      gender: "male",
      category: "ancient_person",
      qid: "Q328002"
    },
    {
      baseId: 7,
      name: "Asteria",
      gender: "female",
      category: "mythology",
      qid: "Q18642285"
    },
    {
      baseId: 7,
      name: "Astraeus",
      gender: "male",
      category: "mythology",
      qid: "Q250588"
    },
    {
      baseId: 7,
      name: "Athenaeus",
      gender: "male",
      category: "ancient_person",
      qid: "Q294923"
    },
    {
      baseId: 7,
      name: "Atlas",
      gender: "male",
      category: "mythology",
      qid: "Q130818"
    },
    {
      baseId: 7,
      name: "Batea",
      gender: "female",
      category: "mythology",
      qid: "Q810744"
    },
    {
      baseId: 7,
      name: "Bolbe",
      gender: "female",
      category: "mythology",
      qid: "Q4810860"
    },
    {
      baseId: 7,
      name: "Briareus",
      gender: "male",
      category: "mythology",
      qid: "Q849647"
    },
    {
      baseId: 7,
      name: "Caliadne",
      gender: "female",
      category: "mythology",
      qid: "Q2559167"
    },
    {
      baseId: 7,
      name: "Callirhoe",
      gender: "female",
      category: "mythology",
      qid: "Q1722503"
    },
    {
      baseId: 7,
      name: "Calypso",
      gender: "female",
      category: "mythology",
      qid: "Q48961"
    },
    {
      baseId: 7,
      name: "Cassotis",
      gender: "female",
      category: "mythology",
      qid: "Q1735272"
    },
    {
      baseId: 7,
      name: "Castalia",
      gender: "female",
      category: "mythology",
      qid: "Q170053"
    },
    {
      baseId: 7,
      name: "Celusa",
      gender: "female",
      category: "mythology",
      qid: "Q57157139"
    },
    {
      baseId: 7,
      name: "Chares",
      gender: "male",
      category: "ancient_person",
      qid: "Q1063128"
    },
    {
      baseId: 7,
      name: "Charitaios",
      gender: "male",
      category: "ancient_person",
      qid: "Q1063233"
    },
    {
      baseId: 7,
      name: "Chlidanope",
      gender: "female",
      category: "mythology",
      qid: "Q18643251"
    },
    {
      baseId: 7,
      name: "Cisseis",
      gender: "female",
      category: "mythology",
      qid: "Q57521633"
    },
    {
      baseId: 7,
      name: "Clanis",
      gender: "male",
      category: "mythology",
      qid: "Q57664165"
    },
    {
      baseId: 7,
      name: "Cleocharia",
      gender: "female",
      category: "mythology",
      qid: "Q2980753"
    },
    {
      baseId: 7,
      name: "Cleone",
      gender: "female",
      category: "mythology",
      qid: "Q2754601"
    },
    {
      baseId: 7,
      name: "Cnossia",
      gender: "female",
      category: "mythology",
      qid: "Q10546716"
    },
    {
      baseId: 7,
      name: "Coeus",
      gender: "male",
      category: "mythology",
      qid: "Q182837"
    },
    {
      baseId: 7,
      name: "Cottus",
      gender: "male",
      category: "mythology",
      qid: "Q3318918"
    },
    {
      baseId: 7,
      name: "Crenaeus",
      gender: "male",
      category: "mythology",
      qid: "Q124316484"
    },
    {
      baseId: 7,
      name: "Creusa",
      gender: "female",
      category: "mythology",
      qid: "Q1232622"
    },
    {
      baseId: 7,
      name: "Crocale",
      gender: "female",
      category: "mythology",
      qid: "Q122067349"
    },
    {
      baseId: 7,
      name: "Cronus",
      gender: "male",
      category: "mythology",
      qid: "Q44204"
    },
    {
      baseId: 7,
      name: "Cyane",
      gender: "female",
      category: "mythology",
      qid: "Q1423058"
    },
    {
      baseId: 7,
      name: "Cyllarus",
      gender: "male",
      category: "mythology",
      qid: "Q3676711"
    },
    {
      baseId: 7,
      name: "Cyllene",
      gender: "female",
      category: "mythology",
      qid: "Q7595427"
    },
    {
      baseId: 7,
      name: "Daphne",
      gender: "female",
      category: "mythology",
      qid: "Q194015"
    },
    {
      baseId: 7,
      name: "Daphnis",
      gender: "male",
      category: "mythology",
      qid: "Q122227110"
    },
    {
      baseId: 7,
      name: "Daulis",
      gender: "female",
      category: "mythology",
      qid: "Q17461398"
    },
    {
      baseId: 7,
      name: "Deiniades",
      gender: "male",
      category: "ancient_person",
      qid: "Q1183292"
    },
    {
      baseId: 7,
      name: "Demoleon",
      gender: "male",
      category: "mythology",
      qid: "Q59772137"
    },
    {
      baseId: 7,
      name: "Demosthenes",
      gender: "male",
      category: "ancient_person",
      qid: "Q117253"
    },
    {
      baseId: 7,
      name: "Dionysicles of Miletus",
      gender: "male",
      category: "ancient_person",
      qid: "Q1226971"
    },
    {
      baseId: 7,
      name: "Dipylon Master",
      gender: "male",
      category: "ancient_person",
      qid: "Q943544"
    },
    {
      baseId: 7,
      name: "Drosera",
      gender: "female",
      category: "mythology",
      qid: "Q5308511"
    },
    {
      baseId: 7,
      name: "Elatus",
      gender: "male",
      category: "mythology",
      qid: "Q60300036"
    },
    {
      baseId: 7,
      name: "Elbows Out",
      gender: "unknown",
      category: "ancient_person",
      qid: "Q1325382"
    },
    {
      baseId: 7,
      name: "Elymus",
      gender: "male",
      category: "mythology",
      qid: "Q65054738"
    },
    {
      baseId: 7,
      name: "Epainetos",
      gender: "male",
      category: "ancient_person",
      qid: "Q1029554"
    },
    {
      baseId: 7,
      name: "Ephydatia",
      gender: "female",
      category: "mythology",
      qid: "Q5820239"
    },
    {
      baseId: 7,
      name: "Epicharmus of Kos",
      gender: "male",
      category: "ancient_person",
      qid: "Q312410"
    },
    {
      baseId: 7,
      name: "Epiktetos",
      gender: "male",
      category: "ancient_person",
      qid: "Q938972"
    },
    {
      baseId: 7,
      name: "Euboea",
      gender: "female",
      category: "mythology",
      qid: "Q1372109"
    },
    {
      baseId: 7,
      name: "Eucheiros",
      gender: "male",
      category: "ancient_person",
      qid: "Q974212"
    },
    {
      baseId: 7,
      name: "Euphronios",
      gender: "male",
      category: "ancient_person",
      qid: "Q358508"
    },
    {
      baseId: 7,
      name: "Eurryroe",
      gender: "female",
      category: "mythology",
      qid: "Q106795677"
    },
    {
      baseId: 7,
      name: "Eurynome",
      gender: "female",
      category: "mythology",
      qid: "Q548099"
    },
    {
      baseId: 7,
      name: "Eurynomus",
      gender: "male",
      category: "mythology",
      qid: "Q61046327"
    },
    {
      baseId: 7,
      name: "Eurytion",
      gender: "male",
      category: "mythology",
      qid: "Q124357578"
    },
    {
      baseId: 7,
      name: "Euthymides",
      gender: "male",
      category: "ancient_person",
      qid: "Q560260"
    },
    {
      baseId: 7,
      name: "Evadne",
      gender: "female",
      category: "mythology",
      qid: "Q1259960"
    },
    {
      baseId: 7,
      name: "Glaucia",
      gender: "female",
      category: "mythology",
      qid: "Q5567263"
    },
    {
      baseId: 7,
      name: "Glaukia",
      gender: "female",
      category: "mythology",
      qid: "Q126890351"
    },
    {
      baseId: 7,
      name: "Gyges",
      gender: "male",
      category: "mythology",
      qid: "Q1187298"
    },
    {
      baseId: 7,
      name: "Helops",
      gender: "unknown",
      category: "mythology",
      qid: "Q125968721"
    },
    {
      baseId: 7,
      name: "Hermonax",
      gender: "male",
      category: "ancient_person",
      qid: "Q328215"
    },
    {
      baseId: 7,
      name: "Hesione",
      gender: "female",
      category: "mythology",
      qid: "Q669635"
    },
    {
      baseId: 7,
      name: "Hylaeus",
      gender: "male",
      category: "mythology",
      qid: "Q124559102"
    },
    {
      baseId: 7,
      name: "Hyles",
      gender: "male",
      category: "mythology",
      qid: "Q124422562"
    },
    {
      baseId: 7,
      name: "Hylonome",
      gender: "female",
      category: "mythology",
      qid: "Q391070"
    },
    {
      baseId: 7,
      name: "Inachides",
      gender: "unknown",
      category: "mythology",
      qid: "Q126898460"
    },
    {
      baseId: 7,
      name: "Iphinous",
      gender: "male",
      category: "mythology",
      qid: "Q126087412"
    },
    {
      baseId: 7,
      name: "Ismenis",
      gender: "female",
      category: "mythology",
      qid: "Q6085037"
    },
    {
      baseId: 7,
      name: "Kalligeneia",
      gender: "female",
      category: "mythology",
      qid: "Q126911214"
    },
    {
      baseId: 7,
      name: "Kalliroe",
      gender: "female",
      category: "mythology",
      qid: "Q126911246"
    },
    {
      baseId: 7,
      name: "Kealtes",
      gender: "male",
      category: "ancient_person",
      qid: "Q1303181"
    },
    {
      baseId: 7,
      name: "Kleitias",
      gender: "male",
      category: "ancient_person",
      qid: "Q722963"
    },
    {
      baseId: 7,
      name: "Kretheis",
      gender: "female",
      category: "mythology",
      qid: "Q126709504"
    },
    {
      baseId: 7,
      name: "Langia",
      gender: "female",
      category: "mythology",
      qid: "Q12754452"
    },
    {
      baseId: 7,
      name: "Latreus",
      gender: "male",
      category: "mythology",
      qid: "Q107552580"
    },
    {
      baseId: 7,
      name: "Lelantos",
      gender: "male",
      category: "mythology",
      qid: "Q3270327"
    },
    {
      baseId: 7,
      name: "Lilaea",
      gender: "female",
      category: "mythology",
      qid: "Q460094"
    },
    {
      baseId: 7,
      name: "Limnaee",
      gender: "female",
      category: "mythology",
      qid: "Q1825523"
    },
    {
      baseId: 7,
      name: "Liriope",
      gender: "female",
      category: "mythology",
      qid: "Q1815682"
    },
    {
      baseId: 7,
      name: "Lotis",
      gender: "female",
      category: "mythology",
      qid: "Q2465677"
    },
    {
      baseId: 7,
      name: "Lycabas",
      gender: "male",
      category: "mythology",
      qid: "Q124821370"
    },
    {
      baseId: 7,
      name: "Lycotas",
      gender: "male",
      category: "mythology",
      qid: "Q124767454"
    },
    {
      baseId: 7,
      name: "Lycus",
      gender: "male",
      category: "mythology",
      qid: "Q124654213"
    },
    {
      baseId: 7,
      name: "Lydos",
      gender: "male",
      category: "ancient_person",
      qid: "Q946281"
    },
    {
      baseId: 7,
      name: "Lysis of Taras",
      gender: "male",
      category: "ancient_person",
      qid: "Q720939"
    },
    {
      baseId: 7,
      name: "Makron",
      gender: "male",
      category: "ancient_person",
      qid: "Q427706"
    },
    {
      baseId: 7,
      name: "Melite",
      gender: "female",
      category: "mythology",
      qid: "Q126833753"
    },
    {
      baseId: 7,
      name: "Merope",
      gender: "female",
      category: "mythology",
      qid: "Q427122"
    },
    {
      baseId: 7,
      name: "Messeis",
      gender: "female",
      category: "mythology",
      qid: "Q107313059"
    },
    {
      baseId: 7,
      name: "Metagenes",
      gender: "male",
      category: "ancient_person",
      qid: "Q1176269"
    },
    {
      baseId: 7,
      name: "Methone",
      gender: "female",
      category: "mythology",
      qid: "Q3855694"
    },
    {
      baseId: 7,
      name: "Metis",
      gender: "female",
      category: "mythology",
      qid: "Q190565"
    },
    {
      baseId: 7,
      name: "Metope",
      gender: "female",
      category: "mythology",
      qid: "Q1237258"
    },
    {
      baseId: 7,
      name: "Mimas",
      gender: "male",
      category: "mythology",
      qid: "Q125813526"
    },
    {
      baseId: 7,
      name: "Mis",
      gender: "male",
      category: "ancient_person",
      qid: "Q138447956"
    },
    {
      baseId: 7,
      name: "Mnemosyne",
      gender: "female",
      category: "mythology",
      qid: "Q102884"
    },
    {
      baseId: 7,
      name: "Mnesilochus",
      gender: "male",
      category: "ancient_person",
      qid: "Q1178108"
    },
    {
      baseId: 7,
      name: "Myrtoessa",
      gender: "female",
      category: "mythology",
      qid: "Q10592638"
    },
    {
      baseId: 7,
      name: "Neaira",
      gender: "female",
      category: "ancient_person",
      qid: "Q431067"
    },
    {
      baseId: 7,
      name: "Nearchos",
      gender: "male",
      category: "ancient_person",
      qid: "Q330410"
    },
    {
      baseId: 7,
      name: "Nemea",
      gender: "female",
      category: "mythology",
      qid: "Q1977078"
    },
    {
      baseId: 7,
      name: "Nemesis",
      gender: "female",
      category: "mythology",
      qid: "Q185747"
    },
    {
      baseId: 7,
      name: "Nessus",
      gender: "unknown",
      category: "mythology",
      qid: "Q466866"
    },
    {
      baseId: 7,
      name: "Nicocles",
      gender: "male",
      category: "ancient_person",
      qid: "Q715078"
    },
    {
      baseId: 7,
      name: "Nikosthenes",
      gender: "male",
      category: "ancient_person",
      qid: "Q275165"
    },
    {
      baseId: 7,
      name: "Oceanus",
      gender: "male",
      category: "mythology",
      qid: "Q161419"
    },
    {
      baseId: 7,
      name: "Oenone",
      gender: "female",
      category: "mythology",
      qid: "Q858671"
    },
    {
      baseId: 7,
      name: "Oikopheles",
      gender: "male",
      category: "ancient_person",
      qid: "Q1356545"
    },
    {
      baseId: 7,
      name: "Olymbros",
      gender: "unknown",
      category: "mythology",
      qid: "Q126552519"
    },
    {
      baseId: 7,
      name: "Onesimos",
      gender: "male",
      category: "ancient_person",
      qid: "Q475054"
    },
    {
      baseId: 7,
      name: "Orseis",
      gender: "female",
      category: "mythology",
      qid: "Q979627"
    },
    {
      baseId: 7,
      name: "Ostasos",
      gender: "unknown",
      category: "mythology",
      qid: "Q126552589"
    },
    {
      baseId: 7,
      name: "Pallas",
      gender: "male",
      category: "mythology",
      qid: "Q457294"
    },
    {
      baseId: 7,
      name: "Paria",
      gender: "female",
      category: "mythology",
      qid: "Q12757019"
    },
    {
      baseId: 7,
      name: "Pegasis",
      gender: "female",
      category: "mythology",
      qid: "Q10622216"
    },
    {
      baseId: 7,
      name: "Peitho",
      gender: "female",
      category: "mythology",
      qid: "Q611171"
    },
    {
      baseId: 7,
      name: "Periander",
      gender: "male",
      category: "ancient_person",
      qid: "Q11941122"
    },
    {
      baseId: 7,
      name: "Periboea",
      gender: "female",
      category: "mythology",
      qid: "Q17197552"
    },
    {
      baseId: 7,
      name: "Perses",
      gender: "male",
      category: "mythology",
      qid: "Q660924"
    },
    {
      baseId: 7,
      name: "Phaenias of Eresus",
      gender: "male",
      category: "ancient_person",
      qid: "Q943529"
    },
    {
      baseId: 7,
      name: "Pharmakeia",
      gender: "unknown",
      category: "mythology",
      qid: "Q126710308"
    },
    {
      baseId: 7,
      name: "Philyra",
      gender: "female",
      category: "mythology",
      qid: "Q398524"
    },
    {
      baseId: 7,
      name: "Phlegraeus",
      gender: "male",
      category: "mythology",
      qid: "Q126118957"
    },
    {
      baseId: 7,
      name: "Phocylides",
      gender: "male",
      category: "ancient_person",
      qid: "Q972799"
    },
    {
      baseId: 7,
      name: "Phoebe",
      gender: "female",
      category: "mythology",
      qid: "Q183281"
    },
    {
      baseId: 7,
      name: "Phoenissa",
      gender: "female",
      category: "mythology",
      qid: "Q106808293"
    },
    {
      baseId: 7,
      name: "Pirene",
      gender: "female",
      category: "mythology",
      qid: "Q4843985"
    },
    {
      baseId: 7,
      name: "Pitane",
      gender: "female",
      category: "mythology",
      qid: "Q25393568"
    },
    {
      baseId: 7,
      name: "Plataea",
      gender: "female",
      category: "mythology",
      qid: "Q6078094"
    },
    {
      baseId: 7,
      name: "Pleione",
      gender: "female",
      category: "mythology",
      qid: "Q463865"
    },
    {
      baseId: 7,
      name: "Plouto",
      gender: "female",
      category: "mythology",
      qid: "Q662968"
    },
    {
      baseId: 7,
      name: "Polkan",
      gender: "male",
      category: "mythology",
      qid: "Q1990860"
    },
    {
      baseId: 7,
      name: "Polyxo",
      gender: "female",
      category: "mythology",
      qid: "Q2103187"
    },
    {
      baseId: 7,
      name: "Praxithea",
      gender: "female",
      category: "mythology",
      qid: "Q13058657"
    },
    {
      baseId: 7,
      name: "Pronoe",
      gender: "female",
      category: "mythology",
      qid: "Q2112864"
    },
    {
      baseId: 7,
      name: "Pylenor",
      gender: "male",
      category: "mythology",
      qid: "Q16327570"
    },
    {
      baseId: 7,
      name: "Pyracmus",
      gender: "male",
      category: "mythology",
      qid: "Q125274680"
    },
    {
      baseId: 7,
      name: "Rhodos",
      gender: "female",
      category: "mythology",
      qid: "Q641286"
    },
    {
      baseId: 7,
      name: "Rhoecus",
      gender: "male",
      category: "mythology",
      qid: "Q12758406"
    },
    {
      baseId: 7,
      name: "Rhoetus",
      gender: "male",
      category: "mythology",
      qid: "Q124962285"
    },
    {
      baseId: 7,
      name: "Sakonides",
      gender: "male",
      category: "ancient_person",
      qid: "Q1331545"
    },
    {
      baseId: 7,
      name: "Salmacis",
      gender: "female",
      category: "mythology",
      qid: "Q828579"
    },
    {
      baseId: 7,
      name: "Samia",
      gender: "female",
      category: "mythology",
      qid: "Q12884308"
    },
    {
      baseId: 7,
      name: "Sinope",
      gender: "female",
      category: "mythology",
      qid: "Q1539539"
    },
    {
      baseId: 7,
      name: "Skythes",
      gender: "male",
      category: "ancient_person",
      qid: "Q1297344"
    },
    {
      baseId: 7,
      name: "Smikros",
      gender: "male",
      category: "ancient_person",
      qid: "Q510558"
    },
    {
      baseId: 7,
      name: "Stilbe",
      gender: "unknown",
      category: "mythology",
      qid: "Q1576404"
    },
    {
      baseId: 7,
      name: "Stilbon",
      gender: "male",
      category: "mythology",
      qid: "Q7616947"
    },
    {
      baseId: 7,
      name: "Strophia",
      gender: "female",
      category: "mythology",
      qid: "Q3661549"
    },
    {
      baseId: 7,
      name: "Styphelus",
      gender: "male",
      category: "mythology",
      qid: "Q125377972"
    },
    {
      baseId: 7,
      name: "Styx",
      gender: "female",
      category: "mythology",
      qid: "Q542758"
    },
    {
      baseId: 7,
      name: "Symaithis",
      gender: "female",
      category: "mythology",
      qid: "Q28224106"
    },
    {
      baseId: 7,
      name: "Theodorus",
      gender: "male",
      category: "ancient_person",
      qid: "Q139020003"
    },
    {
      baseId: 7,
      name: "Thronia",
      gender: "female",
      category: "mythology",
      qid: "Q135921774"
    },
    {
      baseId: 7,
      name: "Thyia",
      gender: "female",
      category: "mythology",
      qid: "Q949266"
    },
    {
      baseId: 7,
      name: "Tiasa",
      gender: "female",
      category: "mythology",
      qid: "Q7800294"
    },
    {
      baseId: 7,
      name: "Tyche",
      gender: "female",
      category: "mythology",
      qid: "Q213440"
    },
    {
      baseId: 7,
      name: "Zeuxo",
      gender: "female",
      category: "mythology",
      qid: "Q197039"
    },
    {
      baseId: 7,
      name: "mother of Aetolus",
      gender: "female",
      category: "mythology",
      qid: "Q122964728"
    }
  ],
  "8": [
    {
      baseId: 8,
      name: "Abaris",
      gender: "male",
      category: "mythology",
      qid: "Q305570"
    },
    {
      baseId: 8,
      name: "Abellio",
      gender: "male",
      category: "mythology",
      qid: "Q318682"
    },
    {
      baseId: 8,
      name: "Acmon",
      gender: "male",
      category: "mythology",
      qid: "Q420261"
    },
    {
      baseId: 8,
      name: "Acron",
      gender: "male",
      category: "mythology",
      qid: "Q16160516"
    },
    {
      baseId: 8,
      name: "Aeternitas",
      gender: "female",
      category: "mythology",
      qid: "Q381914"
    },
    {
      baseId: 8,
      name: "Agdistis",
      gender: "unknown",
      category: "mythology",
      qid: "Q392120"
    },
    {
      baseId: 8,
      name: "Aius Locutius",
      gender: "male",
      category: "mythology",
      qid: "Q411066"
    },
    {
      baseId: 8,
      name: "Ambrose",
      gender: "male",
      category: "ancient_person",
      qid: "Q43689"
    },
    {
      baseId: 8,
      name: "Amulius",
      gender: "male",
      category: "mythology",
      qid: "Q889656"
    },
    {
      baseId: 8,
      name: "Ancaria",
      gender: "female",
      category: "mythology",
      qid: "Q3615151"
    },
    {
      baseId: 8,
      name: "Anextiomarus",
      gender: "male",
      category: "mythology",
      qid: "Q529652"
    },
    {
      baseId: 8,
      name: "Anna",
      gender: "female",
      category: "mythology",
      qid: "Q559304"
    },
    {
      baseId: 8,
      name: "Anna Perenna",
      gender: "female",
      category: "mythology",
      qid: "Q539796"
    },
    {
      baseId: 8,
      name: "Annona",
      gender: "female",
      category: "mythology",
      qid: "Q581656"
    },
    {
      baseId: 8,
      name: "Antevorta",
      gender: "female",
      category: "mythology",
      qid: "Q1250207"
    },
    {
      baseId: 8,
      name: "Antoninus Pius",
      gender: "male",
      category: "ancient_person",
      qid: "Q1429"
    },
    {
      baseId: 8,
      name: "Anxur",
      gender: "male",
      category: "mythology",
      qid: "Q26690196"
    },
    {
      baseId: 8,
      name: "Apollo",
      gender: "male",
      category: "mythology",
      qid: "Q900649"
    },
    {
      baseId: 8,
      name: "Apotropaei",
      gender: "unknown",
      category: "mythology",
      qid: "Q25338401"
    },
    {
      baseId: 8,
      name: "Appias",
      gender: "unknown",
      category: "mythology",
      qid: "Q56036020"
    },
    {
      baseId: 8,
      name: "Aquilon",
      gender: "male",
      category: "mythology",
      qid: "Q2859290"
    },
    {
      baseId: 8,
      name: "Arrian",
      gender: "male",
      category: "ancient_person",
      qid: "Q31845"
    },
    {
      baseId: 8,
      name: "Ascanius",
      gender: "male",
      category: "mythology",
      qid: "Q655566"
    },
    {
      baseId: 8,
      name: "Athanasius of Alexandria",
      gender: "male",
      category: "ancient_person",
      qid: "Q44024"
    },
    {
      baseId: 8,
      name: "Augustine of Hippo",
      gender: "male",
      category: "ancient_person",
      qid: "Q8018"
    },
    {
      baseId: 8,
      name: "Augustus",
      gender: "male",
      category: "ancient_person",
      qid: "Q1405"
    },
    {
      baseId: 8,
      name: "Aulus Terentius Varro",
      gender: "male",
      category: "ancient_person",
      qid: "Q141723"
    },
    {
      baseId: 8,
      name: "Auster",
      gender: "male",
      category: "mythology",
      qid: "Q611138"
    },
    {
      baseId: 8,
      name: "Aëtius of Antioch",
      gender: "male",
      category: "ancient_person",
      qid: "Q16442"
    },
    {
      baseId: 8,
      name: "Balbinus",
      gender: "male",
      category: "ancient_person",
      qid: "Q1805"
    },
    {
      baseId: 8,
      name: "Bellona",
      gender: "female",
      category: "mythology",
      qid: "Q207234"
    },
    {
      baseId: 8,
      name: "Bona Dea",
      gender: "female",
      category: "mythology",
      qid: "Q724896"
    },
    {
      baseId: 8,
      name: "Caca",
      gender: "female",
      category: "mythology",
      qid: "Q1024984"
    },
    {
      baseId: 8,
      name: "Cacus",
      gender: "male",
      category: "mythology",
      qid: "Q754686"
    },
    {
      baseId: 8,
      name: "Caligula",
      gender: "male",
      category: "ancient_person",
      qid: "Q1409"
    },
    {
      baseId: 8,
      name: "Capricornus",
      gender: "unknown",
      category: "mythology",
      qid: "Q11294655"
    },
    {
      baseId: 8,
      name: "Capys",
      gender: "male",
      category: "mythology",
      qid: "Q20018046"
    },
    {
      baseId: 8,
      name: "Caracalla",
      gender: "male",
      category: "ancient_person",
      qid: "Q1446"
    },
    {
      baseId: 8,
      name: "Caritas",
      gender: "female",
      category: "mythology",
      qid: "Q128715023"
    },
    {
      baseId: 8,
      name: "Catiline",
      gender: "male",
      category: "ancient_person",
      qid: "Q75826"
    },
    {
      baseId: 8,
      name: "Cicero",
      gender: "male",
      category: "ancient_person",
      qid: "Q1541"
    },
    {
      baseId: 8,
      name: "Cissonius",
      gender: "male",
      category: "mythology",
      qid: "Q1093253"
    },
    {
      baseId: 8,
      name: "Claudius",
      gender: "male",
      category: "ancient_person",
      qid: "Q1411"
    },
    {
      baseId: 8,
      name: "Clement I",
      gender: "male",
      category: "ancient_person",
      qid: "Q42887"
    },
    {
      baseId: 8,
      name: "Cloacina",
      gender: "female",
      category: "mythology",
      qid: "Q2879107"
    },
    {
      baseId: 8,
      name: "Commodus",
      gender: "male",
      category: "ancient_person",
      qid: "Q1434"
    },
    {
      baseId: 8,
      name: "Constantine the Great",
      gender: "male",
      category: "ancient_person",
      qid: "Q8413"
    },
    {
      baseId: 8,
      name: "Cornelius Nepos",
      gender: "male",
      category: "ancient_person",
      qid: "Q109594"
    },
    {
      baseId: 8,
      name: "Cybele",
      gender: "female",
      category: "mythology",
      qid: "Q188236"
    },
    {
      baseId: 8,
      name: "Cyril of Alexandria",
      gender: "male",
      category: "ancient_person",
      qid: "Q44079"
    },
    {
      baseId: 8,
      name: "Decius",
      gender: "male",
      category: "ancient_person",
      qid: "Q1830"
    },
    {
      baseId: 8,
      name: "Deiopea",
      gender: "female",
      category: "mythology",
      qid: "Q3704814"
    },
    {
      baseId: 8,
      name: "Deverra",
      gender: "female",
      category: "mythology",
      qid: "Q3025430"
    },
    {
      baseId: 8,
      name: "Didius Julianus",
      gender: "male",
      category: "ancient_person",
      qid: "Q1440"
    },
    {
      baseId: 8,
      name: "Dies",
      gender: "female",
      category: "mythology",
      qid: "Q18206465"
    },
    {
      baseId: 8,
      name: "Diocletian",
      gender: "male",
      category: "ancient_person",
      qid: "Q43107"
    },
    {
      baseId: 8,
      name: "Diogenes Laërtius",
      gender: "male",
      category: "ancient_person",
      qid: "Q59138"
    },
    {
      baseId: 8,
      name: "Disciplina",
      gender: "female",
      category: "mythology",
      qid: "Q3495260"
    },
    {
      baseId: 8,
      name: "Domitian",
      gender: "male",
      category: "ancient_person",
      qid: "Q1423"
    },
    {
      baseId: 8,
      name: "Domitius Marsus",
      gender: "male",
      category: "ancient_person",
      qid: "Q8809"
    },
    {
      baseId: 8,
      name: "Edusa",
      gender: "female",
      category: "mythology",
      qid: "Q3622563"
    },
    {
      baseId: 8,
      name: "Elagabalus",
      gender: "male",
      category: "ancient_person",
      qid: "Q1762"
    },
    {
      baseId: 8,
      name: "Engratia",
      gender: "female",
      category: "ancient_person",
      qid: "Q32313"
    },
    {
      baseId: 8,
      name: "Eusebius of Caesarea",
      gender: "male",
      category: "ancient_person",
      qid: "Q142999"
    },
    {
      baseId: 8,
      name: "Falacer",
      gender: "male",
      category: "mythology",
      qid: "Q3738525"
    },
    {
      baseId: 8,
      name: "Faustina",
      gender: "female",
      category: "ancient_person",
      qid: "Q63533"
    },
    {
      baseId: 8,
      name: "Flavius Victor",
      gender: "male",
      category: "ancient_person",
      qid: "Q18874"
    },
    {
      baseId: 8,
      name: "Flora",
      gender: "female",
      category: "mythology",
      qid: "Q209644"
    },
    {
      baseId: 8,
      name: "Forculus",
      gender: "male",
      category: "mythology",
      qid: "Q18548363"
    },
    {
      baseId: 8,
      name: "Gaius Cornelius Gallus",
      gender: "male",
      category: "ancient_person",
      qid: "Q8825"
    },
    {
      baseId: 8,
      name: "Gaius Julius Iullus",
      gender: "male",
      category: "ancient_person",
      qid: "Q138217"
    },
    {
      baseId: 8,
      name: "Gaius Maecenas",
      gender: "male",
      category: "ancient_person",
      qid: "Q8833"
    },
    {
      baseId: 8,
      name: "Gaius Maecenas Melissus",
      gender: "male",
      category: "ancient_person",
      qid: "Q8800"
    },
    {
      baseId: 8,
      name: "Gaius Mucius Scaevola",
      gender: "male",
      category: "mythology",
      qid: "Q312660"
    },
    {
      baseId: 8,
      name: "Gaius Valgius Rufus",
      gender: "male",
      category: "ancient_person",
      qid: "Q8817"
    },
    {
      baseId: 8,
      name: "Galba",
      gender: "male",
      category: "ancient_person",
      qid: "Q1414"
    },
    {
      baseId: 8,
      name: "Galen",
      gender: "male",
      category: "ancient_person",
      qid: "Q8778"
    },
    {
      baseId: 8,
      name: "Garamantis",
      gender: "female",
      category: "mythology",
      qid: "Q1493870"
    },
    {
      baseId: 8,
      name: "Gnaeus Domitius Calvinus",
      gender: "male",
      category: "ancient_person",
      qid: "Q63447"
    },
    {
      baseId: 8,
      name: "Gordian I",
      gender: "male",
      category: "ancient_person",
      qid: "Q1782"
    },
    {
      baseId: 8,
      name: "Gordian II",
      gender: "male",
      category: "ancient_person",
      qid: "Q1803"
    },
    {
      baseId: 8,
      name: "Gordian III",
      gender: "male",
      category: "ancient_person",
      qid: "Q1812"
    },
    {
      baseId: 8,
      name: "Gregory of Nazianzus",
      gender: "male",
      category: "ancient_person",
      qid: "Q44011"
    },
    {
      baseId: 8,
      name: "Hadrian",
      gender: "male",
      category: "ancient_person",
      qid: "Q1427"
    },
    {
      baseId: 8,
      name: "Hercules",
      gender: "male",
      category: "mythology",
      qid: "Q240679"
    },
    {
      baseId: 8,
      name: "Horace",
      gender: "male",
      category: "ancient_person",
      qid: "Q6197"
    },
    {
      baseId: 8,
      name: "Iapyx",
      gender: "male",
      category: "mythology",
      qid: "Q1180888"
    },
    {
      baseId: 8,
      name: "Ignatius of Antioch",
      gender: "male",
      category: "ancient_person",
      qid: "Q44170"
    },
    {
      baseId: 8,
      name: "Josephus",
      gender: "male",
      category: "ancient_person",
      qid: "Q134461"
    },
    {
      baseId: 8,
      name: "Jovian",
      gender: "male",
      category: "ancient_person",
      qid: "Q34074"
    },
    {
      baseId: 8,
      name: "Julia the Elder",
      gender: "female",
      category: "ancient_person",
      qid: "Q2259"
    },
    {
      baseId: 8,
      name: "Julian",
      gender: "male",
      category: "ancient_person",
      qid: "Q33941"
    },
    {
      baseId: 8,
      name: "Julius Caesar",
      gender: "male",
      category: "ancient_person",
      qid: "Q1048"
    },
    {
      baseId: 8,
      name: "Julius I",
      gender: "male",
      category: "ancient_person",
      qid: "Q103101"
    },
    {
      baseId: 8,
      name: "Julius Nepos",
      gender: "male",
      category: "ancient_person",
      qid: "Q103860"
    },
    {
      baseId: 8,
      name: "Junius Rusticus",
      gender: "male",
      category: "ancient_person",
      qid: "Q18999"
    },
    {
      baseId: 8,
      name: "Juturna",
      gender: "female",
      category: "mythology",
      qid: "Q139448"
    },
    {
      baseId: 8,
      name: "Latinus",
      gender: "male",
      category: "mythology",
      qid: "Q779406"
    },
    {
      baseId: 8,
      name: "Lavinia",
      gender: "female",
      category: "mythology",
      qid: "Q1137364"
    },
    {
      baseId: 8,
      name: "Lawrence of Rome",
      gender: "male",
      category: "ancient_person",
      qid: "Q17590"
    },
    {
      baseId: 8,
      name: "Leo I",
      gender: "male",
      category: "ancient_person",
      qid: "Q43954"
    },
    {
      baseId: 8,
      name: "Liber",
      gender: "male",
      category: "mythology",
      qid: "Q1145491"
    },
    {
      baseId: 8,
      name: "Libera",
      gender: "female",
      category: "mythology",
      qid: "Q2633166"
    },
    {
      baseId: 8,
      name: "Linus",
      gender: "male",
      category: "ancient_person",
      qid: "Q47144"
    },
    {
      baseId: 8,
      name: "Lucifer",
      gender: "male",
      category: "mythology",
      qid: "Q4270105"
    },
    {
      baseId: 8,
      name: "Lucius Domitius Ahenobarbus",
      gender: "male",
      category: "ancient_person",
      qid: "Q120122"
    },
    {
      baseId: 8,
      name: "Lucius Neratius Priscus",
      gender: "male",
      category: "ancient_person",
      qid: "Q63389"
    },
    {
      baseId: 8,
      name: "Lucius Tarutius Firmanus",
      gender: "male",
      category: "ancient_person",
      qid: "Q138724"
    },
    {
      baseId: 8,
      name: "Lucius Varius Rufus",
      gender: "male",
      category: "ancient_person",
      qid: "Q8820"
    },
    {
      baseId: 8,
      name: "Lucius Verus",
      gender: "male",
      category: "ancient_person",
      qid: "Q1433"
    },
    {
      baseId: 8,
      name: "Macarius of Egypt",
      gender: "male",
      category: "ancient_person",
      qid: "Q43920"
    },
    {
      baseId: 8,
      name: "Macrinus",
      gender: "male",
      category: "ancient_person",
      qid: "Q1752"
    },
    {
      baseId: 8,
      name: "Marcellus I",
      gender: "male",
      category: "ancient_person",
      qid: "Q102131"
    },
    {
      baseId: 8,
      name: "Marcus Aurelius",
      gender: "male",
      category: "ancient_person",
      qid: "Q1430"
    },
    {
      baseId: 8,
      name: "Marcus Fulvius Paetinus",
      gender: "male",
      category: "ancient_person",
      qid: "Q135279"
    },
    {
      baseId: 8,
      name: "Mark Antony",
      gender: "male",
      category: "ancient_person",
      qid: "Q51673"
    },
    {
      baseId: 8,
      name: "Mark the Evangelist",
      gender: "male",
      category: "ancient_person",
      qid: "Q31966"
    },
    {
      baseId: 8,
      name: "Martial",
      gender: "male",
      category: "ancient_person",
      qid: "Q2098"
    },
    {
      baseId: 8,
      name: "Maximinus Thrax",
      gender: "male",
      category: "ancient_person",
      qid: "Q1777"
    },
    {
      baseId: 8,
      name: "Mellona",
      gender: "female",
      category: "mythology",
      qid: "Q3142105"
    },
    {
      baseId: 8,
      name: "Mercury",
      gender: "male",
      category: "mythology",
      qid: "Q1150"
    },
    {
      baseId: 8,
      name: "Nero",
      gender: "male",
      category: "ancient_person",
      qid: "Q1413"
    },
    {
      baseId: 8,
      name: "Nerva",
      gender: "male",
      category: "ancient_person",
      qid: "Q1424"
    },
    {
      baseId: 8,
      name: "Numitor",
      gender: "male",
      category: "mythology",
      qid: "Q660623"
    },
    {
      baseId: 8,
      name: "Ocnus",
      gender: "male",
      category: "mythology",
      qid: "Q1929263"
    },
    {
      baseId: 8,
      name: "Otho",
      gender: "male",
      category: "ancient_person",
      qid: "Q1416"
    },
    {
      baseId: 8,
      name: "Ovid",
      gender: "male",
      category: "ancient_person",
      qid: "Q7198"
    },
    {
      baseId: 8,
      name: "Owl of Athena",
      gender: "unknown",
      category: "mythology",
      qid: "Q1196035"
    },
    {
      baseId: 8,
      name: "Pales",
      gender: "unknown",
      category: "mythology",
      qid: "Q654604"
    },
    {
      baseId: 8,
      name: "Paul the Apostle",
      gender: "male",
      category: "ancient_person",
      qid: "Q9200"
    },
    {
      baseId: 8,
      name: "Pavor",
      gender: "male",
      category: "mythology",
      qid: "Q12137419"
    },
    {
      baseId: 8,
      name: "Pax",
      gender: "female",
      category: "mythology",
      qid: "Q1132674"
    },
    {
      baseId: 8,
      name: "Pertinax",
      gender: "male",
      category: "ancient_person",
      qid: "Q1436"
    },
    {
      baseId: 8,
      name: "Philip the Arab",
      gender: "male",
      category: "ancient_person",
      qid: "Q1817"
    },
    {
      baseId: 8,
      name: "Philotis",
      gender: "female",
      category: "mythology",
      qid: "Q7186297"
    },
    {
      baseId: 8,
      name: "Phlegon of Tralles",
      gender: "male",
      category: "ancient_person",
      qid: "Q138531"
    },
    {
      baseId: 8,
      name: "Plautus",
      gender: "male",
      category: "ancient_person",
      qid: "Q47160"
    },
    {
      baseId: 8,
      name: "Pliny the Elder",
      gender: "male",
      category: "ancient_person",
      qid: "Q82778"
    },
    {
      baseId: 8,
      name: "Plotius Tucca",
      gender: "male",
      category: "ancient_person",
      qid: "Q6184"
    },
    {
      baseId: 8,
      name: "Plutarch",
      gender: "male",
      category: "ancient_person",
      qid: "Q41523"
    },
    {
      baseId: 8,
      name: "Pontius Pilatus",
      gender: "male",
      category: "ancient_person",
      qid: "Q17131"
    },
    {
      baseId: 8,
      name: "Procas",
      gender: "male",
      category: "mythology",
      qid: "Q887384"
    },
    {
      baseId: 8,
      name: "Propertius",
      gender: "male",
      category: "ancient_person",
      qid: "Q8827"
    },
    {
      baseId: 8,
      name: "Pseudo-Marius",
      gender: "male",
      category: "ancient_person",
      qid: "Q110659"
    },
    {
      baseId: 8,
      name: "Ptolemy",
      gender: "male",
      category: "ancient_person",
      qid: "Q34943"
    },
    {
      baseId: 8,
      name: "Pupienus",
      gender: "male",
      category: "ancient_person",
      qid: "Q1797"
    },
    {
      baseId: 8,
      name: "Quinctilius Varus",
      gender: "male",
      category: "ancient_person",
      qid: "Q8808"
    },
    {
      baseId: 8,
      name: "Quintus Curtius Rufus",
      gender: "male",
      category: "ancient_person",
      qid: "Q5959"
    },
    {
      baseId: 8,
      name: "Rediculus",
      gender: "unknown",
      category: "mythology",
      qid: "Q7305935"
    },
    {
      baseId: 8,
      name: "Remmius Palaemon",
      gender: "male",
      category: "ancient_person",
      qid: "Q24548"
    },
    {
      baseId: 8,
      name: "Remus",
      gender: "male",
      category: "mythology",
      qid: "Q1242632"
    },
    {
      baseId: 8,
      name: "Rhea Silvia",
      gender: "female",
      category: "mythology",
      qid: "Q219936"
    },
    {
      baseId: 8,
      name: "Robigus",
      gender: "unknown",
      category: "mythology",
      qid: "Q10752043"
    },
    {
      baseId: 8,
      name: "Roma",
      gender: "female",
      category: "mythology",
      qid: "Q953033"
    },
    {
      baseId: 8,
      name: "Romulus",
      gender: "male",
      category: "mythology",
      qid: "Q2186"
    },
    {
      baseId: 8,
      name: "Saint Afra",
      gender: "female",
      category: "ancient_person",
      qid: "Q114845"
    },
    {
      baseId: 8,
      name: "Saint Cecilia",
      gender: "female",
      category: "ancient_person",
      qid: "Q80513"
    },
    {
      baseId: 8,
      name: "Sallust",
      gender: "male",
      category: "ancient_person",
      qid: "Q7170"
    },
    {
      baseId: 8,
      name: "Scipio Aemilianus",
      gender: "male",
      category: "ancient_person",
      qid: "Q2307"
    },
    {
      baseId: 8,
      name: "Scipio Africanus",
      gender: "male",
      category: "ancient_person",
      qid: "Q2253"
    },
    {
      baseId: 8,
      name: "Seneca",
      gender: "male",
      category: "ancient_person",
      qid: "Q2054"
    },
    {
      baseId: 8,
      name: "Septimius Severus",
      gender: "male",
      category: "ancient_person",
      qid: "Q1442"
    },
    {
      baseId: 8,
      name: "Severus",
      gender: "male",
      category: "ancient_person",
      qid: "Q46814"
    },
    {
      baseId: 8,
      name: "Severus Alexander",
      gender: "male",
      category: "ancient_person",
      qid: "Q1769"
    },
    {
      baseId: 8,
      name: "Soter",
      gender: "male",
      category: "ancient_person",
      qid: "Q101280"
    },
    {
      baseId: 8,
      name: "Suadela",
      gender: "female",
      category: "mythology",
      qid: "Q1459682"
    },
    {
      baseId: 8,
      name: "Subruncinator",
      gender: "unknown",
      category: "mythology",
      qid: "Q3502626"
    },
    {
      baseId: 8,
      name: "Suetonius",
      gender: "male",
      category: "ancient_person",
      qid: "Q10133"
    },
    {
      baseId: 8,
      name: "Tacitus",
      gender: "male",
      category: "ancient_person",
      qid: "Q2161"
    },
    {
      baseId: 8,
      name: "Theodore of Amasea",
      gender: "male",
      category: "ancient_person",
      qid: "Q37599"
    },
    {
      baseId: 8,
      name: "Thomas the Apostle",
      gender: "male",
      category: "ancient_person",
      qid: "Q43669"
    },
    {
      baseId: 8,
      name: "Tiberinus",
      gender: "male",
      category: "mythology",
      qid: "Q937512"
    },
    {
      baseId: 8,
      name: "Tiberius",
      gender: "male",
      category: "ancient_person",
      qid: "Q1407"
    },
    {
      baseId: 8,
      name: "Tibullus",
      gender: "male",
      category: "ancient_person",
      qid: "Q109598"
    },
    {
      baseId: 8,
      name: "Tiburtus",
      gender: "male",
      category: "mythology",
      qid: "Q3528137"
    },
    {
      baseId: 8,
      name: "Titus",
      gender: "male",
      category: "ancient_person",
      qid: "Q1421"
    },
    {
      baseId: 8,
      name: "Titus Calidius Severus",
      gender: "male",
      category: "ancient_person",
      qid: "Q122437"
    },
    {
      baseId: 8,
      name: "Titus Livius",
      gender: "male",
      category: "ancient_person",
      qid: "Q2039"
    },
    {
      baseId: 8,
      name: "Tosco",
      gender: "unknown",
      category: "mythology",
      qid: "Q3995887"
    },
    {
      baseId: 8,
      name: "Trajan",
      gender: "male",
      category: "ancient_person",
      qid: "Q1425"
    },
    {
      baseId: 8,
      name: "Valeria Maximilla",
      gender: "female",
      category: "ancient_person",
      qid: "Q45535"
    },
    {
      baseId: 8,
      name: "Vegetius",
      gender: "male",
      category: "ancient_person",
      qid: "Q4298"
    },
    {
      baseId: 8,
      name: "Vertumnus",
      gender: "male",
      category: "mythology",
      qid: "Q374311"
    },
    {
      baseId: 8,
      name: "Vespasian",
      gender: "male",
      category: "ancient_person",
      qid: "Q1419"
    },
    {
      baseId: 8,
      name: "Virgil",
      gender: "male",
      category: "ancient_person",
      qid: "Q1398"
    },
    {
      baseId: 8,
      name: "Visidianus",
      gender: "male",
      category: "mythology",
      qid: "Q2528300"
    },
    {
      baseId: 8,
      name: "Vitellius",
      gender: "male",
      category: "ancient_person",
      qid: "Q1417"
    },
    {
      baseId: 8,
      name: "Voluptas",
      gender: "female",
      category: "mythology",
      qid: "Q651660"
    }
  ],
  "11": [
    {
      baseId: 11,
      name: "Chang'e",
      gender: "female",
      category: "mythology",
      qid: "Q466462"
    },
    {
      baseId: 11,
      name: "Fuxi",
      gender: "male",
      category: "mythology",
      qid: "Q236972"
    },
    {
      baseId: 11,
      name: "Jade Emperor",
      gender: "male",
      category: "mythology",
      qid: "Q860434"
    },
    {
      baseId: 11,
      name: "Nezha",
      gender: "male",
      category: "mythology",
      qid: "Q547105"
    },
    {
      baseId: 11,
      name: "Nüwa",
      gender: "female",
      category: "mythology",
      qid: "Q641632"
    },
    {
      baseId: 11,
      name: "Sun Wukong",
      gender: "male",
      category: "mythology",
      qid: "Q11773777"
    },
    {
      baseId: 11,
      name: "Yellow Emperor",
      gender: "male",
      category: "mythology",
      qid: "Q29201"
    }
  ],
  "12": [
    {
      baseId: 12,
      name: "Adakayanushitakikihime",
      gender: "female",
      category: "mythology",
      qid: "Q133260613"
    },
    {
      baseId: 12,
      name: "Ahashima",
      gender: "male",
      category: "mythology",
      qid: "Q13275856"
    },
    {
      baseId: 12,
      name: "Aizu-hime-no-Kami",
      gender: "unknown",
      category: "mythology",
      qid: "Q56350355"
    },
    {
      baseId: 12,
      name: "Amamikatsuhime no Mikoto",
      gender: "female",
      category: "mythology",
      qid: "Q106160485"
    },
    {
      baseId: 12,
      name: "Amanosakitama no Mikoto",
      gender: "male",
      category: "mythology",
      qid: "Q106241395"
    },
    {
      baseId: 12,
      name: "Ame no Hiratome",
      gender: "female",
      category: "mythology",
      qid: "Q85879124"
    },
    {
      baseId: 12,
      name: "Ame no Ikutama",
      gender: "male",
      category: "mythology",
      qid: "Q97184246"
    },
    {
      baseId: 12,
      name: "Ame no Mikemochi",
      gender: "male",
      category: "mythology",
      qid: "Q110064530"
    },
    {
      baseId: 12,
      name: "Ame no Mikudaru",
      gender: "male",
      category: "mythology",
      qid: "Q110120205"
    },
    {
      baseId: 12,
      name: "Ame no Tomi",
      gender: "male",
      category: "mythology",
      qid: "Q24899653"
    },
    {
      baseId: 12,
      name: "Ame-no-Hibaraooshinadomi-no-Kami",
      gender: "male",
      category: "mythology",
      qid: "Q60996386"
    },
    {
      baseId: 12,
      name: "Ame-no-Oshikumone",
      gender: "male",
      category: "mythology",
      qid: "Q91088537"
    },
    {
      baseId: 12,
      name: "Ame-no-Tsudoechine",
      gender: "female",
      category: "mythology",
      qid: "Q55533659"
    },
    {
      baseId: 12,
      name: "Ashinataka-no-Kami",
      gender: "unknown",
      category: "mythology",
      qid: "Q55533749"
    },
    {
      baseId: 12,
      name: "Ashinazuchi",
      gender: "male",
      category: "mythology",
      qid: "Q109554668"
    },
    {
      baseId: 12,
      name: "Atago Gongen",
      gender: "unknown",
      category: "mythology",
      qid: "Q1101132"
    },
    {
      baseId: 12,
      name: "Chikatō-no-Kami",
      gender: "unknown",
      category: "mythology",
      qid: "Q38276367"
    },
    {
      baseId: 12,
      name: "Chimata-no-Kami",
      gender: "unknown",
      category: "mythology",
      qid: "Q24887893"
    },
    {
      baseId: 12,
      name: "Chimyō Gongen",
      gender: "unknown",
      category: "mythology",
      qid: "Q11514781"
    },
    {
      baseId: 12,
      name: "Eighty Gods",
      gender: "male",
      category: "mythology",
      qid: "Q65249011"
    },
    {
      baseId: 12,
      name: "Fuha-no-Mojikunusunu",
      gender: "male",
      category: "mythology",
      qid: "Q65266248"
    },
    {
      baseId: 12,
      name: "Fukabuchi-no-Mizuyarehana",
      gender: "male",
      category: "mythology",
      qid: "Q65272471"
    },
    {
      baseId: 12,
      name: "Funozuno",
      gender: "male",
      category: "mythology",
      qid: "Q65266238"
    },
    {
      baseId: 12,
      name: "Furutama",
      gender: "male",
      category: "mythology",
      qid: "Q106241380"
    },
    {
      baseId: 12,
      name: "Futemimi",
      gender: "female",
      category: "mythology",
      qid: "Q65266228"
    },
    {
      baseId: 12,
      name: "Hachiōji Gongen",
      gender: "unknown",
      category: "mythology",
      qid: "Q11391615"
    },
    {
      baseId: 12,
      name: "Hakone Gongen",
      gender: "unknown",
      category: "mythology",
      qid: "Q11603375"
    },
    {
      baseId: 12,
      name: "Hakusan Gongen",
      gender: "unknown",
      category: "mythology",
      qid: "Q11579578"
    },
    {
      baseId: 12,
      name: "Hayaakitsuhiko",
      gender: "male",
      category: "mythology",
      qid: "Q116026335"
    },
    {
      baseId: 12,
      name: "Hayaakitsuhime",
      gender: "female",
      category: "mythology",
      qid: "Q116026336"
    },
    {
      baseId: 12,
      name: "Hikawa-hime",
      gender: "female",
      category: "mythology",
      qid: "Q65270244"
    },
    {
      baseId: 12,
      name: "Hikokamiwake-no-Mikoto",
      gender: "male",
      category: "mythology",
      qid: "Q70537095"
    },
    {
      baseId: 12,
      name: "Himegami",
      gender: "female",
      category: "mythology",
      qid: "Q22070227"
    },
    {
      baseId: 12,
      name: "Himuro Gongen",
      gender: "unknown",
      category: "mythology",
      qid: "Q134844607"
    },
    {
      baseId: 12,
      name: "Hinarashibime",
      gender: "female",
      category: "mythology",
      qid: "Q135330162"
    },
    {
      baseId: 12,
      name: "Honoakari",
      gender: "male",
      category: "mythology",
      qid: "Q60673696"
    },
    {
      baseId: 12,
      name: "Hyōzu no Kami",
      gender: "unknown",
      category: "mythology",
      qid: "Q135195558"
    },
    {
      baseId: 12,
      name: "Ibukidonushi no Kami",
      gender: "unknown",
      category: "mythology",
      qid: "Q86734190"
    },
    {
      baseId: 12,
      name: "Ihika",
      gender: "unknown",
      category: "mythology",
      qid: "Q24866003"
    },
    {
      baseId: 12,
      name: "Ikugui",
      gender: "unknown",
      category: "mythology",
      qid: "Q135011342"
    },
    {
      baseId: 12,
      name: "Ikutamatakitamahime Kami",
      gender: "unknown",
      category: "mythology",
      qid: "Q135330219"
    },
    {
      baseId: 12,
      name: "Isetsuhiko",
      gender: "male",
      category: "mythology",
      qid: "Q17193127"
    },
    {
      baseId: 12,
      name: "Isurugi Gongen",
      gender: "unknown",
      category: "mythology",
      qid: "Q11585202"
    },
    {
      baseId: 12,
      name: "Itsuhayahime-no-Mikoto",
      gender: "unknown",
      category: "mythology",
      qid: "Q48753263"
    },
    {
      baseId: 12,
      name: "Iwaoshiwaku no Ko",
      gender: "unknown",
      category: "mythology",
      qid: "Q24866029"
    },
    {
      baseId: 12,
      name: "Izuhayao-no-Mikoto",
      gender: "male",
      category: "mythology",
      qid: "Q48749523"
    },
    {
      baseId: 12,
      name: "Izuna Gongen",
      gender: "unknown",
      category: "mythology",
      qid: "Q11666654"
    },
    {
      baseId: 12,
      name: "Izusan Gongen",
      gender: "unknown",
      category: "mythology",
      qid: "Q11380566"
    },
    {
      baseId: 12,
      name: "Izushiyamae no okami",
      gender: "unknown",
      category: "mythology",
      qid: "Q112298467"
    },
    {
      baseId: 12,
      name: "Jūzenji",
      gender: "unknown",
      category: "mythology",
      qid: "Q123524325"
    },
    {
      baseId: 12,
      name: "Kamo Taketsunomi",
      gender: "male",
      category: "mythology",
      qid: "Q11634939"
    },
    {
      baseId: 12,
      name: "Kamo Wake-ikazuchi",
      gender: "male",
      category: "mythology",
      qid: "Q11634943"
    },
    {
      baseId: 12,
      name: "Kamuna'obi",
      gender: "unknown",
      category: "mythology",
      qid: "Q86725467"
    },
    {
      baseId: 12,
      name: "Kasuga Gongen",
      gender: "unknown",
      category: "mythology",
      qid: "Q11088804"
    },
    {
      baseId: 12,
      name: "Katakurabe no Mikoto",
      gender: "unknown",
      category: "mythology",
      qid: "Q60995918"
    },
    {
      baseId: 12,
      name: "Kihisakamitakahiko",
      gender: "unknown",
      category: "mythology",
      qid: "Q123511661"
    },
    {
      baseId: 12,
      name: "Kihisatsumi",
      gender: "unknown",
      category: "mythology",
      qid: "Q123511663"
    },
    {
      baseId: 12,
      name: "Kodamahiko-no-Mikoto",
      gender: "unknown",
      category: "mythology",
      qid: "Q109594446"
    },
    {
      baseId: 12,
      name: "Kompira",
      gender: "unknown",
      category: "mythology",
      qid: "Q167077"
    },
    {
      baseId: 12,
      name: "Konohanachiruhime",
      gender: "female",
      category: "mythology",
      qid: "Q48745675"
    },
    {
      baseId: 12,
      name: "Kumano Gongen",
      gender: "unknown",
      category: "mythology",
      qid: "Q11568925"
    },
    {
      baseId: 12,
      name: "Kuninotoshimi-no-Kami",
      gender: "male",
      category: "mythology",
      qid: "Q48759713"
    },
    {
      baseId: 12,
      name: "Kushimachi no Mikoto",
      gender: "male",
      category: "mythology",
      qid: "Q108039939"
    },
    {
      baseId: 12,
      name: "Kushiyatama",
      gender: "male",
      category: "mythology",
      qid: "Q86734749"
    },
    {
      baseId: 12,
      name: "Kuzu Daimyōjin",
      gender: "unknown",
      category: "mythology",
      qid: "Q112368210"
    },
    {
      baseId: 12,
      name: "Michikaeshi Ōkami",
      gender: "unknown",
      category: "mythology",
      qid: "Q134891408"
    },
    {
      baseId: 12,
      name: "Mimatsuhiko-Irodo-no-Mikoto",
      gender: "unknown",
      category: "mythology",
      qid: "Q86728909"
    },
    {
      baseId: 12,
      name: "Mishokutsuomi no Mikoto",
      gender: "male",
      category: "mythology",
      qid: "Q110796235"
    },
    {
      baseId: 12,
      name: "Moritaku-no-Kami",
      gender: "unknown",
      category: "mythology",
      qid: "Q38276368"
    },
    {
      baseId: 12,
      name: "Munasukihime",
      gender: "unknown",
      category: "mythology",
      qid: "Q24863211"
    },
    {
      baseId: 12,
      name: "Nago",
      gender: "unknown",
      category: "mythology",
      qid: "Q126542856"
    },
    {
      baseId: 12,
      name: "Nezu Gongen",
      gender: "unknown",
      category: "mythology",
      qid: "Q11536449"
    },
    {
      baseId: 12,
      name: "Niemotsu no Ko",
      gender: "unknown",
      category: "mythology",
      qid: "Q55532732"
    },
    {
      baseId: 12,
      name: "Oasahiko-no-Mikoto",
      gender: "male",
      category: "mythology",
      qid: "Q134846383"
    },
    {
      baseId: 12,
      name: "Omizunu",
      gender: "male",
      category: "mythology",
      qid: "Q48745416"
    },
    {
      baseId: 12,
      name: "Sakitamahime",
      gender: "unknown",
      category: "mythology",
      qid: "Q135330068"
    },
    {
      baseId: 12,
      name: "Sanki Daigongen",
      gender: "unknown",
      category: "mythology",
      qid: "Q11358323"
    },
    {
      baseId: 12,
      name: "Sannō Gongen",
      gender: "unknown",
      category: "mythology",
      qid: "Q11470054"
    },
    {
      baseId: 12,
      name: "Sashikuni Wakahime",
      gender: "female",
      category: "mythology",
      qid: "Q38276815"
    },
    {
      baseId: 12,
      name: "Sashikuni Ōkami",
      gender: "male",
      category: "mythology",
      qid: "Q48745417"
    },
    {
      baseId: 12,
      name: "Seiryū Gongen",
      gender: "unknown",
      category: "mythology",
      qid: "Q11561324"
    },
    {
      baseId: 12,
      name: "Sugane",
      gender: "unknown",
      category: "mythology",
      qid: "Q123511648"
    },
    {
      baseId: 12,
      name: "Suhijini",
      gender: "female",
      category: "mythology",
      qid: "Q84865529"
    },
    {
      baseId: 12,
      name: "Tajimamorosuku no kami",
      gender: "unknown",
      category: "mythology",
      qid: "Q112298337"
    },
    {
      baseId: 12,
      name: "Takamen",
      gender: "male",
      category: "mythology",
      qid: "Q134350458"
    },
    {
      baseId: 12,
      name: "Takei-Otomo-no-Ookami",
      gender: "unknown",
      category: "mythology",
      qid: "Q86728307"
    },
    {
      baseId: 12,
      name: "Takeminawake no Mikoto",
      gender: "unknown",
      category: "mythology",
      qid: "Q86730053"
    },
    {
      baseId: 12,
      name: "Takeuioki-no-Mikoto",
      gender: "male",
      category: "mythology",
      qid: "Q134845057"
    },
    {
      baseId: 12,
      name: "Tamahime no Mikoto",
      gender: "unknown",
      category: "mythology",
      qid: "Q109598469"
    },
    {
      baseId: 12,
      name: "Tamaru-hime",
      gender: "unknown",
      category: "mythology",
      qid: "Q56347882"
    },
    {
      baseId: 12,
      name: "Tanabatabime-no-Mikoto",
      gender: "unknown",
      category: "mythology",
      qid: "Q48750893"
    },
    {
      baseId: 12,
      name: "Tateyama Gongen",
      gender: "unknown",
      category: "mythology",
      qid: "Q11597837"
    },
    {
      baseId: 12,
      name: "Tenazuchi",
      gender: "female",
      category: "mythology",
      qid: "Q109554669"
    },
    {
      baseId: 12,
      name: "Torinarumi no kami",
      gender: "male",
      category: "mythology",
      qid: "Q55522639"
    },
    {
      baseId: 12,
      name: "Totori no kami",
      gender: "female",
      category: "mythology",
      qid: "Q48760952"
    },
    {
      baseId: 12,
      name: "Totsuyami-Sakitara-no-Kami",
      gender: "male",
      category: "mythology",
      qid: "Q55523289"
    },
    {
      baseId: 12,
      name: "Tsunuga Arashito",
      gender: "male",
      category: "mythology",
      qid: "Q17216052"
    },
    {
      baseId: 12,
      name: "Tsunugui",
      gender: "unknown",
      category: "mythology",
      qid: "Q135011341"
    },
    {
      baseId: 12,
      name: "Uhijini",
      gender: "male",
      category: "mythology",
      qid: "Q84865505"
    },
    {
      baseId: 12,
      name: "Unochihiko",
      gender: "male",
      category: "mythology",
      qid: "Q123511657"
    },
    {
      baseId: 12,
      name: "Utsushihikanasaku",
      gender: "male",
      category: "mythology",
      qid: "Q86736058"
    },
    {
      baseId: 12,
      name: "Yachinomi-no-Mikoto",
      gender: "unknown",
      category: "mythology",
      qid: "Q65249081"
    },
    {
      baseId: 12,
      name: "Yametsuhime",
      gender: "unknown",
      category: "mythology",
      qid: "Q98082969"
    },
    {
      baseId: 12,
      name: "Yashimajinumi no kami",
      gender: "male",
      category: "mythology",
      qid: "Q55522907"
    },
    {
      baseId: 12,
      name: "Yashimamuji",
      gender: "male",
      category: "mythology",
      qid: "Q65249018"
    },
    {
      baseId: 12,
      name: "Yatsuagata Sukune",
      gender: "unknown",
      category: "mythology",
      qid: "Q56347860"
    },
    {
      baseId: 12,
      name: "Yazuka-Otoko-no-Mikoto",
      gender: "male",
      category: "mythology",
      qid: "Q86728350"
    },
    {
      baseId: 12,
      name: "Yuga Daigongen",
      gender: "unknown",
      category: "mythology",
      qid: "Q11573853"
    },
    {
      baseId: 12,
      name: "Zaō Gongen",
      gender: "unknown",
      category: "mythology",
      qid: "Q10514059"
    },
    {
      baseId: 12,
      name: "Ōmiyanome",
      gender: "female",
      category: "mythology",
      qid: "Q24865597"
    },
    {
      baseId: 12,
      name: "Ōnotehime-no-Kami",
      gender: "female",
      category: "mythology",
      qid: "Q85878978"
    },
    {
      baseId: 12,
      name: "Ōtonobe",
      gender: "female",
      category: "mythology",
      qid: "Q84868574"
    },
    {
      baseId: 12,
      name: "Ōtonoji",
      gender: "male",
      category: "mythology",
      qid: "Q84868546"
    }
  ],
  "18": [
    {
      baseId: 18,
      name: "Abbasa",
      gender: "female",
      category: "ancient_person",
      qid: "Q305965"
    },
    {
      baseId: 18,
      name: "Abdul Qadir Gilani",
      gender: "male",
      category: "ancient_person",
      qid: "Q307365"
    },
    {
      baseId: 18,
      name: "Abu Bakr al-Kalabadhi",
      gender: "male",
      category: "ancient_person",
      qid: "Q334857"
    },
    {
      baseId: 18,
      name: "Abu Dawud al-Sijistani",
      gender: "male",
      category: "ancient_person",
      qid: "Q336558"
    },
    {
      baseId: 18,
      name: "Abu Firas al-Hamdani",
      gender: "male",
      category: "ancient_person",
      qid: "Q481409"
    },
    {
      baseId: 18,
      name: "Abu Isa at-Tirmidhi",
      gender: "male",
      category: "ancient_person",
      qid: "Q293578"
    },
    {
      baseId: 18,
      name: "Abu Ma'shar al-Balkhi",
      gender: "male",
      category: "ancient_person",
      qid: "Q11373"
    },
    {
      baseId: 18,
      name: "Abu Mikhnaf",
      gender: "male",
      category: "ancient_person",
      qid: "Q337009"
    },
    {
      baseId: 18,
      name: "Abu Nuwas",
      gender: "male",
      category: "ancient_person",
      qid: "Q5670"
    },
    {
      baseId: 18,
      name: "Abu al-Faraj al-Isfahani",
      gender: "male",
      category: "ancient_person",
      qid: "Q335599"
    },
    {
      baseId: 18,
      name: "Abu-Sa'id Jannabi",
      gender: "male",
      category: "ancient_person",
      qid: "Q288260"
    },
    {
      baseId: 18,
      name: "Abū Ḥanīfa Dīnawarī",
      gender: "male",
      category: "ancient_person",
      qid: "Q293520"
    },
    {
      baseId: 18,
      name: "Abū-Sa'īd Abul-Khayr",
      gender: "male",
      category: "ancient_person",
      qid: "Q335282"
    },
    {
      baseId: 18,
      name: "Ahmed ar-Rifa'i",
      gender: "male",
      category: "ancient_person",
      qid: "Q401463"
    },
    {
      baseId: 18,
      name: "Al-Baladhuri",
      gender: "male",
      category: "ancient_person",
      qid: "Q293528"
    },
    {
      baseId: 18,
      name: "Al-Basasiri",
      gender: "male",
      category: "ancient_person",
      qid: "Q288840"
    },
    {
      baseId: 18,
      name: "Al-Bayhaqi",
      gender: "male",
      category: "ancient_person",
      qid: "Q293663"
    },
    {
      baseId: 18,
      name: "Al-Fadl ibn Sahl",
      gender: "male",
      category: "ancient_person",
      qid: "Q292178"
    },
    {
      baseId: 18,
      name: "Al-Hilli",
      gender: "male",
      category: "ancient_person",
      qid: "Q290506"
    },
    {
      baseId: 18,
      name: "Al-Karaji",
      gender: "male",
      category: "ancient_person",
      qid: "Q461062"
    },
    {
      baseId: 18,
      name: "Al-Kindi",
      gender: "male",
      category: "ancient_person",
      qid: "Q179759"
    },
    {
      baseId: 18,
      name: "Al-Mas'udi",
      gender: "male",
      category: "ancient_person",
      qid: "Q168705"
    },
    {
      baseId: 18,
      name: "Al-Mawardi",
      gender: "male",
      category: "ancient_person",
      qid: "Q335635"
    },
    {
      baseId: 18,
      name: "Al-Mu'tadid",
      gender: "male",
      category: "ancient_person",
      qid: "Q284567"
    },
    {
      baseId: 18,
      name: "Al-Mu'tamid",
      gender: "male",
      category: "ancient_person",
      qid: "Q284721"
    },
    {
      baseId: 18,
      name: "Al-Mu'tazz",
      gender: "male",
      category: "ancient_person",
      qid: "Q281989"
    },
    {
      baseId: 18,
      name: "Al-Muktafi",
      gender: "male",
      category: "ancient_person",
      qid: "Q284701"
    },
    {
      baseId: 18,
      name: "Al-Muntasir",
      gender: "male",
      category: "ancient_person",
      qid: "Q284012"
    },
    {
      baseId: 18,
      name: "Al-Muqanna",
      gender: "male",
      category: "ancient_person",
      qid: "Q287761"
    },
    {
      baseId: 18,
      name: "Al-Muqtadi",
      gender: "male",
      category: "ancient_person",
      qid: "Q293683"
    },
    {
      baseId: 18,
      name: "Al-Muqtafi",
      gender: "male",
      category: "ancient_person",
      qid: "Q293617"
    },
    {
      baseId: 18,
      name: "Al-Musta'in",
      gender: "male",
      category: "ancient_person",
      qid: "Q284157"
    },
    {
      baseId: 18,
      name: "Al-Musta'sim",
      gender: "male",
      category: "ancient_person",
      qid: "Q293454"
    },
    {
      baseId: 18,
      name: "Al-Mustadi",
      gender: "male",
      category: "ancient_person",
      qid: "Q293646"
    },
    {
      baseId: 18,
      name: "Al-Mustakfi",
      gender: "male",
      category: "ancient_person",
      qid: "Q293640"
    },
    {
      baseId: 18,
      name: "Al-Mustanjid",
      gender: "male",
      category: "ancient_person",
      qid: "Q293448"
    },
    {
      baseId: 18,
      name: "Al-Mustansir",
      gender: "male",
      category: "ancient_person",
      qid: "Q293545"
    },
    {
      baseId: 18,
      name: "Al-Mustarshid",
      gender: "male",
      category: "ancient_person",
      qid: "Q293621"
    },
    {
      baseId: 18,
      name: "Al-Mustazhir",
      gender: "male",
      category: "ancient_person",
      qid: "Q293632"
    },
    {
      baseId: 18,
      name: "Al-Muti",
      gender: "male",
      category: "ancient_person",
      qid: "Q284730"
    },
    {
      baseId: 18,
      name: "Al-Muttaqi",
      gender: "male",
      category: "ancient_person",
      qid: "Q284759"
    },
    {
      baseId: 18,
      name: "Al-Muwaffaq",
      gender: "male",
      category: "ancient_person",
      qid: "Q291410"
    },
    {
      baseId: 18,
      name: "Al-Muzani",
      gender: "male",
      category: "ancient_person",
      qid: "Q48703"
    },
    {
      baseId: 18,
      name: "Al-Nasa'i",
      gender: "male",
      category: "ancient_person",
      qid: "Q293535"
    },
    {
      baseId: 18,
      name: "Al-Nasir",
      gender: "male",
      category: "ancient_person",
      qid: "Q284750"
    },
    {
      baseId: 18,
      name: "Al-Qa'im",
      gender: "male",
      category: "ancient_person",
      qid: "Q293626"
    },
    {
      baseId: 18,
      name: "Al-Qadir",
      gender: "male",
      category: "ancient_person",
      qid: "Q284427"
    },
    {
      baseId: 18,
      name: "Al-Qahir",
      gender: "male",
      category: "ancient_person",
      qid: "Q284711"
    },
    {
      baseId: 18,
      name: "Al-Rashid",
      gender: "male",
      category: "ancient_person",
      qid: "Q293509"
    },
    {
      baseId: 18,
      name: "Al-Waqidi",
      gender: "male",
      category: "ancient_person",
      qid: "Q285255"
    },
    {
      baseId: 18,
      name: "Al-Wathiq",
      gender: "male",
      category: "ancient_person",
      qid: "Q284585"
    },
    {
      baseId: 18,
      name: "Ali al-Hadi",
      gender: "male",
      category: "ancient_person",
      qid: "Q315377"
    },
    {
      baseId: 18,
      name: "Ali al-Rida",
      gender: "male",
      category: "ancient_person",
      qid: "Q25105"
    },
    {
      baseId: 18,
      name: "At-Ta'i",
      gender: "male",
      category: "ancient_person",
      qid: "Q284779"
    },
    {
      baseId: 18,
      name: "Az-Zahir",
      gender: "male",
      category: "ancient_person",
      qid: "Q293450"
    },
    {
      baseId: 18,
      name: "Baha ad-Din Shoieb",
      gender: "male",
      category: "ancient_person",
      qid: "Q253568"
    },
    {
      baseId: 18,
      name: "Bayazid Bastami",
      gender: "male",
      category: "ancient_person",
      qid: "Q380241"
    },
    {
      baseId: 18,
      name: "Farabi",
      gender: "male",
      category: "ancient_person",
      qid: "Q160460"
    },
    {
      baseId: 18,
      name: "Fatima al-Fihriya",
      gender: "female",
      category: "ancient_person",
      qid: "Q182363"
    },
    {
      baseId: 18,
      name: "Fātima bint Mūsā",
      gender: "female",
      category: "ancient_person",
      qid: "Q445398"
    },
    {
      baseId: 18,
      name: "Hasan al-Askari",
      gender: "male",
      category: "ancient_person",
      qid: "Q315920"
    },
    {
      baseId: 18,
      name: "Ibn Khordadbeh",
      gender: "male",
      category: "ancient_person",
      qid: "Q380004"
    },
    {
      baseId: 18,
      name: "Ibn Majah",
      gender: "male",
      category: "ancient_person",
      qid: "Q381469"
    },
    {
      baseId: 18,
      name: "Ibn al-Haytham",
      gender: "male",
      category: "ancient_person",
      qid: "Q11104"
    },
    {
      baseId: 18,
      name: "Ibrahim al-Nazzam",
      gender: "male",
      category: "ancient_person",
      qid: "Q287501"
    },
    {
      baseId: 18,
      name: "Imam Zufar",
      gender: "male",
      category: "ancient_person",
      qid: "Q228203"
    },
    {
      baseId: 18,
      name: "Inan",
      gender: "female",
      category: "ancient_person",
      qid: "Q11926586"
    },
    {
      baseId: 18,
      name: "Ishaq Ibn Rahwayh",
      gender: "male",
      category: "ancient_person",
      qid: "Q439344"
    },
    {
      baseId: 18,
      name: "Ishodad of Merv",
      gender: "male",
      category: "ancient_person",
      qid: "Q213120"
    },
    {
      baseId: 18,
      name: "Mansur Al-Hallaj",
      gender: "male",
      category: "ancient_person",
      qid: "Q172862"
    },
    {
      baseId: 18,
      name: "Mu'nis al-Khadim",
      gender: "male",
      category: "ancient_person",
      qid: "Q287837"
    },
    {
      baseId: 18,
      name: "Muhammad al-Jawad",
      gender: "male",
      category: "ancient_person",
      qid: "Q25088"
    },
    {
      baseId: 18,
      name: "Musa al-Kazim",
      gender: "male",
      category: "ancient_person",
      qid: "Q315031"
    },
    {
      baseId: 18,
      name: "Muslim ibn al-Ḥajjāj",
      gender: "male",
      category: "ancient_person",
      qid: "Q140124"
    },
    {
      baseId: 18,
      name: "Nafi' al-Madani",
      gender: "male",
      category: "ancient_person",
      qid: "Q112465"
    },
    {
      baseId: 18,
      name: "Nasir al-Din al-Tusi",
      gender: "male",
      category: "ancient_person",
      qid: "Q302835"
    },
    {
      baseId: 18,
      name: "Nizam al-Mulk",
      gender: "male",
      category: "ancient_person",
      qid: "Q298427"
    },
    {
      baseId: 18,
      name: "Rabia of Basri",
      gender: "female",
      category: "ancient_person",
      qid: "Q256506"
    },
    {
      baseId: 18,
      name: "Saadia Gaon",
      gender: "male",
      category: "ancient_person",
      qid: "Q328748"
    },
    {
      baseId: 18,
      name: "Sahl ibn Bishr",
      gender: "male",
      category: "ancient_person",
      qid: "Q353889"
    },
    {
      baseId: 18,
      name: "Shapur ibn Sahl",
      gender: "male",
      category: "ancient_person",
      qid: "Q325676"
    },
    {
      baseId: 18,
      name: "Sharif Radhi",
      gender: "male",
      category: "ancient_person",
      qid: "Q130561"
    },
    {
      baseId: 18,
      name: "Sharif al-Murtadha",
      gender: "male",
      category: "ancient_person",
      qid: "Q130169"
    },
    {
      baseId: 18,
      name: "Shihab al-Din Suhrawardi",
      gender: "male",
      category: "ancient_person",
      qid: "Q282883"
    },
    {
      baseId: 18,
      name: "Shmym al-Ḥillī",
      gender: "male",
      category: "ancient_person",
      qid: "Q6807343"
    },
    {
      baseId: 18,
      name: "Subuk",
      gender: "male",
      category: "ancient_person",
      qid: "Q7632290"
    },
    {
      baseId: 18,
      name: "Thābit ibn Qurra",
      gender: "male",
      category: "ancient_person",
      qid: "Q250568"
    },
    {
      baseId: 18,
      name: "al-Yaʿqubi",
      gender: "male",
      category: "ancient_person",
      qid: "Q293689"
    }
  ],
  "22": [
    {
      baseId: 22,
      name: "Annea",
      gender: "unknown",
      category: "mythology",
      qid: "Q565968"
    },
    {
      baseId: 22,
      name: "Ansotica",
      gender: "female",
      category: "mythology",
      qid: "Q570056"
    },
    {
      baseId: 22,
      name: "Aobh",
      gender: "female",
      category: "mythology",
      qid: "Q615537"
    },
    {
      baseId: 22,
      name: "Arawn",
      gender: "unknown",
      category: "mythology",
      qid: "Q626770"
    },
    {
      baseId: 22,
      name: "Arvalus",
      gender: "male",
      category: "mythology",
      qid: "Q716910"
    },
    {
      baseId: 22,
      name: "Baeserta",
      gender: "unknown",
      category: "mythology",
      qid: "Q799755"
    },
    {
      baseId: 22,
      name: "Bandua",
      gender: "male",
      category: "mythology",
      qid: "Q806376"
    },
    {
      baseId: 22,
      name: "Bith",
      gender: "unknown",
      category: "mythology",
      qid: "Q878793"
    },
    {
      baseId: 22,
      name: "Brath",
      gender: "male",
      category: "mythology",
      qid: "Q12384644"
    },
    {
      baseId: 22,
      name: "Buxenus",
      gender: "unknown",
      category: "mythology",
      qid: "Q1018287"
    },
    {
      baseId: 22,
      name: "Bébinn",
      gender: "unknown",
      category: "mythology",
      qid: "Q1019353"
    },
    {
      baseId: 22,
      name: "Cailleach",
      gender: "female",
      category: "mythology",
      qid: "Q1025867"
    },
    {
      baseId: 22,
      name: "Cernunnos",
      gender: "male",
      category: "mythology",
      qid: "Q739737"
    },
    {
      baseId: 22,
      name: "Dumiatis",
      gender: "male",
      category: "mythology",
      qid: "Q1264987"
    },
    {
      baseId: 22,
      name: "Emrys",
      gender: "unknown",
      category: "mythology",
      qid: "Q10483170"
    },
    {
      baseId: 22,
      name: "Fish-man",
      gender: "male",
      category: "mythology",
      qid: "Q1586937"
    },
    {
      baseId: 22,
      name: "Frìd",
      gender: "unknown",
      category: "mythology",
      qid: "Q13194676"
    },
    {
      baseId: 22,
      name: "Hooded Spirits",
      gender: "unknown",
      category: "mythology",
      qid: "Q1425293"
    },
    {
      baseId: 22,
      name: "Latiaran",
      gender: "female",
      category: "mythology",
      qid: "Q11753178"
    },
    {
      baseId: 22,
      name: "Lir",
      gender: "male",
      category: "mythology",
      qid: "Q1827715"
    },
    {
      baseId: 22,
      name: "Math fab Mathonwy",
      gender: "male",
      category: "mythology",
      qid: "Q2097638"
    },
    {
      baseId: 22,
      name: "Nabia",
      gender: "female",
      category: "mythology",
      qid: "Q3321513"
    },
    {
      baseId: 22,
      name: "Reo",
      gender: "male",
      category: "mythology",
      qid: "Q3392532"
    },
    {
      baseId: 22,
      name: "Sluagh",
      gender: "unknown",
      category: "mythology",
      qid: "Q3136673"
    },
    {
      baseId: 22,
      name: "Suleviae",
      gender: "female",
      category: "mythology",
      qid: "Q1399677"
    },
    {
      baseId: 22,
      name: "Veteris",
      gender: "unknown",
      category: "mythology",
      qid: "Q1354248"
    }
  ],
  "23": [
    {
      baseId: 23,
      name: "Enki",
      gender: "male",
      category: "mythology",
      qid: "Q189726"
    },
    {
      baseId: 23,
      name: "Enlil",
      gender: "male",
      category: "mythology",
      qid: "Q214672"
    },
    {
      baseId: 23,
      name: "Gilgamesh",
      gender: "unknown",
      category: "mythology",
      qid: "Q75352"
    },
    {
      baseId: 23,
      name: "Inanna",
      gender: "female",
      category: "mythology",
      qid: "Q272523"
    },
    {
      baseId: 23,
      name: "Ishtar",
      gender: "female",
      category: "mythology",
      qid: "Q47553"
    },
    {
      baseId: 23,
      name: "Marduk",
      gender: "male",
      category: "mythology",
      qid: "Q190123"
    }
  ],
  "24": [
    {
      baseId: 24,
      name: "Ahriman",
      gender: "unknown",
      category: "mythology",
      qid: "Q3607025"
    },
    {
      baseId: 24,
      name: "Ahura Mazda",
      gender: "unknown",
      category: "mythology",
      qid: "Q179575"
    },
    {
      baseId: 24,
      name: "Rostam",
      gender: "male",
      category: "mythology",
      qid: "Q60062"
    }
  ],
  "42": [
    {
      baseId: 42,
      name: "Abraham",
      gender: "male",
      category: "mythology",
      qid: "Q9181"
    },
    {
      baseId: 42,
      name: "Adam",
      gender: "unknown",
      category: "mythology",
      qid: "Q70899"
    },
    {
      baseId: 42,
      name: "David",
      gender: "male",
      category: "mythology",
      qid: "Q41370"
    },
    {
      baseId: 42,
      name: "Eve",
      gender: "female",
      category: "mythology",
      qid: "Q239464"
    },
    {
      baseId: 42,
      name: "Joshua",
      gender: "male",
      category: "mythology",
      qid: "Q7734"
    },
    {
      baseId: 42,
      name: "Moses",
      gender: "male",
      category: "mythology",
      qid: "Q9077"
    },
    {
      baseId: 42,
      name: "Noah",
      gender: "male",
      category: "mythology",
      qid: "Q81422"
    },
    {
      baseId: 42,
      name: "Solomon",
      gender: "male",
      category: "mythology",
      qid: "Q37085"
    }
  ]
} as const;
