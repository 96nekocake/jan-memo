import { isValidJanCode } from './janCode';

export const SCAN_INTERVAL_MS = 1500;

export type ScanResult =
  | { status: 'invalid' | 'throttled' }
  | { status: 'added' | 'duplicate'; codes: readonly string[] };

export class ScanSession {
  private codes: readonly string[] = [];
  private registered = new Set<string>();
  private lastDetected = new Map<string, number>();

  constructor(codes: readonly string[] = []) {
    this.codes = [...codes];
    this.registered = new Set(codes);
  }

  remove(code: string): readonly string[] {
    if (this.registered.delete(code)) {
      this.codes = this.codes.filter((item) => item !== code);
    }
    return this.codes;
  }

  clear(): readonly string[] {
    this.codes = [];
    this.registered.clear();
    return this.codes;
  }

  scan(code: string, now: number = Date.now()): ScanResult {
    if (!isValidJanCode(code)) {
      return { status: 'invalid' };
    }

    const last = this.lastDetected.get(code);
    this.lastDetected.set(code, now);
    if (last !== undefined && now - last < SCAN_INTERVAL_MS) {
      return { status: 'throttled' };
    }

    if (this.registered.has(code)) {
      return { status: 'duplicate', codes: this.codes };
    }

    this.registered.add(code);
    this.codes = [code, ...this.codes];
    return { status: 'added', codes: this.codes };
  }
}
