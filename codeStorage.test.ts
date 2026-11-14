import { CODE_LIST_STORAGE_KEY, CodeStorage } from './codeStorage';
import { ScanSession } from './scanSession';

const first = '4006381333931';
const second = '0123456789012';

function memoryDriver(initial: string | null = null) {
  let value = initial;
  return {
    getItem: jest.fn(async (_key: string) => value),
    setItem: jest.fn(async (_key: string, next: string) => { value = next; }),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('CodeStorage', () => {
  test('未保存の初回起動は空の一覧を返し、書き込まない', async () => {
    const driver = memoryDriver();
    expect(await new CodeStorage(driver).load()).toEqual([]);
    expect(driver.getItem).toHaveBeenCalledWith(CODE_LIST_STORAGE_KEY);
    expect(driver.setItem).not.toHaveBeenCalled();
  });

  test.each([{ codes: [] }, { codes: [second, first] }])('保存した一覧の順序と先頭0を復元する: %j', async ({ codes }) => {
    const driver = memoryDriver(JSON.stringify(codes));
    expect(await new CodeStorage(driver).load()).toEqual(codes);
    expect(driver.setItem).not.toHaveBeenCalled();
  });

  test('読み込み前・読み込み中の保存を拒否し、既存データを上書きしない', async () => {
    const driver = memoryDriver(JSON.stringify([first]));
    const reading = deferred<string | null>();
    driver.getItem.mockReturnValueOnce(reading.promise);
    const storage = new CodeStorage(driver);

    await expect(storage.save([])).rejects.toThrow();
    const load = storage.load();
    await expect(storage.save([])).rejects.toThrow();
    expect(driver.setItem).not.toHaveBeenCalled();
    reading.resolve(JSON.stringify([first]));
    expect(await load).toEqual([first]);
  });

  test.each([
    '', 'broken', 'null', '{}', '"4006381333931"',
    '[12345670]', '["4006381333932"]', '["96385074\\n"]',
    JSON.stringify([first, first]),
  ])('壊れた保存内容は読み込みエラーにして上書きしない: %j', async (raw) => {
    const driver = memoryDriver(raw);
    const storage = new CodeStorage(driver);
    await expect(storage.load()).rejects.toThrow();
    await expect(storage.save([])).rejects.toThrow();
    expect(driver.setItem).not.toHaveBeenCalled();
    expect(await driver.getItem(CODE_LIST_STORAGE_KEY)).toBe(raw);
  });

  test('読み込みの失敗後に再試行できる', async () => {
    const driver = memoryDriver(JSON.stringify([first]));
    driver.getItem.mockRejectedValueOnce(new Error('read failed'));
    const storage = new CodeStorage(driver);
    await expect(storage.load()).rejects.toThrow('read failed');
    await expect(storage.save([])).rejects.toThrow();
    expect(await storage.load()).toEqual([first]);
    await storage.save([]);
    expect(await new CodeStorage(driver).load()).toEqual([]);
  });

  test('連続した保存を直列化し、古い書き込みで全消去を巻き戻さない', async () => {
    const driver = memoryDriver();
    const writing = deferred<void>();
    driver.setItem.mockImplementationOnce(async () => writing.promise);
    const storage = new CodeStorage(driver);
    await storage.load();

    const add = storage.save([first]);
    const remove = storage.save([]);
    await Promise.resolve();
    expect(driver.setItem).toHaveBeenCalledTimes(1);
    writing.resolve(undefined);
    await Promise.all([add, remove]);
    expect(driver.setItem.mock.calls).toEqual([
      [CODE_LIST_STORAGE_KEY, JSON.stringify([first])],
      [CODE_LIST_STORAGE_KEY, '[]'],
    ]);
    expect(await new CodeStorage(driver).load()).toEqual([]);
  });

  test('保存失敗後も、後続の保存と最新状態の再試行が成功する', async () => {
    const driver = memoryDriver();
    driver.setItem.mockRejectedValueOnce(new Error('write failed'));
    const storage = new CodeStorage(driver);
    await storage.load();

    const failed = storage.save([first]);
    const latest = storage.save([second, first]);
    await expect(failed).rejects.toThrow('write failed');
    await latest;
    expect(await new CodeStorage(driver).load()).toEqual([second, first]);

    driver.setItem.mockRejectedValueOnce(new Error('write failed again'));
    await expect(storage.save([])).rejects.toThrow('write failed again');
    await storage.save([]);
    expect(await new CodeStorage(driver).load()).toEqual([]);
  });

  test('保存要求後の配列変更によって書き込む内容が変わらない', async () => {
    const driver = memoryDriver();
    const storage = new CodeStorage(driver);
    await storage.load();
    const codes = [first];
    const saving = storage.save(codes);
    codes.push(second);
    await saving;
    expect(await new CodeStorage(driver).load()).toEqual([first]);
  });

  test('追加・再起動・個別削除・全消去を保存と復元を挟んで実行できる', async () => {
    const driver = memoryDriver();
    const storage = new CodeStorage(driver);
    const session = new ScanSession(await storage.load());
    for (const code of [first, second]) {
      const result = session.scan(code, 0);
      expect(result.status).toBe('added');
      if ('codes' in result) await storage.save(result.codes);
    }

    const restartedStorage = new CodeStorage(driver);
    const restored = await restartedStorage.load();
    expect(restored).toEqual([second, first]);
    const restartedSession = new ScanSession(restored);
    expect(restartedSession.scan(first, 0)).toEqual({ status: 'duplicate', codes: restored });
    await restartedStorage.save(restartedSession.remove(first));
    expect(await new CodeStorage(driver).load()).toEqual([second]);
    await restartedStorage.save(restartedSession.clear());
    expect(await new CodeStorage(driver).load()).toEqual([]);
  });
});
