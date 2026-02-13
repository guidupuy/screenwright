import type { ScreenwrightConfig } from './config-schema.js';

export const defaultConfig: ScreenwrightConfig = {
  voice: 'en_US-amy-medium',
  resolution: { width: 1280, height: 720 },
  outputDir: './output',
  locale: 'en-US',
  colorScheme: 'light',
  timezoneId: 'America/New_York',
};

export function serializeConfig(config: ScreenwrightConfig): string {
  return `import type { ScreenwrightConfig } from '@screenwright/cli';

const config: ScreenwrightConfig = ${JSON.stringify(config, null, 2)};

export default config;
`;
}
