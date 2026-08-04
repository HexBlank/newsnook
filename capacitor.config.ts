import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.aizeek.newsnook',
  appName: 'News Nook',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    StatusBar: {
      // Dark = 深色底上的浅色时间/电量图标
      style: 'DARK',
      backgroundColor: '#0E0F12',
      // 与 CSS safe-area 配合；Android 16+ 可能被系统忽略
      overlaysWebView: true,
    },
  },
}

export default config
