// notify-whatsapp.mjs — Standalone WhatsApp notifier using the existing Baileys session.
// Called by run-beedo.ps1 when all restart attempts are exhausted.
// Usage: node notify-whatsapp.mjs "Your message here"

import path from 'path';
import { fileURLToPath } from 'url';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestWaWebVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import pino from 'pino';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_DIR = path.join(__dirname, 'store');
const AUTH_DIR = path.join(STORE_DIR, 'auth');
const TARGET_JID = '972502424521@s.whatsapp.net';
const message = process.argv[2] || 'Beedo is down and could not restart. Check the server.';

const silentLogger = pino({ level: 'silent' });

async function sendNotification() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestWaWebVersion();

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, silentLogger),
    },
    browser: Browsers.macOS('Desktop'),
    printQRInTerminal: false,
    logger: silentLogger,
    connectTimeoutMs: 20000,
  });

  sock.ev.on('creds.update', saveCreds);

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Connection timeout')), 25000);
    let done = false;

    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
      if (connection === 'open') {
        clearTimeout(timeout);
        try {
          await sock.sendMessage(TARGET_JID, { text: message });
          console.log('[notify] Message sent.');
        } catch (err) {
          console.error('[notify] Failed to send message:', err.message);
        } finally {
          done = true;
          sock.end(undefined); // close connection without logging out
          resolve();
        }
      } else if (connection === 'close' && !done) {
        clearTimeout(timeout);
        const code = lastDisconnect?.error?.output?.statusCode;
        reject(new Error(`Connection closed before sending: ${code}`));
      }
    });
  });
}

sendNotification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[notify] Error:', err.message);
    process.exit(1);
  });
