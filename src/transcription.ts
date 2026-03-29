import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { execFile } from 'child_process';
import { writeFile, unlink, mkdir, stat } from 'fs/promises';
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

// 16kHz mono 16-bit PCM = 32,000 bytes/sec + 44-byte WAV header
const WAV_BYTES_PER_SEC = 32_000;
const MAX_AUDIO_DURATION_SEC = 120;
// Under memory pressure, whisper can take 10x longer; generous timeout avoids
// killing transcriptions that would eventually succeed
const TIMEOUT_MULTIPLIER = 10;
const TIMEOUT_FLOOR_MS = 30_000;

const WHISPER_DIR = path.join(
  path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1'),
  '..',
  'vendor',
  'whisper',
);
const WHISPER_CLI = path.join(WHISPER_DIR, 'Release', 'whisper-cli.exe');
const WHISPER_MODEL = path.join(WHISPER_DIR, 'ggml-small.bin');
const TEMP_DIR = path.join(WHISPER_DIR, 'tmp');
const FFMPEG =
  process.env.FFMPEG_PATH ||
  'C:\\Users\\YAIR\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe';

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
      '-i',
      tempFile,
      '-ar',
      '16000',
      '-ac',
      '1',
      '-c:a',
      'pcm_s16le',
      wavFile,
      '-y',
    ]);

    // Check audio duration from WAV file size before transcribing
    const wavStat = await stat(wavFile);
    const estimatedDurationSec = Math.round(
      (wavStat.size - 44) / WAV_BYTES_PER_SEC,
    );
    if (estimatedDurationSec > MAX_AUDIO_DURATION_SEC) {
      logger.warn(
        { durationSec: estimatedDurationSec },
        'Voice message exceeds 2-minute limit, skipping transcription',
      );
      return `[Voice message too long (${estimatedDurationSec}s) — transcription supports up to 2 minutes]`;
    }

    let stdout = '';
    try {
      const result = await execFileAsync(
        WHISPER_CLI,
        [
          '-m',
          WHISPER_MODEL,
          '-f',
          wavFile,
          '--no-timestamps',
          '-nt',
          '-l',
          'auto',
          '--no-gpu',
          '-np',
          '--beam-size',
          '1',
          '--best-of',
          '1',
        ],
        {
          timeout: Math.max(
            estimatedDurationSec * TIMEOUT_MULTIPLIER * 1000,
            TIMEOUT_FLOOR_MS,
          ),
        },
      );
      stdout = result.stdout;
    } catch (execErr: any) {
      // whisper-cli writes diagnostics to stderr and may exit non-zero
      // even when transcription succeeded — check stdout before giving up
      if (execErr.killed) {
        logger.error('whisper.cpp killed by timeout');
        return null;
      }
      stdout = execErr.stdout || '';
      if (!stdout.trim()) {
        logger.error({ err: execErr }, 'whisper.cpp transcription failed');
        return null;
      }
      logger.warn('whisper-cli exited non-zero but produced output');
    }

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
      return null;
    }

    logger.info(`Downloaded audio message: ${buffer.length} bytes`);

    const transcript = await transcribeWithWhisperCpp(buffer);

    if (!transcript) {
      return null;
    }

    logger.info(`Transcribed voice message: ${transcript.length} characters`);
    return transcript.trim();
  } catch (err) {
    logger.error({ err }, 'Transcription error');
    return null;
  }
}

export function isVoiceMessage(msg: WAMessage): boolean {
  return msg.message?.audioMessage?.ptt === true;
}
