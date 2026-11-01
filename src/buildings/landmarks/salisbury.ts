import { DEFAULT_AUTHOR } from "../authors";
import { compactModel } from "../compactModel";
import { createModelAssembly, type ModelPartFactory } from "../modelParts";
import { ArchitectureKit, type LandmarkModel } from "./architectureKit";
import { detailedLandmark, GothicDetailKit } from "./gothic/detailKit";
import { addSalisburyChapterHouse } from "./gothic/salisburyChapterHouse";

export const model: LandmarkModel = {
  author: "Codex GPT-6.1 Sol",
  id: "salisbury",
  task: "G07",
  name: "Salisbury Cathedral",
  style: "Gothic",
  state: "Present exterior: 13th-century body, 14th-century tower and spire",
  size: [146, 110, 125],
  dimensions:
    "Approximate 142 m long body and 123 m spire study. Cloister, chapter house and bay positions are estimated; the envelope includes the monastic appendages and is not a measured survey.",
  note: "Long Early English body with square east end, two pairs of transepts, dominant central spire, south cloister and octagonal chapter house. Lancets and west-front niches are schematic. Interior bracing, sculpture and stained-glass scenes are omitted.",
  sources: [
    {
      title: "Cathedral: building chronology",
      url: "https://www.salisburycathedral.org.uk/discover/history/the-cathedral-through-the-years/"
    }
  ],
  create() {
    return assembleParts(parts("low"));
  },
  parts: () => parts("low"),
  assembleParts
};

const highDetail = detailedLandmark(model, () => assembleParts(parts("high")));
model.highDetail = {
  ...highDetail,
  note: "Detailed exterior on the original fitted plan, with molded lancet surrounds, tracery, portal archivolts, roof seams and detailed tower and spire. The chapter house adds open masonry, recessed four-light glazing, stepped buttresses, a faceted roof, supporting shafts and ribs, and an estimated entrance passage to the cloister. The study is illustrative, not a measured reconstruction. Most interiors, carved narrative friezes and exact glass scenes are omitted.",
  sources: [
    ...model.sources,
    {
      title: "Gleeson White: chapter-house fabric and photographs (1898)",
      url: "https://www.gutenberg.org/files/23668/23668-h/23668-h.htm#Page_71"
    }
  ],
  parts: () => parts("high")
};

/** Retain this landmark's fitted geometry; selection happens before constructing a kit. */
function parts(quality: "low" | "high"): readonly ModelPartFactory[] {
  const definitions: { id: string; build(k: ArchitectureKit): void }[] = [
    {
      id: "nave-and-quire",
      build(k) {
        k.nave("long-nave-and-quire", -10, 0, 118, 14, 25, 10);
        for (const s of [-1, 1]) {
          for (const x of [-57, -48, -39, -30, -21, 10, 19, 42]) {
            k.opening("lancet", x, 16, s * 7, 1.6, 7, s > 0 ? 0 : Math.PI);
          }
        }
      }
    }
  ];
  for (const s of [-1, 1]) {
    const side = s < 0 ? "north" : "south";
    definitions.push(
      {
        id: `${side}-aisle`,
        build(k) {
          k.nave("aisle", -10, s * 11, 118, 8, 12, 4);
          for (const x of [-57, -48, -39, -30, -21, 10, 19, 42]) {
            k.opening("aisle-lancet", x, 3, s * 15, 2, 7, s > 0 ? 0 : Math.PI);
            k.block("buttress", x + 3, s * 15.7, 0.8, 1.6, 13);
          }
        }
      },
      {
        id: `${side}-great-transept`,
        build(k) {
          k.crossNave("great-transept", -5, s * 19, 28, 15, 24, 10);
          for (const z of [s * 22, s * 28]) k.opening("transept-lancet", -12.5, 12, z, 1.8, 9, -Math.PI / 2);
        }
      },
      { id: `${side}-eastern-transept`, build: k => k.crossNave("eastern-transept", 33, s * 14, 20, 13, 23, 9) }
    );
  }
  definitions.push(
    {
      id: "lady-chapel",
      build(k) {
        k.nave("east-lady-chapel", 58, 0, 22, 12, 13, 6);
        k.opening("east-triple-lancet", 69, 3, 0, 5, 9, Math.PI / 2);
      }
    },
    {
      id: "crossing-tower-and-spire",
      build(k) {
        k.tower("crossing-tower", -5, 0, 14, 68);
        k.spire("central-spire", -5, 68.7, 0, 7.4, 54.3);
        for (const x of [-11, 1]) for (const z of [-6, 6]) k.pinnacle(x, 68, z, 0.8, 6);
      }
    },
    {
      id: "west-front",
      build(k) {
        k.block("west-screen", -69, 0, 1.3, 34, 29);
        for (const z of [-13, 13]) k.tower("west-turret", -67, z, 5, 34, 7);
        for (const z of [-9, 0, 9]) {
          k.opening("west-door", -69.65, 0.1, z, 4, 7, -Math.PI / 2, true, true);
          k.opening("west-lancet", -69.65, 12, z, 3.5, 13, -Math.PI / 2);
        }
      }
    },
    {
      id: "cloister",
      build(k) {
        for (const z of [-18, 18]) {
          k.arcade("cloister", -55, 45 + z, 36, 12, 0, 5, 0, true);
          k.nave("cloister-roof", -37, 45 + z, 37, 4, 5, 2, 4.8);
        }
        for (const x of [-55, -19]) {
          k.arcade("cloister", 27, x, 36, 12, 0, 5, Math.PI / 2, true);
          k.crossNave("cloister-roof", x, 45, 37, 4, 5, 2, 4.8);
        }
      }
    },
    {
      id: "chapter-house",
      build(k) {
        k.cylinder("chapter-house", [-7, 6, 58], 8, 12, "plaster", 8, 8);
        k.cylinder("chapter-house-roof", [-7, 15, 58], 8.4, 6, "iron", 0, 8);
      }
    }
  );
  return definitions.map(({ id, build }) => ({
    id: `salisbury:${id}`,
    role: id,
    quality,
    author: DEFAULT_AUTHOR,
    create() {
      const kit = quality === "high" ? new GothicDetailKit("salisbury") : new ArchitectureKit("salisbury");
      if (id === "chapter-house" && kit instanceof GothicDetailKit) addSalisburyChapterHouse(kit);
      else build(kit);
      return kit.finish();
    }
  }));
}

function assembleParts(selected: readonly ModelPartFactory[]) {
  return compactModel(createModelAssembly("salisbury", selected), { mergeEquivalentMaterials: true });
}
