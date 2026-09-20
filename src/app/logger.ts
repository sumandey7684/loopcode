import * as fs from 'node:fs';
import * as path from 'node:path';
import { EventBus, makeEvent, type NoticeEvent } from './events.js';
import { redact } from './redact.js';
import { logFile, ensureDir } from '../platform/paths.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Single logging entry point.
 *
 * - User-facing lines go to the EventBus as notices, so the TUI renders them.
 * - Everything (including debug) goes to a rotating file for postmortems.
 * - Nothing is written to stdout while the TUI owns the terminal.
 */
export class Logger {
  private bus: EventBus | null = null;
  private minLevel: LogLevel;
  private stream: fs.WriteStream | null = null;
  private tuiActive = false;

  constructor(minLevel: LogLevel = (process.env.LOOPCODE_LOG_LEVEL as LogLevel) || 'info') {
    this.minLevel = ORDER[minLevel] ? minLevel : 'info';
  }

  attach(bus: EventBus): void {
    this.bus = bus;
  }

  /** While true, never write to stdout/stderr directly. */
  setTuiActive(active: boolean): void {
    this.tuiActive = active;
  }

  private file(): fs.WriteStream | null {
    if (this.stream) return this.stream;
    try {
      const target = logFile();
      ensureDir(path.dirname(target));
      // Rotate at ~5MB to keep the file grep-able.
      try {
        const stat = fs.statSync(target);
        if (stat.size > 5_000_000) fs.renameSync(target, `${target}.1`);
      } catch {
        /* first run */
      }
      this.stream = fs.createWriteStream(target, { flags: 'a', mode: 0o600 });
    } catch {
      this.stream = null;
    }
    return this.stream;
  }

  private write(level: LogLevel, scope: string, message: string, data?: unknown): void {
    if (ORDER[level] < ORDER[this.minLevel]) return;
    const safe = redact(message);
    const line = JSON.stringify({
      t: new Date().toISOString(),
      level,
      scope,
      msg: safe,
      ...(data === undefined ? {} : { data: JSON.parse(redact(JSON.stringify(data ?? null))) }),
    });
    this.file()?.write(`${line}\n`);
  }

  debug(scope: string, message: string, data?: unknown): void {
    this.write('debug', scope, message, data);
  }

  info(scope: string, message: string, data?: unknown): void {
    this.write('info', scope, message, data);
  }

  warn(scope: string, message: string, data?: unknown): void {
    this.write('warn', scope, message, data);
    this.notice('warn', message);
  }

  error(scope: string, message: string, data?: unknown): void {
    this.write('error', scope, message, data);
    this.notice('error', message);
  }

  /** Explicit user-facing message. */
  notice(level: NoticeEvent['level'], text: string, ephemeral = false): void {
    const safe = redact(text);
    if (this.bus) {
      this.bus.emit(makeEvent<NoticeEvent>({ kind: 'notice', level, text: safe, ephemeral }));
      return;
    }
    if (!this.tuiActive) {
      const target = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
      target.write(`${safe}\n`);
    }
  }

  close(): void {
    this.stream?.end();
    this.stream = null;
  }
}

export const logger = new Logger();
