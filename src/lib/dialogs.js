export const confirmAction = (message) => new Promise((resolve) => {
  window.dispatchEvent(new CustomEvent('shopms:confirm', {
    detail: {
      message: String(message || ''),
      resolve
    }
  }))
})
