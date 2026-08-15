import fs from "fs";

import { listUsers } from "./auth";
import { getGlobalReadingSpeedSamplesFilePath } from "./paths";

// CLAUDE-ADDED: Admin-wide reset of the rolling WPM sample buffer (see
// getGlobalReadingSpeedSamplesFilePath) for every user -- e.g. after a bad batch of samples (a bug, a
// device clock issue) has poisoned the pace estimate, it's easier to wipe every user's buffer than
// wait for MAX_SPEED_SAMPLES more genuine reads to dilute the bad data back out.
export function clearAllGlobalReadingSpeedSamples(): number {
  let clearedCount = 0;

  for (const user of listUsers()) {
    try {
      fs.unlinkSync(getGlobalReadingSpeedSamplesFilePath(user.id));
      clearedCount++;
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
    }
  }

  return clearedCount;
}
