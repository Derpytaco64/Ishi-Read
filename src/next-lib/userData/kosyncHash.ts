import fs from "fs";
import crypto from "crypto";

// CLAUDE-ADDED: Reimplements KOReader's "kosync" partial-MD5 document hash -- 12 samples of up to
// 1KB each, taken at exponentially-spaced offsets (1024 * 2^i for i = -1..10, i.e. 512B through 1MB),
// fed into one running MD5 context. It identifies a book by its actual bytes rather than its path, so
// a renamed/moved file still resolves to the same identity. Implemented from the published algorithm,
// not verified byte-for-byte against a live KOReader install -- stable for our own use, but re-check
// against a real KOReader-computed hash before relying on it for interop with the real kosync ecosystem.
export function computePartialMD5(filePath: string): string {
  const fd = fs.openSync(filePath, "r");

  try {
    const hash = crypto.createHash("md5");
    const step = 1024;
    const buffer = Buffer.alloc(step);

    for (let i = -1; i <= 10; i++) {
      const offset = step * Math.pow(2, i);
      const bytesRead = fs.readSync(fd, buffer, 0, step, offset);
      if (bytesRead <= 0) break;
      hash.update(buffer.subarray(0, bytesRead));
    }

    return hash.digest("hex");
  } finally {
    fs.closeSync(fd);
  }
}
