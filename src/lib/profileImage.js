const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024

export const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  if (!file) {
    reject(new Error('Please choose an image first.'))
    return
  }

  if (!file.type.startsWith('image/')) {
    reject(new Error('Please choose an image file.'))
    return
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    reject(new Error('Image must be 2MB or smaller.'))
    return
  }

  const reader = new FileReader()
  reader.onload = () => resolve(reader.result)
  reader.onerror = () => reject(new Error('Failed to read the selected image.'))
  reader.readAsDataURL(file)
})
