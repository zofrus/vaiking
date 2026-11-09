// The schedule writes a room as a path: "Salt Palace | Level 2 | 250 D-F".
// Read aloud or on a small screen, commas are plainer than bars.
export function placeLabel(room: string): string {
  return room
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}
