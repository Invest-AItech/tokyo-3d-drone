// Export / Import helpers for composition JSON
// - exportComposition: serialize to indented JSON string
// - importComposition: parse + validate JSON string
// - downloadJson: trigger browser file download (DOM, not unit-tested)
// - readJsonFile: read File object and validate (DOM, not unit-tested)

import { validateComposition } from './composition.js'

export function exportComposition(composition) {
  return JSON.stringify(composition, null, 2)
}

export function importComposition(text) {
  const parsed = JSON.parse(text)
  return validateComposition(parsed)
}

export function downloadJson(composition, filename = 'composition.json') {
  const blob = new Blob([exportComposition(composition)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function readJsonFile(file) {
  const text = await file.text()
  return importComposition(text)
}
