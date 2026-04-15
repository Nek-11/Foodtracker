/**
 * Compress and resize an image File/Blob.
 * Returns a base64 data URL (JPEG).
 */
export function compressImage(file, maxSizePx = 1024, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (e) => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = img

        // Scale down if larger than maxSizePx
        if (width > maxSizePx || height > maxSizePx) {
          if (width > height) {
            height = Math.round((height / width) * maxSizePx)
            width = maxSizePx
          } else {
            width = Math.round((width / height) * maxSizePx)
            height = maxSizePx
          }
        }

        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Create a small thumbnail (for display in lists).
 */
export function makeThumbnail(file) {
  return compressImage(file, 300, 0.7)
}

/**
 * Strip the data URL prefix to get raw base64 for the Claude API.
 * e.g. "data:image/jpeg;base64,XXXX" → "XXXX"
 */
export function dataUrlToBase64(dataUrl) {
  return dataUrl.split(',')[1]
}

/**
 * Get media type from data URL.
 * e.g. "data:image/jpeg;base64,..." → "image/jpeg"
 */
export function dataUrlToMediaType(dataUrl) {
  return dataUrl.split(';')[0].replace('data:', '')
}
