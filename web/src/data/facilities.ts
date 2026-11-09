// Bundled so the calm screen never waits on the network.
// Transcribed from the official KubeCon NA 2026 accessibility page.
// Hours are not published, so they stay unlisted until someone verifies them.
export interface Place {
  id: string;
  name: string;
  venue: string;
  level: number;
  hours: string | null;
}

export const quietRoom: Place = {
  id: "quiet-260a",
  name: "Quiet Room 260A",
  venue: "Salt Palace",
  level: 2,
  hours: null,
};

export const restrooms: Place[] = [
  { id: "r-sp2", name: "Outside 255", venue: "Salt Palace", level: 2, hours: null },
  {
    id: "r-sp1",
    name: "Solutions Showcase, Halls A-C, Halls 1-5, Amber Hive Zone",
    venue: "Salt Palace",
    level: 1,
    hours: null,
  },
  {
    id: "r-hy1",
    name: "Hotel lobby, by the entrance doors to the Salt Palace",
    venue: "Hyatt Regency",
    level: 1,
    hours: null,
  },
  { id: "r-hy2", name: "By Juniper", venue: "Hyatt Regency", level: 2, hours: null },
  { id: "r-hy3", name: "By Powder Mountain", venue: "Hyatt Regency", level: 3, hours: null },
  { id: "r-hy4", name: "By Broadcast Lounge", venue: "Hyatt Regency", level: 4, hours: null },
];
