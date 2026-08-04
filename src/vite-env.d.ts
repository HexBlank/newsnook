/// <reference types="vite/client" />

/** 由 vite.config.ts 从 package.json 注入 */
declare const __APP_VERSION__: string
/** 由 vite.config.ts 在构建时写入的 YYYY.MM */
declare const __APP_BUILD__: string
