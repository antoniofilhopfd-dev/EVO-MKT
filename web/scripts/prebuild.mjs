// Embute os arquivos db/migrations/NNN_nome.sql em lib/migrations.generated.ts
// (o app aplica as pendentes ao iniciar). Nunca edite uma migração já aplicada: crie uma nova.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'db', 'migrations');
const files = readdirSync(dir).filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f)).sort();
const items = files.map((f) => ({ name: f, sql: readFileSync(join(dir, f), 'utf8') }));
const out =
  '// GERADO por scripts/prebuild.mjs — não edite.\n' +
  'export const MIGRATIONS: { name: string; sql: string }[] = ' +
  JSON.stringify(items, null, 2) +
  ';\n';
writeFileSync(join(root, 'lib', 'migrations.generated.ts'), out);
console.log(`prebuild: ${items.length} migração(ões) embutida(s)`);
