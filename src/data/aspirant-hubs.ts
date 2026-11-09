/**
 * Areas students move to for exam preparation. The words here are editorial;
 * every number on the page comes from live listings.
 *
 * `costs` is optional and only rendered when filled with figures we have
 * actually checked. Leave it out rather than guessing.
 */
export type AspirantHub = {
  slug: string;
  name: string;
  citySlug: string;
  localities: string[];
  radiusKm: number;
  exams: string[];
  intro: string;
  gettingAround: string;
  tips: string[];
  costs?: Array<{ label: string; value: string; checkedOn: string }>;
};

export const ASPIRANT_HUBS: AspirantHub[] = [
  {
    slug: "rajendra-nagar-delhi",
    name: "Rajendra Nagar",
    citySlug: "delhi",
    localities: ["Rajendra Nagar", "New Rajendra Nagar"],
    radiusKm: 2,
    exams: ["UPSC"],
    intro: "Old and New Rajendra Nagar in central Delhi are among the best-known places in India to prepare for the UPSC Civil Services exam, with coaching institutes, reading rooms and student housing packed into a few lanes.",
    gettingAround: "The area sits between the Rajendra Place and Karol Bagh stations on the Blue Line.",
    tips: [
      "Ask whether any study space is in a basement, and see the exits yourself. Basement study rooms in this area were at the centre of the 2024 flooding deaths and the crackdown that followed.",
      "Seats fill around new coaching batches, so visit before a batch starts if you can.",
      "Try a library for a day before paying for a month. Noise and crowding change a lot between morning and evening.",
    ],
  },
  {
    slug: "mukherjee-nagar-delhi",
    name: "Mukherjee Nagar",
    citySlug: "delhi",
    localities: ["Mukherjee Nagar", "Vijay Nagar", "Kamla Nagar"],
    radiusKm: 2.5,
    exams: ["UPSC", "SSC", "Banking"],
    intro: "Mukherjee Nagar in north Delhi is a long-standing base for UPSC, SSC and banking aspirants, close to Delhi University's North Campus.",
    gettingAround: "GTB Nagar and Vishwavidyalaya on the Yellow Line are the usual stations for this area.",
    tips: [
      "Compare libraries in Vijay Nagar and Kamla Nagar too. They are a short ride away and often less crowded.",
      "Check closing time if you plan to study late, and whether the walk back is well lit.",
      "Ask what happens to your seat if you miss a few days. Reserved and unreserved seats work differently.",
    ],
  },
  {
    slug: "laxmi-nagar-delhi",
    name: "Laxmi Nagar",
    citySlug: "delhi",
    localities: ["Laxmi Nagar"],
    radiusKm: 2,
    exams: ["CA", "SSC", "Banking"],
    intro: "Laxmi Nagar in east Delhi is a busy study neighbourhood for CA, SSC and banking students, with coaching centres, reading rooms and rented rooms close together.",
    gettingAround: "Laxmi Nagar station is on the Blue Line, and Nirman Vihar is one stop further.",
    tips: [
      "Lanes here get crowded and noisy, so check the library at the hour you actually plan to study.",
      "Ask about power backup and AC during summer before you pay for several months.",
      "Confirm the seat you are shown is the seat you are paying for.",
    ],
  },
  {
    slug: "karol-bagh-delhi",
    name: "Karol Bagh",
    citySlug: "delhi",
    localities: ["Karol Bagh"],
    radiusKm: 1.5,
    exams: ["UPSC", "SSC"],
    intro: "Karol Bagh, next to Rajendra Nagar, gives UPSC and SSC students access to the same coaching belt along with a large market for daily needs.",
    gettingAround: "Karol Bagh station on the Blue Line is the main stop.",
    tips: [
      "Market traffic is heavy, so a library set back from the main road is usually quieter.",
      "Compare with nearby Rajendra Nagar before deciding.",
    ],
  },
  {
    slug: "katwaria-sarai-delhi",
    name: "Katwaria Sarai and Jia Sarai",
    citySlug: "delhi",
    localities: ["Katwaria Sarai", "Jia Sarai"],
    radiusKm: 2,
    exams: ["UPSC", "JEE", "GATE"],
    intro: "Katwaria Sarai and Jia Sarai in south Delhi sit beside IIT Delhi and JNU, and are popular with students who want to live near campus while preparing.",
    gettingAround: "Hauz Khas on the Yellow and Magenta Lines is the nearest major interchange.",
    tips: [
      "Many buildings here are narrow. Check that the library has a clear way out.",
      "Ask whether Wi-Fi is included, as many students here study online.",
    ],
  },
  {
    slug: "ashok-nagar-hyderabad",
    name: "Ashok Nagar",
    citySlug: "hyderabad",
    localities: ["Ashok Nagar"],
    radiusKm: 2,
    exams: ["UPSC", "State PSC", "SSC"],
    intro: "Ashok Nagar in Hyderabad is the city's best-known area for competitive exam preparation, with coaching institutes and reading rooms close together.",
    gettingAround: "Chikkadpally and RTC X Roads are the nearest landmarks, and RTC X Roads metro station is close by.",
    tips: [
      "Reading rooms here vary widely, so visit two or three before paying.",
      "Check how seats are allotted during state recruitment seasons, when demand rises.",
    ],
  },
  {
    slug: "prayagraj-exam-prep",
    name: "Prayagraj",
    citySlug: "prayagraj",
    localities: ["Allahpur", "Katra", "George Town", "Civil Lines", "Chakia"],
    radiusKm: 6,
    exams: ["UPSC", "UPPSC", "SSC"],
    intro: "Prayagraj has long drawn students preparing for government exams, especially UPPSC and SSC, around the University of Allahabad and the neighbourhoods near it.",
    gettingAround: "Most study areas are a short auto ride from Prayagraj Junction.",
    tips: [
      "Check the fan or cooler situation before summer, when many reading rooms get very warm.",
      "Ask about the closing time during exam season, as some rooms stay open later.",
    ],
  },
];

export function getAspirantHub(slug: string) {
  return ASPIRANT_HUBS.find((hub) => hub.slug === slug) ?? null;
}

/** Below this many libraries, a guide would have nothing useful to show. */
export const MIN_HUB_LIBRARIES = 10;
