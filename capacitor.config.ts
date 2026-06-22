import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nomadguide.app',
  appName: 'NomadGuide',
  webDir: 'public',
  server: {
    url: 'https://studio-3110244339-6cbfd.web.app',
    cleartext: true
  }
};

export default config;
