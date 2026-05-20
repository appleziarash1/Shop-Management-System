export const sanitizePositiveIntegerInput = (value) => {
  const text = String(value ?? '')
  return text.replace(/\D/g, '')
}

export const sanitizePositiveDecimalInput = (value) => {
  const text = String(value ?? '').replace(/,/g, '.')
  const cleaned = text.replace(/[^0-9.]/g, '')
  const firstDotIndex = cleaned.indexOf('.')

  if (firstDotIndex === -1) {
    return cleaned
  }

  const whole = cleaned.slice(0, firstDotIndex + 1)
  const decimal = cleaned.slice(firstDotIndex + 1).replace(/\./g, '')
  return `${whole}${decimal}`
}
