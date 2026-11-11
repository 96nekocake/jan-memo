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

  test('同一コードは1499msまで無視し、1500msで重複を通知する', () => {
    const session = new ScanSession();
    session.scan(first, 0);

    expect(session.scan(first, 0)).toEqual({ status: 'throttled' });
    expect(session.scan(first, 1499)).toEqual({ status: 'throttled' });
    expect(session.scan(first, 1500)).toEqual({ status: 'duplicate', codes: [first] });
    expect(session.scan(first, 2999)).toEqual({ status: 'throttled' });
    expect(session.scan(first, 3000)).toEqual({ status: 'duplicate', codes: [first] });
  });

  test('別のコードが間に入ってもコードごとの抑制を保つ', () => {
    const session = new ScanSession();
    session.scan(first, 0);
    session.scan(second, 100);

    expect(session.scan(first, 200)).toEqual({ status: 'throttled' });
    expect(session.scan(second, 1500)).toEqual({ status: 'throttled' });
    expect(session.scan(first, 1500)).toEqual({
      status: 'duplicate',
      codes: [second, first],
    });
    expect(session.scan(second, 1600)).toEqual({
      status: 'duplicate',
      codes: [second, first],
    });
  });

  test('無視したフレームは抑制時間を延長しない', () => {
    const session = new ScanSession();
    session.scan(first, 0);
    for (let now = 100; now < 1500; now += 100) {
      expect(session.scan(first, now)).toEqual({ status: 'throttled' });
    }
    expect(session.scan(first, 1500)).toEqual({ status: 'duplicate', codes: [first] });
  });

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
});
