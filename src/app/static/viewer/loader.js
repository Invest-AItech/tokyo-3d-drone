// URL ?id= 復元用ローダー
// - Firestore 保存済み composition を ID で fetch
// - validateComposition によりバリデーション後に返す
import { validateComposition } from './composition.js'

export async function loadCompositionById(id) {
  const r = await fetch(`/api/v1/compositions/${encodeURIComponent(id)}`)
  if (!r.ok) throw new Error(`load failed: ${r.status}`)
  const data = await r.json()
  return validateComposition(data)
}
