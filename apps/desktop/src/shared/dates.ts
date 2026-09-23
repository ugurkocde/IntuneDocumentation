// The calendar date on this computer as YYYY-MM-DD. File names use it so an
// export made after local midnight carries today's date, not the UTC date.
export function localDateStamp(date: Date = new Date()): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
