// Topbar の "← トップ" リンクが Firebase ランディングを指すことを検証。
//
// app.js の副作用を避けるため、topbar.js を直接 import するのではなく
// 組み立てた HTML 文字列に対して assertion をかける。topbar.js の
// FIREBASE_LANDING 定数とこのテストは同じ URL を共有する契約。
import { describe, it, expect } from 'vitest'

const EXPECTED_LANDING = 'https://invest-aitech-tokyo-drone.web.app/'

describe('topbar back-to-landing link', () => {
  it('hardcodes the Firebase landing URL', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const filePath = path.resolve(__dirname, '../app/static/viewer/panels/topbar.js')
    const src = await fs.readFile(filePath, 'utf-8')

    // FIREBASE_LANDING 定数の宣言
    expect(src).toMatch(/const\s+FIREBASE_LANDING\s*=\s*['"]https:\/\/invest-aitech-tokyo-drone\.web\.app\/['"]/)

    // template literal: href="${FIREBASE_LANDING}" を含む（実体は EXPECTED_LANDING）
    expect(src).toContain('href="${FIREBASE_LANDING}"')
    // 念のため EXPECTED_LANDING 文字列自体（FIREBASE_LANDING 定数の右辺）も検出される
    expect(src).toContain(EXPECTED_LANDING)

    // i18n キーが付与されている (ja/en どちらでも文言が出る)
    expect(src).toContain('data-i18n="creator.backToLanding"')
    expect(src).toContain('data-i18n-attr-aria-label="creator.backToLanding"')
  })
})
