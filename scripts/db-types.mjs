// Generate the Supabase TypeScript types from the local stack and write them
// atomically. Cross-platform (no shell redirect or `mv`): captures the CLI's
// stdout as bytes and renames a temp file into place, creating src/types/ if it
// does not exist yet. Run via `pnpm db:types` (the local stack must be running).
import { execSync } from 'node:child_process';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';

const target = 'src/types/database.ts';
const tmp = `${target}.tmp`;

const types = execSync('supabase gen types typescript --local', {
  maxBuffer: 32 * 1024 * 1024,
});

mkdirSync('src/types', { recursive: true });
writeFileSync(tmp, types);
renameSync(tmp, target);
