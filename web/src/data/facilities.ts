// Bundled so the calm screen never waits on the network.
// Transcribed from the official KubeCon NA 2026 accessibility page.
// Hours are not published, so they stay unlisted until someone verifies them.
export interface Place {
  id: string;
  name: string;
  venue: string;
  level: number;
  hours: string | null;
  source: string;
  checkedOn: string;
}

export const VENUE_SOURCE =
  "https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/attend/inclusion-accessibility/";
export const VENUE_CHECKED_ON = "2026-11-09";
export const VENUE_SOURCE_LINE =
  "Source: KubeCon + CloudNativeCon NA 2026 Inclusion + Accessibility page, checked Nov 9, 2026";

const cited = { source: VENUE_SOURCE, checkedOn: VENUE_CHECKED_ON } as const;

// Facts the page states in words and that have no hours. Each text is the page's
// own sentence(s). Hours are not published, so none are shown.
export interface VenueFact {
  id: string;
  title: string;
  text: string;
  source: string;
  checkedOn: string;
}

export const quietRoom: Place = {
  id: "quiet-260a",
  name: "Quiet Room 260A",
  venue: "Salt Palace",
  level: 2,
  hours: null,
  ...cited,
};

export const restrooms: Place[] = [
  { id: "r-sp2", name: "Outside 255", venue: "Salt Palace", level: 2, hours: null, ...cited },
  {
    id: "r-sp1",
    name: "Solutions Showcase, Halls A-C, Halls 1-5, Amber Hive Zone",
    venue: "Salt Palace",
    level: 1,
    hours: null,
    ...cited,
  },
  {
    id: "r-hy1",
    name: "Hotel lobby, by the entrance doors to the Salt Palace",
    venue: "Hyatt Regency",
    level: 1,
    hours: null,
    ...cited,
  },
  { id: "r-hy2", name: "By Juniper", venue: "Hyatt Regency", level: 2, hours: null, ...cited },
  { id: "r-hy3", name: "By Powder Mountain", venue: "Hyatt Regency", level: 3, hours: null, ...cited },
  { id: "r-hy4", name: "By Broadcast Lounge", venue: "Hyatt Regency", level: 4, hours: null, ...cited },
];

export const venueFacts: VenueFact[] = [
  {
    id: "first-aid",
    title: "First aid and medical assistance",
    text: "First Aid stations located in the Salt Palace Convention Center, Level 1, by Room 150 or outside Halls 2 + 3. For emergencies, please dial 911.",
    ...cited,
  },
  {
    id: "prayer-room",
    title: "Prayer room",
    text: "Hyatt Regency | Level 5 | Zion",
    ...cited,
  },
  {
    id: "nursing-room",
    title: "Nursing room",
    text: "For location information, please check with registration or information desk staff onsite.",
    ...cited,
  },
  {
    id: "captions",
    title: "Captions",
    text: "Captioning will be available for attendees in 60+ languages through Wordly. See instructions in each breakout room to utilize captioning.",
    ...cited,
  },
  {
    id: "reserved-seating",
    title: "Reserved seating",
    text: "Reserved seating is available in each session for those who have accessibility needs. If you need assistance onsite, please ask a staff member.",
    ...cited,
  },
  {
    id: "quiet-rule",
    title: "Quiet rooms",
    text: "Please refrain from conversation, interaction, or work in these spaces.",
    ...cited,
  },
];
