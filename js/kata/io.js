// Loading and saving kata JSON files.
import { normalizeKata } from './schema.js';

// Katas shipped in /katas are added to the library on first run.
const bundled = import.meta.glob('../../katas/*.json', { eager: true, import: 'default' });

export function bundledKatas() {
  const byId = new Map();
  for (const [path, raw] of Object.entries(bundled)) {
    const kata = normalizeKata(raw);
    if (byId.has(kata.id)) {
      console.warn(`${path} has the same id ("${kata.id}") as ${byId.get(kata.id).path}; only one will be loaded. Give each kata file a unique "id".`);
      continue;
    }
    byId.set(kata.id, { path, kata });
  }
  return [...byId.values()].map((v) => v.kata);
}

export async function readKataFile(file) {
  return normalizeKata(JSON.parse(await file.text()));
}

export function downloadKata(kata) {
  const blob = new Blob([JSON.stringify(kata, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (kata.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'kata') + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
