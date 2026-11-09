import { describe, expect, it } from "vitest";
import {
  cleanLibraryForm,
  emptyLibraryFormValues,
  hoursError,
  libraryToFormValues,
  newPlanRow,
  phoneError,
  timeFromDigits,
  validateLibraryForm,
} from "@/lib/library-form";
import { canonicalMapLink, classifyLocationInput, decodePlusCode, extractCoordinatesFromMapLink, findUrlInText, parseCoordinatesText } from "@/lib/maps-coordinates";

const validOwner = () => ({
  ...emptyLibraryFormValues(),
  display_name: "Study Point",
  city: "Delhi",
  locality: "Laxmi Nagar",
  state: "Delhi",
  pin_code: "110092",
  full_address: "12 Vikas Marg",
  map_link: "https://maps.app.goo.gl/abc",
  hours_mode: "24h" as const,
  phone_number: "98765 43210",
  amenities: ["AC"],
  total_seats: "80",
});

describe("reading locations", () => {
  const cases: Array<[string, string, number, number]> = [
    ["place pin beats map centre", "https://www.google.com/maps/place/X/@28.60,77.20,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x1!8m2!3d28.6306!4d77.2774", 28.6306, 77.2774],
    ["centre only", "https://www.google.com/maps/@28.6306,77.2774,15z", 28.6306, 77.2774],
    ["WhatsApp style q", "https://maps.google.com/maps?q=28.6306%2C77.2774&z=17", 28.6306, 77.2774],
    ["q with loc and name", "https://maps.google.com/?q=loc:28.6306+77.2774", 28.6306, 77.2774],
    ["directions", "https://www.google.com/maps/dir/?api=1&destination=28.6306,77.2774", 28.6306, 77.2774],
    ["search api", "https://www.google.com/maps/search/?api=1&query=28.6306,77.2774", 28.6306, 77.2774],
    ["embed", "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3502!2d77.2774!3d28.6306!2m3", 28.6306, 77.2774],
    ["apple", "https://maps.apple.com/?ll=28.6306,77.2774&q=Library", 28.6306, 77.2774],
    ["osm marker", "https://www.openstreetmap.org/?mlat=28.6306&mlon=77.2774#map=17/28.6/77.2", 28.6306, 77.2774],
    ["osm hash", "https://www.openstreetmap.org/#map=17/28.6306/77.2774", 28.6306, 77.2774],
    ["bing", "https://www.bing.com/maps?cp=28.6306~77.2774&lvl=16", 28.6306, 77.2774],
  ];
  it.each(cases)("%s", (_name, link, lat, lng) => {
    expect(extractCoordinatesFromMapLink(link)).toEqual({ latitude: lat, longitude: lng });
  });

  it("doesn't invent coordinates from a place name with numbers", () => {
    expect(extractCoordinatesFromMapLink("https://www.google.com/maps/place/Sector+24,+110085")).toBeNull();
  });

  it("reads typed coordinates in every common form", () => {
    expect(parseCoordinatesText("28.6306, 77.2774")).toEqual({ latitude: 28.6306, longitude: 77.2774 });
    expect(parseCoordinatesText("28.6306 77.2774")).toEqual({ latitude: 28.6306, longitude: 77.2774 });
    expect(parseCoordinatesText("lat: 28.6306 long: 77.2774")).toEqual({ latitude: 28.6306, longitude: 77.2774 });
    expect(parseCoordinatesText("28.6306 N, 77.2774 E")).toEqual({ latitude: 28.6306, longitude: 77.2774 });
    expect(parseCoordinatesText(`28°37'50.2"N 77°16'38.6"E`)?.latitude).toBeCloseTo(28.6306, 3);
    expect(parseCoordinatesText("hello")).toBeNull();
  });

  it("fixes swapped coordinates for India", () => {
    expect(parseCoordinatesText("77.2774, 28.6306")).toEqual({ latitude: 28.6306, longitude: 77.2774 });
  });

  it("decodes full plus codes", () => {
    const point = decodePlusCode("7JWVJ7J3+6W");
    expect(point?.latitude).toBeCloseTo(28.63056, 3);
    expect(point?.longitude).toBeCloseTo(77.25481, 3);
    expect(decodePlusCode("hello")).toBeNull();
  });

  it("finds the link inside messages, embeds and scheme-less text", () => {
    expect(findUrlInText("Our library: https://maps.app.goo.gl/AbC123 please visit.")).toBe("https://maps.app.goo.gl/AbC123");
    expect(findUrlInText('<iframe src="https://www.google.com/maps/embed?pb=!2d77.2!3d28.6&amp;x=1" width="600"></iframe>')).toBe("https://www.google.com/maps/embed?pb=!2d77.2!3d28.6&x=1");
    expect(findUrlInText("maps.app.goo.gl/AbC123")).toBe("https://maps.app.goo.gl/AbC123");
  });

  it("classifies input", () => {
    expect(classifyLocationInput("28.63, 77.27")?.type).toBe("coordinates");
    expect(classifyLocationInput("maps.app.goo.gl/x")?.type).toBe("url");
    expect(classifyLocationInput("7JWVJ7J3+6W")?.type).toBe("coordinates");
    expect(classifyLocationInput("J7J3+6W Delhi")?.type).toBe("text");
    expect(classifyLocationInput("")).toBeNull();
  });

  it("always stores a Google link", () => {
    expect(canonicalMapLink("https://maps.apple.com/?ll=28.6,77.2", { latitude: 28.6, longitude: 77.2 })).toContain("google.com/maps");
    expect(canonicalMapLink("https://maps.app.goo.gl/x", { latitude: 28.6, longitude: 77.2 })).toBe("https://maps.app.goo.gl/x");
    expect(canonicalMapLink("28.6, 77.2", { latitude: 28.6, longitude: 77.2 })).toContain("query=28.6,77.2");
  });
});

