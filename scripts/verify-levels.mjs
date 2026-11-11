// Replays every stored level solution headlessly. Levels arrive in stage 4; until then there is nothing to replay.
import { existsSync } from 'node:fs';
const levelsFile = new URL('../src/levels/levels.js', import.meta.url);
if (!existsSync(levelsFile)) { console.log('verify-levels: no levels yet (ok before stage 4)'); process.exit(0); }
console.error('verify-levels: replay not implemented yet'); process.exit(1);
