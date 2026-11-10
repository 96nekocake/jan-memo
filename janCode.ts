export function isValidJanCode(code: string): boolean {
  if ((code.length !== 8 && code.length !== 13) || /[^0-9]/.test(code)) {
    return false;
  }

  let sum = 0;
  let weight = 3;

  for (let index = code.length - 2; index >= 0; index -= 1) {
    sum += Number(code[index]) * weight;
    weight = weight === 3 ? 1 : 3;
  }

  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === Number(code[code.length - 1]);
}