describe("entering times", () => {
  it.each([
    ["9", "AM", "09:00"],
    ["9", "PM", "21:00"],
    ["12", "AM", "00:00"],
    ["12", "PM", "12:00"],
    ["930", "AM", "09:30"],
    ["930", "PM", "21:30"],
    ["1130", "PM", "23:30"],
    ["0930", "AM", "09:30"],
  ] as const)("%s %s -> %s", (digits, meridiem, expected) => {
    expect(timeFromDigits(digits, meridiem)).toBe(expected);
  });
  it("rejects impossible times", () => {
    for (const digits of ["0", "13", "1360", "975", "", "abc"]) expect(timeFromDigits(digits, "AM")).toBeNull();
  });
});

describe("validation", () => {
  it("accepts a minimal owner form", () => {
    expect(validateLibraryForm(validOwner(), { mode: "owner" })).toEqual({});
  });

  it("gives a precise reason for a short phone number", () => {
    expect(phoneError("98765")).toBe("That number has 5 digits. Enter all 10.");
  });

  it("allows overnight and 24 hour libraries, not impossible hours", () => {
    expect(hoursError({ mode: "set", opening: "18:00", closing: "02:00" }, true)).toBeNull();
    expect(hoursError({ mode: "24h", opening: "", closing: "" }, true)).toBeNull();
    expect(hoursError({ mode: "set", opening: "09:00", closing: "09:00" }, true)).toContain("same time");
    expect(hoursError({ mode: "set", opening: "09:00", closing: "" }, true)).toContain("closing");
  });

  it("doesn't let old bad data block an unrelated edit", () => {
    const row = { display_name: "Old", locality: "A", city: "Delhi", pin_code: "01234", phone_number: "12345", total_seats: 9000 };
    const baseline = libraryToFormValues(row);
    expect(validateLibraryForm({ ...baseline, display_name: "New name" }, { mode: "staff", baseline })).toEqual({});
    expect(validateLibraryForm({ ...baseline, phone_number: "999" }, { mode: "staff", baseline }).phone_number).toBeTruthy();
  });

  it("only needs a price for a plan, and blank hours mean the full day", () => {
    const form = { ...validOwner(), plans: [newPlanRow({ base_price: "2500" })] };
    expect(validateLibraryForm(form, { mode: "owner" })).toEqual({});
    expect(cleanLibraryForm(form).plans[0].hours_per_day).toBe(24);
  });

  it("ignores blank plan rows and flags duplicates", () => {
    const blank = { ...validOwner(), plans: [newPlanRow()] };
    expect(validateLibraryForm(blank, { mode: "owner" })).toEqual({});
    expect(cleanLibraryForm(blank).plans).toEqual([]);
    const twice = { ...validOwner(), plans: [newPlanRow({ base_price: "2000" }), newPlanRow({ base_price: "2100" })] };
    expect(validateLibraryForm(twice, { mode: "owner" })["plans.1.duration_key"]).toContain("Same as plan 1");
  });

  it("treats a landline with Same as phone as no WhatsApp", () => {
    const form = { ...validOwner(), phone_number: "011 2345 6789", whatsapp_same: true };
    expect(validateLibraryForm(form, { mode: "owner" }).whatsapp_number).toBeUndefined();
    expect(cleanLibraryForm(form).whatsapp_number).toBeNull();
  });

  it("flags swapped or foreign coordinates typed by hand", () => {
    expect(validateLibraryForm({ ...validOwner(), latitude: "77.27", longitude: "28.63" }, { mode: "owner" }).latitude).toContain("swapped");
    expect(validateLibraryForm({ ...validOwner(), latitude: "51.5", longitude: "-0.12" }, { mode: "owner" }).latitude).toContain("outside India");
  });

  it("accepts coordinates without a link for owners", () => {
    expect(validateLibraryForm({ ...validOwner(), map_link: "", latitude: "28.63", longitude: "77.27" }, { mode: "owner" }).map_link).toBeUndefined();
    expect(validateLibraryForm({ ...validOwner(), map_link: "" }, { mode: "owner" }).map_link).toBeTruthy();
  });
});
