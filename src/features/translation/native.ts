import { Capacitor, registerPlugin } from '@capacitor/core'

import type { TranslationLanguage } from './types'

export interface MlKitModelState {
  ready: boolean
  downloadedLanguages: string[]
}

interface MlKitTranslationPlugin {
  getModelState(options: {
    sourceLanguage: TranslationLanguage
    targetLanguage: TranslationLanguage
  }): Promise<MlKitModelState>
  downloadModel(options: {
    sourceLanguage: TranslationLanguage
    targetLanguage: TranslationLanguage
    wifiOnly: boolean
  }): Promise<MlKitModelState>
  deleteModel(options: {
    sourceLanguage: TranslationLanguage
    targetLanguage: TranslationLanguage
  }): Promise<MlKitModelState>
  translate(options: {
    texts: string[]
    sourceLanguage: TranslationLanguage
    targetLanguage: TranslationLanguage
  }): Promise<{ translations: string[] }>
}

export const MlKitTranslation = registerPlugin<MlKitTranslationPlugin>('MlKitTranslation')

/** 由 Android flavor 决定；cloud 包里插件类与 ML Kit 依赖都不存在。 */
export function isLocalTranslationAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('MlKitTranslation')
}
