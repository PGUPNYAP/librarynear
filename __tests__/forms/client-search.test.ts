import { describe, expect, it } from "vitest";
import {
  acronymOf,
  transliterateDevanagari,
  editDistance,
  normalizeForSearch,
  parseQuery,
  phoneticKey,
  popularPlaces,
  prepareIndex,
  searchLocally,
  searchOtherCities,
  highlightParts,
  type SearchIndex,
} from "@/lib/client-search";

const index: SearchIndex = {
  v: 2,
  city: "delhi",
  l: [
    ["ambey-library-uttam-nagar", "Ambey Library", "Uttam Nagar", 45, 1, 80, 28621, 77055, 3],
    ["ambey-library-rohini", "Ambey Library", "Rohini Sector 7", 40, 0, 70, 28715, 77110, 0],
    ["mukherjee-study-point", "Mukherjee Study Point", "Mukherjee Nagar", 0, 0, 40, 28706, 77211, 0],
    ["shiv-library-rohini", "Shiv Library", "Rohini Sector 7", 41, 0, 60, 28715, 77110, 0],
    ["gyan-library-orn", "Gyan Library", "Old Rajinder Nagar", 44, 1, 90, 28641, 77182, 12],
  ],
  loc: [
    ["Mukherjee Nagar", 42, 28706, 77211, 20],
    ["Rohini Sector 7", 12, 28715, 77110, 0],
    ["Uttam Nagar", 30, 28621, 77055, 0],
    ["Old Rajinder Nagar", 25, 28641, 77182, 5],
    ["Laxmi Nagar", 18, 28630, 77277, 0],
  ],
  m: [["Rohini East", 8, 28707, 77126]],
  a: [
    ["orn", "locality", "Old Rajinder Nagar"],
    ["north campus", "locality", "Mukherjee Nagar"],
  ],
};

const ready = prepareIndex(index);

describe("text normalization", () => {
  it("folds common spellings and builds sound-alike keys", () => {
    expect(normalizeForSearch("Mukherjee")).toBe(normalizeForSearch("Mukherji"));
    expect(normalizeForSearch("Phase-1")).toBe("phase 1");
    expect(phoneticKey("laxmi")).toBe(phoneticKey("lakshmi"));
  });

  it("measures typos including swapped letters", () => {
    expect(editDistance("rohnii", "rohini")).toBe(1);
    expect(editDistance("mukerjee", "mukherjee")).toBe(1);
    expect(editDistance("abc", "xyzw", 2)).toBeGreaterThan(2);
  });
});

describe("query understanding", () => {
  it("pulls filters out of natural queries", () => {
    const parsed = parseQuery("ac library under 2k in mukherjee nagar");
    expect(parsed.amenities.map((a) => a.slug)).toContain("ac");
    expect(parsed.maxPrice).toBe(2000);
    expect(parsed.tokens).toEqual(["mukherji", "nagar"]);
  });

  it("treats 24x7 as hours but 'sector 24' as a place", () => {
    expect(parseQuery("24x7 library").open24).toBe(true);
    const sector = parseQuery("rohini sector 24");
    expect(sector.open24).toBe(false);
    expect(sector.tokens).toEqual(["rohini", "sector", "24"]);
  });

  it("expands abbreviations", () => {
    expect(parseQuery("rohini sec 7").tokens).toEqual(["rohini", "sector", "7"]);
  });
});

describe("local search", () => {
  it("finds places by prefix, spelling variants and typos", () => {
    expect(searchLocally(ready, "mukh").suggestions[0]).toMatchObject({ type: "locality", label: "Mukherjee Nagar" });
    expect(searchLocally(ready, "mukherji nagar").suggestions[0]?.label).toBe("Mukherjee Nagar");
    expect(searchLocally(ready, "rohnii").suggestions.some((s) => s.label === "Rohini Sector 7")).toBe(true);
    expect(searchLocally(ready, "lakshmi nagar").suggestions[0]?.label).toBe("Laxmi Nagar");
  });

  it("resolves aliases (abbreviations learned from users)", () => {
    expect(searchLocally(ready, "orn").suggestions[0]).toMatchObject({ type: "locality", label: "Old Rajinder Nagar" });
    expect(searchLocally(ready, "north campus").suggestions[0]?.label).toBe("Mukherjee Nagar");
  });

  it("ranks the nearer of two same-named libraries first when location is known", () => {
    const nearRohini = { lat: 28.716, lng: 77.111, accuracy: "precise" as const };
    const libraries = searchLocally(ready, "ambey", { location: nearRohini }).suggestions.filter((s) => s.type === "library");
    expect(libraries[0].slug).toBe("ambey-library-rohini");
    const nearUttam = { lat: 28.62, lng: 77.05, accuracy: "precise" as const };
    expect(searchLocally(ready, "ambey", { location: nearUttam }).suggestions.filter((s) => s.type === "library")[0].slug).toBe(
      "ambey-library-uttam-nagar",
    );
  });

  it("offers a filter chip for intent queries", () => {
    const { chip } = searchLocally(ready, "ac library in mukherjee nagar", { cityLabel: "Delhi" });
    expect(chip?.href).toContain("/delhi/libraries?");
    expect(chip?.href).toContain("amenities=AC");
    expect(chip?.href).toContain("locality=Mukherjee+Nagar");
    expect(chip?.label).toMatch(/AC libraries in Mukherjee Nagar/i);
  });

  it("requires every word to match", () => {
    expect(searchLocally(ready, "shiv uttam").suggestions).toEqual([]);
  });

  it("stays fast on a city-sized index", () => {
    const big = { ...index, l: Array.from({ length: 5000 }, (_, i) => [...index.l[i % index.l.length]] as SearchIndex["l"][number]).map((row, i) => { row[0] = `lib-${i}`; return row; }) };
    const prepared = prepareIndex(big);
    const started = performance.now();
    for (let i = 0; i < 20; i++) searchLocally(prepared, "rohni sec 7");
    expect((performance.now() - started) / 20).toBeLessThan(16);
  });
});

