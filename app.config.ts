import type { ConfigContext } from 'expo/config';

import COLORS from './colors.json';

export default ({ config }: ConfigContext) => ({
  ...config,
  backgroundColor: COLORS.background,
});
