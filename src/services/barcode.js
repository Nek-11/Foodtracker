import { BrowserMultiFormatReader } from '@zxing/browser'
import { NotFoundException } from '@zxing/library'

const OPEN_FOOD_FACTS_URL = 'https://world.openfoodfacts.org/api/v0/product'

/**
 * Module-level camera stream cache.
 *
 * By reusing the same MediaStream across scanner sessions we avoid calling
 * getUserMedia() more than once, which eliminates the repeated permission
 * prompt on iOS Safari and some Android browsers.
 */
let _cachedStream = null

function isStreamLive(stream) {
  return !!stream && stream.getTracks().some(t => t.readyState === 'live')
}

async function acquireCameraStream() {
  if (isStreamLive(_cachedStream)) return _cachedStream
  // Clean up any dead tracks from a previous session
  if (_cachedStream) {
    _cachedStream.getTracks().forEach(t => t.stop())
    _cachedStream = null
  }
  _cachedStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
  })
  return _cachedStream
}

/**
 * Start the barcode scanner using the device camera.
 *
 * The camera stream is cached between calls so the OS/browser won't re-prompt
 * for permission on subsequent opens.
 *
 * @param {HTMLVideoElement} videoEl - Video element for the camera preview
 * @param {(barcode: string) => void} onDetected - Called once when a barcode is found
 * @param {(error: string) => void} onError - Called on fatal errors
 * @returns {() => void} stopFn - Call this to stop scanning (stream stays alive for reuse)
 */
export async function startBarcodeScanner(videoEl, onDetected, onError) {
  const reader = new BrowserMultiFormatReader()
  let detected = false

  let stream
  try {
    stream = await acquireCameraStream()
  } catch (err) {
    _cachedStream = null
    if (err.name === 'NotAllowedError') {
      onError('Camera permission denied. Please allow camera access and try again.')
    } else {
      onError(err.message || 'Could not access camera')
    }
    return () => {}
  }

  try {
    const controls = await reader.decodeFromStream(stream, videoEl, (result, err) => {
      if (result && !detected) {
        detected = true
        onDetected(result.getText())
      }
      // NotFoundException fires every frame when no barcode is visible — ignore it
      if (err && !(err instanceof NotFoundException)) {
        onError(err.message || 'Camera error')
      }
    })

    return () => {
      try { controls.stop() } catch { /* already stopped */ }
      // Do NOT stop stream tracks — keep stream alive so the next open
      // reuses it and skips the permission prompt.
    }
  } catch (err) {
    onError(err.message || 'Could not start scanner')
    return () => {}
  }
}

/**
 * Look up a product by barcode on Open Food Facts.
 * Works well for European / Swiss products (EAN-13, EAN-8).
 * @param {string} barcode
 * @returns {object|null} Product data, or null if not found
 */
export async function fetchProductFromBarcode(barcode) {
  try {
    const res = await fetch(`${OPEN_FOOD_FACTS_URL}/${encodeURIComponent(barcode)}.json`, {
      headers: { 'User-Agent': 'Foodtracker App - https://github.com/nek-11/foodtracker' },
    })
    if (!res.ok) return null

    const data = await res.json()
    if (data.status !== 1 || !data.product) return null

    const p = data.product
    const n = p.nutriments || {}

    // Prefer product_name_en, then local language name, then generic product_name
    const name =
      p.product_name_en ||
      p.product_name_fr ||
      p.product_name_de ||
      p.product_name ||
      'Unknown product'

    return {
      name: name.trim(),
      barcode,
      brand: p.brands || null,
      // Per-100g values (Open Food Facts standard)
      per100g: {
        calories:  Math.round(n['energy-kcal_100g'] || n['energy_100g'] / 4.184 || 0),
        proteinG:  parseFloat((n['proteins_100g'] || 0).toFixed(1)),
        carbsG:    parseFloat((n['carbohydrates_100g'] || 0).toFixed(1)),
        sugarG:    parseFloat((n['sugars_100g'] || 0).toFixed(1)),
        fatG:      parseFloat((n['fat_100g'] || 0).toFixed(1)),
        fiberG:    parseFloat((n['fiber_100g'] || 0).toFixed(1)),
        // Open Food Facts stores sodium in g/100g; convert to mg
        sodiumMg:  Math.round((n['sodium_100g'] || 0) * 1000),
      },
      // Serving info (optional)
      servingSize: p.serving_size || null,
      servingQuantityG: p.serving_quantity ? parseFloat(p.serving_quantity) : null,
    }
  } catch {
    return null
  }
}

/**
 * Format scanned product data as a text string for the AI analysis context.
 * The AI uses these values as ground truth and estimates portion size.
 */
export function formatProductForAnalysis(product) {
  const p = product.per100g
  const lines = [
    `Scanned product: "${product.name}"${product.brand ? ` by ${product.brand}` : ''}`,
    `Nutrition per 100g: ${p.calories} kcal, ${p.proteinG}g protein, ${p.carbsG}g carbs (${p.sugarG}g sugar), ${p.fatG}g fat, ${p.fiberG}g fiber, ${p.sodiumMg}mg sodium`,
  ]
  if (product.servingQuantityG) {
    lines.push(`Typical serving size: ${product.servingSize || `${product.servingQuantityG}g`} (${product.servingQuantityG}g)`)
  }
  return lines.join('\n')
}
