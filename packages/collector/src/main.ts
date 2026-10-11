import { COLLECTOR_CONFIG } from '../collector.config.ts';
import { runCollector } from './run.ts';

// Reading the config proves it loads under Node's type stripping.
const intervalSeconds = COLLECTOR_CONFIG.intervalMs / 1000;

process.exitCode = runCollector(process.argv.slice(2), {
  now: () => new Date(),
  log: (line) => {
    console.log(`${line} interval=${String(intervalSeconds)}s`);
  },
  error: (line) => {
    console.error(line);
  },
});