describe("empty panel and other cities", () => {
  it("lists popular places, nearest first with a precise location", () => {
    const nearLaxmi = { lat: 28.63, lng: 77.277, accuracy: "precise" as const };
    expect(popularPlaces(ready, nearLaxmi, 3)[0].label).toBe("Laxmi Nagar");
  });

  it("finds a locality in another city", () => {
    const places = { v: 1 as const, c: [["delhi", "Delhi"], ["mumbai", "Mumbai"]] as Array<[string, string]>, p: [[0, "Laxmi Nagar", 18], [1, "Andheri East", 40]] as Array<[number, string, number]> };
    const results = searchOtherCities(places, "andheri", "delhi");
    expect(results[0]).toMatchObject({ label: "Andheri East", city: "mumbai" });
    expect(searchOtherCities(places, "laxmi", "delhi")).toEqual([]);
  });

  it("highlights the typed prefix", () => {
    expect(highlightParts("Mukherjee Nagar", "mukh nag")).toEqual([
      { text: "Mukh", match: true },
      { text: "erjee", match: false },
      { text: " ", match: false },
      { text: "Nag", match: true },
      { text: "ar", match: false },
    ]);
  });
});

describe("false positives", () => {
  it("does not match a different place that merely sounds similar at the start", () => {
    const withAndrews = prepareIndex({ ...index, loc: [...index.loc, ["Andrews Ganj", 2, 28560, 77230, 0]] });
    expect(searchLocally(withAndrews, "andheri").suggestions.some((s) => s.label === "Andrews Ganj")).toBe(false);
  });
});

describe("places, near-X, PIN and Hindi", () => {
  const withPlaces = prepareIndex({
    ...index,
    p: [
      ["Delhi Technological University", "university", 28750, 77117, "DTU|Delhi College of Engineering"],
      ["All India Institute of Medical Sciences", "hospital", 28567, 77210, ""],
      ["Hindu College", "college", 28687, 77213, ""],
    ],
    z: [["110009", 40], ["110085", 22]],
  });

  it("understands 'near X' and resolves X to a landmark by acronym", () => {
    const parsed = parseQuery("library near dtu");
    expect(parsed.nearTokens).toEqual(["dtu"]);
    const top = searchLocally(withPlaces, "library near dtu").suggestions[0];
    expect(top).toMatchObject({ type: "place", label: "Libraries near Delhi Technological University", lat: 28.75, lng: 77.117 });
  });

  it("generates acronyms for long names (AIIMS)", () => {
    expect(searchLocally(withPlaces, "near aiims").suggestions[0]?.label).toBe("Libraries near All India Institute of Medical Sciences");
  });

  it("offers a server lookup when the place isn't in our data", () => {
    const top = searchLocally(withPlaces, "library near ambience mall").suggestions[0];
    expect(top).toMatchObject({ type: "lookup", query: "ambience mall" });
  });

  it("understands 'near me' and 'nearby'", () => {
    expect(parseQuery("library near me").nearMe).toBe(true);
    expect(parseQuery("libraries nearby").nearMe).toBe(true);
    expect(searchLocally(withPlaces, "library near me").suggestions[0]?.type).toBe("nearme");
  });

  it("suggests landmarks while typing without 'near'", () => {
    expect(searchLocally(withPlaces, "hindu coll").suggestions.some((s) => s.label === "Libraries near Hindu College")).toBe(true);
  });

  it("suggests PIN codes from partial digits", () => {
    const pins = searchLocally(withPlaces, "1100").suggestions.filter((s) => s.type === "pincode");
    expect(pins.map((s) => s.slug)).toEqual(["110009", "110085"]);
  });

  it("transliterates Hindi (Devanagari) input", () => {
    expect(transliterateDevanagari("मुखर्जी नगर")).toBe("mukharji nagar");
    expect(searchLocally(withPlaces, "मुखर्जी नगर").suggestions[0]?.label).toBe("Mukherjee Nagar");
    expect(searchLocally(withPlaces, "रोहिणी").suggestions.some((s) => s.label === "Rohini Sector 7")).toBe(true);
  });

  it("builds acronyms", () => {
    expect(acronymOf("Delhi Technological University")).toBe("dtu");
    expect(acronymOf("Hindu")).toBeNull();
  });
});

describe("near-X ranking", () => {
  it("prefers the real place over a library named after it", () => {
    const tricky = prepareIndex({
      ...index,
      l: [...index.l, ["dtu-library-rohini", "DTU Library", "Rohini", 0, 0, 30, 28715, 77110, 0]],
      p: [["Delhi Technological University", "university", 28750, 77117, "DTU"]],
    });
    expect(searchLocally(tricky, "library near dtu").suggestions[0]?.label).toBe("Libraries near Delhi Technological University");
  });
});

describe("acronym wins", () => {
  it("ranks the place whose short name was typed above a building that starts with it", () => {
    const campus = prepareIndex({
      ...index,
      p: [
        ["DTU Library", "public_library", 28751, 77117, ""],
        ["Delhi Technological University", "university", 28750, 77117, "DTU|DCE"],
      ],
    });
    expect(searchLocally(campus, "library near dtu").suggestions[0]?.label).toBe("Libraries near Delhi Technological University");
    expect(searchLocally(campus, "near dce").suggestions[0]?.label).toBe("Libraries near Delhi Technological University");
  });
});
