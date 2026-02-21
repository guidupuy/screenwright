import type { ScreenwrightConfig } from 'screenwright';

const config: ScreenwrightConfig = {
  voice: 'en_US-amy-medium',
  resolution: { width: 1280, height: 720 },
  outputDir: './output',
  locale: 'en-US',
  colorScheme: 'light',
  timezoneId: 'America/New_York',
  ttsProvider: 'openai',
  openaiVoice: 'coral',
  openaiTtsInstructions:
    'You are narrating a product demo video. Speak in a warm, enthusiastic, and consistent tone throughout — like a friendly TV commercial narrator. Maintain the exact same energy, pace, and pitch for every line, even very short ones. Never whisper, never get dramatic, never change your delivery style.',
};

export default config;
