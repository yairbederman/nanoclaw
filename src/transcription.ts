import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { execFile } from 'child_process';
import { writeFile, unlink, mkdir } from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

import { logger } from './logger.js';

const execFileAsync = promisify(execFile);

interface TranscriptionConfig {
  enabled: boolean;
  fallbackMessage: string;
}

const DEFAULT_CONFIG: TranscriptionConfig = {
  enabled: true,
  fallbackMessage: '[Voice Message - transcription unavailable]',
};

const WHISPER_DIR = path.join(
  path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1'),
  '..',
  'vendor',
  'whisper',
);
const WHISPER_CLI = path.join(WHISPER_DIR, 'Release', 'whisper-cli.exe');
const WHISPER_MODEL = path.join(WHISPER_DIR, 'ggml-small.bin');
const TEMP_DIR = path.join(WHISPER_DIR, 'tmp');
const FFMPEG = process.env.FFMPEG_PATH || 'C:\\Users\\YAIR\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe';

async function transcribeWithWhisperCpp(
  audioBuffer: Buffer,
): Promise<string | null> {
  const tempFile = path.join(
    TEMP_DIR,
    `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.ogg`,
  );

  const wavFile = tempFile.replace('.ogg', '.wav');

  try {
    await mkdir(TEMP_DIR, { recursive: true });
    await writeFile(tempFile, audioBuffer);

    // Convert OGG/Opus to 16kHz mono WAV — whisper.cpp can't decode OGG directly
    await execFileAsync(FFMPEG, [
      '-i', tempFile, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wavFile, '-y',
    ]);

    const { stdout } = await execFileAsync(
      WHISPER_CLI,
      ['-m', WHISPER_MODEL, '-f', wavFile, '--no-timestamps', '-nt', '-l', 'auto'],
      { timeout: 60_000 },
    );

    const text = stdout.trim();
    return text || null;
  } catch (err) {
    logger.error({ err }, 'whisper.cpp transcription failed');
    return null;
  } finally {
    await unlink(tempFile).catch(() => {});
    await unlink(wavFile).catch(() => {});
  }
}

export async function transcribeAudioMessage(
  msg: WAMessage,
  sock: WASocket,
): Promise<string | null> {
  const config = DEFAULT_CONFIG;

  if (!config.enabled) {
    return config.fallbackMessage;
  }

  try {
    const buffer = (await downloadMediaMessage(
      msg,
      'buffer',
      {},
      {
        logger: console as any,
        reuploadRequest: sock.updateMediaMessage,
      },
    )) as Buffer;

    if (!buffer || buffer.length === 0) {
      logger.error('Failed to download audio message');
      return config.fallbackMessage;
    }

    logger.info(`Downloaded audio message: ${buffer.length} bytes`);

    const transcript = await transcribeWithWhisperCpp(buffer);

    if (!transcript) {
      return config.fallbackMessage;
    }

    logger.info(
      `Transcribed voice message: ${transcript.length} characters`,
    );
    return transcript.trim();
  } catch (err) {
    logger.error({ err }, 'Transcription error');
    return config.fallbackMessage;
  }
}

export function isVoiceMessage(msg: WAMessage): boolean {
  return msg.message?.audioMessage?.ptt === true;
}
