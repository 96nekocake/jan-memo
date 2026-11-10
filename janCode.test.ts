import { isValidJanCode } from './janCode';

describe('isValidJanCode', () => {
  test.each([
    ['EAN-13', '4006381333931'],
    ['EAN-13', '9780306406157'],
    ['先頭が0のEAN-13', '0123456789012'],
    ['EAN-8', '96385074'],
    ['先頭が0のEAN-8', '00000017'],
    ['チェックデジットが0のEAN-8', '12345670'],
  ])('正しい%sを受け入れる: %s', (_type, code) => {
    expect(isValidJanCode(code)).toBe(true);
  });

  test.each(['4006381333931', '96385074', '12345670'])(
    'チェックデジットを変更すると拒否する: %s',
    (code) => {
      for (let digit = 0; digit <= 9; digit += 1) {
        if (String(digit) !== code[code.length - 1]) {
          expect(isValidJanCode(code.slice(0, -1) + digit)).toBe(false);
        }
      }
    },
  );

  test.each(['4006381333941', '96385084'])(
    '本体の数字が変わりチェックデジットが合わないコードを拒否する: %s',
    (code) => {
      expect(isValidJanCode(code)).toBe(false);
    },
  );

  test.each([
    '',
    '0',
    '9638507',
    '963850740',
    '400638133393',
    '04006381333931',
  ])('桁数違いを拒否する: %j', (code) => {
    expect(isValidJanCode(code)).toBe(false);
  });

  test.each([
    '9638507A',
    'A006381333931',
    '９６３８５０７４',
    '٩٦٣٨٥٠٧٤',
    '9638 074',
    '9638-074',
    '9638507\n',
    '400638133393\n',
    '9638507\t',
    '9638507\r',
    '9638507\u0000',
    ' 96385074',
    '96385074 ',
    '96385074\n',
    '4006381333931\n',
  ])('数字以外を含む入力を拒否する: %j', (code) => {
    expect(isValidJanCode(code)).toBe(false);
  });
});
