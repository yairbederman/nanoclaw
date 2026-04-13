/**
 * Container runtime abstraction for NanoClaw.
 * All runtime-specific logic lives here so swapping runtimes means changing one file.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';

import { logger } from './logger.js';

/** The container runtime binary name. */
export const CONTAINER_RUNTIME_BIN = detectRuntimeBin();

function detectRuntimeBin(): string {
  // Prefer 'container' (Apple Container) on macOS if available
  if (os.platform() === 'darwin') {
    try {
      // Safe: no user input, hardcoded command
      execSync('container --version', { stdio: 'pipe' });
      return 'container';
    } catch { /* fall through to docker */ }
  }
  return 'docker';
}

/**
 * IP address containers use to reach the host machine.
 * Docker: host.docker.internal (resolved via --add-host on Linux).
 * Apple Container: bridge network gateway (192.168.64.x).
 */
export const CONTAINER_HOST_GATEWAY = detectHostGateway();

function detectHostGateway(): string {
  if (CONTAINER_RUNTIME_BIN === 'container') {
    // Apple Container on macOS: containers reach the host via the bridge network gateway
    const ifaces = os.networkInterfaces();
    const bridge = ifaces['bridge100'] || ifaces['bridge0'];
    if (bridge) {
      const ipv4 = bridge.find((a) => a.family === 'IPv4');
      if (ipv4) return ipv4.address;
    }
    return '192.168.64.1';
  }
  // Docker: host.docker.internal works on macOS/Windows, added via --add-host on Linux
  return 'host.docker.internal';
}

/**
 * Address the credential proxy binds to.
 * Must be set via CREDENTIAL_PROXY_HOST in .env — there is no safe default
 * for Apple Container because bridge100 only exists while containers run,
 * but the proxy must start before any container.
 * The /convert-to-apple-container skill sets this during setup.
 */
export const PROXY_BIND_HOST = process.env.CREDENTIAL_PROXY_HOST || '127.0.0.1';

/** CLI args needed for the container to resolve the host gateway. */
export function hostGatewayArgs(): string[] {
  // On Linux, host.docker.internal isn't built-in — add it explicitly
  if (os.platform() === 'linux') {
    return ['--add-host=host.docker.internal:host-gateway'];
  }
  return [];
}

/** Returns CLI args for a readonly bind mount. */
export function readonlyMountArgs(
  hostPath: string,
  containerPath: string,
): string[] {
  return [
    '--mount',
    `type=bind,source=${hostPath},target=${containerPath},readonly`,
  ];
}

/** Stop a container by name. Uses execFileSync to avoid shell injection. */
export function stopContainer(name: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)) {
    throw new Error(`Invalid container name: ${name}`);
  }
  execSync(`${CONTAINER_RUNTIME_BIN} stop ${name}`, { stdio: 'pipe' });
}

/** Ensure the container runtime is running, starting it if needed. */
export function ensureContainerRuntimeRunning(): void {
  const isAppleContainer = CONTAINER_RUNTIME_BIN === 'container';
  const statusCmd = isAppleContainer
    ? `${CONTAINER_RUNTIME_BIN} system status`
    : `${CONTAINER_RUNTIME_BIN} info`;
  const startCmd = isAppleContainer
    ? `${CONTAINER_RUNTIME_BIN} system start`
    : null; // Docker Desktop auto-starts; no start command needed

  try {
    execSync(statusCmd, { stdio: 'pipe' });
    logger.debug('Container runtime already running');
  } catch {
    if (startCmd) {
      logger.info('Starting container runtime...');
      try {
        execSync(startCmd, { stdio: 'pipe', timeout: 30000 });
        logger.info('Container runtime started');
      } catch (err) {
        logger.error({ err }, 'Failed to start container runtime');
        throw new Error('Container runtime is required but failed to start');
      }
    } else {
      logger.error('Container runtime (Docker) is not running');
      console.error('\nFATAL: Docker is not running. Start Docker Desktop and restart NanoClaw.\n');
      throw new Error('Container runtime is required but failed to start');
    }
  }
}

/** Kill orphaned NanoClaw containers from previous runs. */
export function cleanupOrphans(): void {
  try {
    let orphans: string[];
    if (CONTAINER_RUNTIME_BIN === 'container') {
      // Apple Container: `container ls --format json`
      const output = execSync(`${CONTAINER_RUNTIME_BIN} ls --format json`, {
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf-8',
      });
      const containers: { status: string; configuration: { id: string } }[] =
        JSON.parse(output || '[]');
      orphans = containers
        .filter(
          (c) =>
            c.status === 'running' && c.configuration.id.startsWith('nanoclaw-'),
        )
        .map((c) => c.configuration.id);
    } else {
      // Docker: `docker ps --format`
      const output = execSync(
        `${CONTAINER_RUNTIME_BIN} ps --filter "name=nanoclaw-" --format "{{.Names}}"`,
        { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8' },
      );
      orphans = output.trim().split('\n').filter(Boolean);
    }
    for (const name of orphans) {
      try {
        stopContainer(name);
      } catch {
        /* already stopped */
      }
    }
    if (orphans.length > 0) {
      logger.info(
        { count: orphans.length, names: orphans },
        'Stopped orphaned containers',
      );
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to clean up orphaned containers');
  }
}
