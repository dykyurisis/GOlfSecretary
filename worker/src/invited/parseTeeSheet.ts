export type Slot = { club: string; course: string; date: string; time: string; slotsAvailable: number };

// Parses the CCTTWEB tee-sheet HTML into rows. Resilient to whitespace; reads each
// `tr.cc-tee-time-row` block: club/course/date divs, the tee-time span, and `.cc-col-players`.
export function parseTeeSheet(html: string): Slot[] {
  const rows = html.split(/<tr[^>]*class="[^"]*cc-tee-time-row[^"]*"[^>]*>/i).slice(1);
  const out: Slot[] = [];
  const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  for (const row of rows) {
    const block = row; // each split chunk already spans exactly one row (up to the next cc-tee-time-row); do NOT split on </tr> — the time cell contains a nested <tr>
    const divs = [...block.matchAll(/<div(?![^>]*cc-col-action-only)[^>]*>([\s\S]*?)<\/div>/gi)]
      .map(m => decode(m[1].replace(/<[^>]+>/g, ' ')))
      .filter(Boolean);
    const time = (block.match(/cc-tee-time-subtable[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/i) || [])[1];
    const players = (block.match(/cc-col-players[^>]*>([\s\S]*?)<\/div>/i) || [])[1];
    const club = divs.find(d => /Club|Coto|Aliso|Old Ranch/i.test(d));
    const course = divs.find(d => /COURSE/i.test(d));
    const date = divs.find(d => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i.test(d));
    if (!club || !course || !date || !time) continue;
    out.push({ club, course, date: decode(date), time: decode(time), slotsAvailable: parseInt(decode(players || '0'), 10) || 0 });
  }
  return out;
}

// Parses ONE row of the CCTTWEB "Available Tee Times" grid (per date tab + selected
// course) from its textContent. The cells render without separators, e.g.
//   "07:20 AM NORTH COURSEThu 07/2307:20 AM3"
//    ^reserve-btn ^course      ^play-date^tee-time^player-slots-available (trailing #)
// Returns null for header/spacer rows that have no tee time. Course is read from the
// row text (self-contained); the trailing integer is the available-slot count (0 = full).
export function parseGridRow(text: string): Slot | null {
  const t = text.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  const time = (t.match(/(\d{1,2}:\d{2}\s*[AP]M)/i) || [])[1];
  const date = t.match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*(\d{2}\/\d{2})/i);
  if (!time || !date) return null;
  const courseM = t.match(/(NORTH|SOUTH)\s*COURSE/i);
  const slotsM = t.match(/(\d+)\s*$/);
  return {
    club: 'Coto de Caza Golf & Racquet Club',
    course: courseM ? `${courseM[1].toUpperCase()} COURSE` : '',
    date: `${date[1]} ${date[2]}`,
    time: time.replace(/\s+/g, ' ').toUpperCase(),
    slotsAvailable: slotsM ? parseInt(slotsM[1], 10) : 0,
  };
}
