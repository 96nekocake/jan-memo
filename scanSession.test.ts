import { ScanSession } from './scanSession';

describe('ScanSession', () => {
  const first = '4006381333931';
  const second = '9780306406157';

  test('5件を待ち時間なしで追加し、新着順に返す', () => {
    const session = new ScanSession();
    const codes = [first, second, '0123456789012', '5901234123457', '1234567890128'];

    codes.forEach((code, index) => {
      expect(session.scan(code, 0)).toEqual({
        status: 'added',
        codes: codes.slice(0, index + 1).reverse(),
      });
    });
  });

  test('EAN-8を追加する', () => {
    expect(new ScanSession().scan('96385074', 0)).toEqual({
      status: 'added',
      codes: ['96385074'],
    });
  });

  test.each([
    [0, 'throttled'],
    [1499, 'throttled'],
    [1500, 'duplicate'],
    [1501, 'duplicate'],
  ])('最後の検出から%sms後の再検出は%sになる', (gap, status) => {
    const session = new ScanSession();
    session.scan(first, 0);

    expect(session.scan(first, gap)).toEqual(
      status === 'duplicate' ? { status, codes: [first] } : { status },
    );
  });

  test('別のコードが間に入ってもコードごとの抑制を保つ', () => {
    const session = new ScanSession();
    session.scan(first, 0);
    session.scan(second, 100);

    expect(session.scan(first, 200)).toEqual({ status: 'throttled' });
    expect(session.scan(second, 1500)).toEqual({ status: 'throttled' });
    expect(session.scan(first, 1700)).toEqual({
      status: 'duplicate',
      codes: [second, first],
    });
    expect(session.scan(second, 3000)).toEqual({
      status: 'duplicate',
      codes: [second, first],
    });
  });

  test.each(['added', 'duplicate'])(
    '%s通知後も映し続けている間は抑制し、1.5秒以上途切れた後に重複を通知する',
    (initialStatus) => {
      const session = new ScanSession();
      session.scan(first, 0);
      const start = initialStatus === 'duplicate' ? 1500 : 0;
      if (initialStatus === 'duplicate') {
        expect(session.scan(first, start)).toEqual({ status: 'duplicate', codes: [first] });
      }

      for (let now = start + 100; now <= start + 10000; now += 100) {
        expect(session.scan(first, now)).toEqual({ status: 'throttled' });
      }

      expect(session.scan(first, start + 11499)).toEqual({ status: 'throttled' });
      expect(session.scan(first, start + 12999)).toEqual({ status: 'duplicate', codes: [first] });
    },
  );

  test.each(['4006381333932', '96385075', '', '9638507A', '96385074\n'])(
    '不正なコードを一覧に追加しない: %j',
    (invalid) => {
      const session = new ScanSession();
      expect(session.scan(invalid, 0)).toEqual({ status: 'invalid' });
      expect(session.scan(first, 0)).toEqual({ status: 'added', codes: [first] });
    },
  );

  test('別のセッションに一覧や抑制状態が漏れない', () => {
    new ScanSession().scan(first, 0);
    expect(new ScanSession().scan(first, 0)).toEqual({ status: 'added', codes: [first] });
  });

  test('指定した1件だけを削除し、残るコードの新着順を維持する', () => {
    const session = new ScanSession();
    session.scan(first, 0);
    session.scan(second, 0);
    session.scan('96385074', 0);

    expect(session.remove(second)).toEqual(['96385074', first]);
    expect(session.scan(first, 1500)).toEqual({
      status: 'duplicate', codes: ['96385074', first],
    });
  });

  test('削除したコードは抑制時間後に新しいコードとして先頭に戻せる', () => {
    const session = new ScanSession();
    session.scan(first, 0);
    session.scan(second, 0);
    session.remove(first);

    expect(session.scan(first, 1499)).toEqual({ status: 'throttled' });
    expect(session.scan(first, 2999)).toEqual({
      status: 'added', codes: [first, second],
    });
  });

  test('最後の1件を削除すると空になり、何度削除しても空のままになる', () => {
    const session = new ScanSession();
    session.scan(first, 0);
    expect(session.remove(first)).toEqual([]);
    expect(session.remove(first)).toEqual([]);
  });

  test('登録されていないコードの削除は一覧を変えない', () => {
    const session = new ScanSession();
    session.scan(first, 0);
    expect(session.remove(second)).toEqual([first]);
  });

  test('全消去後は空になり、すべてのコードを再登録できる', () => {
    const session = new ScanSession();
    session.scan(first, 0);
    session.scan(second, 0);
    expect(session.clear()).toEqual([]);
    expect(session.scan(first, 1500)).toEqual({ status: 'added', codes: [first] });
    expect(session.scan(second, 1500)).toEqual({ status: 'added', codes: [second, first] });
  });

  test('全消去しても1.5秒以内の同一コードの再処理を抑制する', () => {
    const session = new ScanSession();
    session.scan(first, 0);
    session.clear();
    expect(session.scan(first, 1499)).toEqual({ status: 'throttled' });
    expect(session.scan(second, 1499)).toEqual({ status: 'added', codes: [second] });
  });

  test('空の一覧を全消去しても次の読み取りができる', () => {
    const session = new ScanSession();
    expect(session.clear()).toEqual([]);
    expect(session.clear()).toEqual([]);
    expect(session.scan(first, 0)).toEqual({ status: 'added', codes: [first] });
  });

  test('削除・全消去によって過去に返した一覧を書き換えない', () => {
    const session = new ScanSession();
    const before = session.scan(first, 0);
    session.remove(first);
    session.clear();
    expect(before).toEqual({ status: 'added', codes: [first] });
  });
});
