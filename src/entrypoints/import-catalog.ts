import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { db, pool } from '@/db';
import { parseCatalog } from '@/lib/catalog/export-format';
import { copyImages, importCatalog } from '@/lib/catalog/import';
import { CARD_IMAGES_DIR } from '@/lib/uploads';

// Run by `docker compose exec worldup-worker node import-catalog.js` once the
// pipeline's export (scripts/README.md) is in ./import, mounted read-only at
// /app/import; locally by `npm run import-catalog`. Safe to run again.
async function main() {
  const importDir = process.env.IMPORT_DIR ?? path.join(process.cwd(), 'import');
  const catalog = parseCatalog(JSON.parse(await readFile(path.join(importDir, 'catalog.json'), 'utf8')));
  console.log(`catalog.json: ${catalog.cards.length} cards, ${catalog.series.length} series, generated ${catalog.generated_at}`);

  const copied = await copyImages(catalog, path.join(importDir, 'images'), CARD_IMAGES_DIR);
  console.log(`${copied} photo files copied to ${CARD_IMAGES_DIR}`);

  const report = await importCatalog(db, catalog);
  const hidden = Object.entries(report.hidden).map(([reason, count]) => `${reason} ${count}`).join(', ');
  console.log(`${report.inserted} cards added, ${report.updated} updated, ${report.series} series`);
  console.log(`hidden cards: ${hidden || 'none'}`);
  if (report.notInExport > 0) console.log(`${report.notInExport} cards of the game are not in this export: left as they are`);
}

main()
  .then(() => pool.end())
  .catch((error) => {
    console.error('Import failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
