import fs from 'fs';
import path from 'path';

const PID_FILE = path.join(process.cwd(), 'nanoclaw.pid');

export function writePidFile(): void {
  fs.writeFileSync(PID_FILE, String(process.pid), 'utf-8');
}

export function removePidFile(): void {
  try {
    fs.unlinkSync(PID_FILE);
  } catch {
    /* already gone */
  }
}
