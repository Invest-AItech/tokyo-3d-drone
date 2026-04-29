import { beforeEach, vi } from 'vitest'

// i18n.js の IIFE が毎テストで再実行されるよう、モジュールキャッシュをリセット
// また navigator.language をデフォルト('ja-JP')に戻してテスト間の汚染を防ぐ
beforeEach(() => {
  vi.resetModules()
  Object.defineProperty(navigator, 'language', { value: 'ja-JP', configurable: true })
})
