// Allocation metadata only: existing proposal references are never renumbered.
export function referenceYear(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Kolkata' }).format(date));
}
export const referencePrefix = year => `KTM/${year}/Solar/`;
export const counterDDL = `CREATE TABLE IF NOT EXISTS proposal_reference_counters (year INTEGER PRIMARY KEY, sequence INTEGER NOT NULL)`;
// One atomic UPSERT reserves a number across concurrent Worker isolates. Seed
// above existing numeric references; retain the high-water mark after deletion.
export const reserveSQL = `INSERT INTO proposal_reference_counters (year, sequence)
SELECT ?, COALESCE(MAX(CASE WHEN ref LIKE ? AND length(substr(ref, ?)) BETWEEN 1 AND 9
 AND substr(ref, ?) NOT GLOB '*[^0-9]*' THEN CAST(substr(ref, ?) AS INTEGER) ELSE 0 END), 0) + 1
FROM proposals WHERE 1
ON CONFLICT(year) DO UPDATE SET sequence = MAX(sequence + 1, excluded.sequence)
RETURNING sequence`;
export async function reserveCloudReference(db, date = new Date()) {
  const year = referenceYear(date), prefix = referencePrefix(year), offset = prefix.length + 1;
  await db.prepare(counterDDL).run();
  const result = await db.prepare(reserveSQL).bind(year, prefix+'%', offset, offset, offset).first();
  if (!result || !Number.isSafeInteger(result.sequence) || result.sequence < 1) throw new Error('Could not allocate a proposal reference. Please try again.');
  return prefix + String(result.sequence).padStart(3, '0');
}
