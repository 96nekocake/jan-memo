import { isValidJanCode } from './janCode';

export const CODE_LIST_STORAGE_KEY = 'jan-memo:codes';

export interface CodeStorageDriver {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export class CodeStorage {
  private loaded = false;
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly driver: CodeStorageDriver) {}

  async load(): Promise<readonly string[]> {
    const raw = await this.driver.getItem(CODE_LIST_STORAGE_KEY);
    const codes: unknown = raw === null ? [] : JSON.parse(raw);

    if (
      !Array.isArray(codes) ||
      !codes.every((code) => typeof code === 'string' && isValidJanCode(code)) ||
      new Set(codes).size !== codes.length
    ) {
      throw new Error('保存した一覧が不正です');
    }

    this.loaded = true;
    return codes;
  }

  save(codes: readonly string[]): Promise<void> {
    if (!this.loaded) {
      return Promise.reject(new Error('一覧を読み込む前には保存できません'));
    }

    const snapshot = JSON.stringify(codes);
    const write = this.pending.then(() => this.driver.setItem(CODE_LIST_STORAGE_KEY, snapshot));
    this.pending = write.catch(() => undefined);
    return write;
  }
}
