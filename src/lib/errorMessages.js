export const getFriendlyErrorMessage = (error) => {
  const message = String(error?.message || error || 'Something went wrong.').trim()
  const lowerMessage = message.toLowerCase()

  if (
    lowerMessage.includes('schema cache') ||
    lowerMessage.includes("'phone' column") ||
    lowerMessage.includes("'opening_time' column") ||
    lowerMessage.includes("'closing_time' column") ||
    lowerMessage.includes("'is_manually_closed' column") ||
    lowerMessage.includes("'manually_closed_at' column") ||
    lowerMessage.includes("'manually_closed_by' column") ||
    lowerMessage.includes("'country_residence' column") ||
    lowerMessage.includes("'currency_preference' column")
  ) {
    return 'The system setup is not complete yet. Please finish updating the database and try again.'
  }

  if (
    lowerMessage.includes('failed to fetch') ||
    lowerMessage.includes('fetch failed') ||
    lowerMessage.includes('networkerror') ||
    lowerMessage.includes('network request failed') ||
    lowerMessage.includes('load failed') ||
    lowerMessage.includes('network error')
  ) {
    return 'There is a network problem. Please check your internet connection and try again.'
  }

  if (lowerMessage.includes('invalid login credentials')) {
    return 'The email or password is not correct.'
  }

  if (lowerMessage.includes('email not confirmed')) {
    return 'Your email address has not been confirmed yet. Please check your inbox and confirm it first.'
  }

  if (lowerMessage.includes('already registered') || lowerMessage.includes('already been registered')) {
    return 'This email address is already registered. Please sign in or reset your password.'
  }

  if (lowerMessage.includes('rate limit')) {
    return 'Too many attempts were made in a short time. Please wait a moment and try again.'
  }

  if (lowerMessage.includes('insufficient stock') || lowerMessage.includes('out of stock')) {
    return 'Not enough stock available for this sale. Please check inventory levels.'
  }

  if (lowerMessage.includes('product not found') || lowerMessage.includes('no product')) {
    return 'The product could not be found. It may have been deleted or is unavailable.'
  }

  if (lowerMessage.includes('invalid quantity') || lowerMessage.includes('quantity must be')) {
    return 'Please enter a valid quantity greater than zero.'
  }

  if (lowerMessage.includes('duplicate') || lowerMessage.includes('already exists')) {
    return 'This item already exists. Please use the existing entry or choose a different name/barcode.'
  }

  if (lowerMessage.includes('permission denied') || lowerMessage.includes('access denied')) {
    return 'You do not have permission to perform this action. Please contact your administrator.'
  }

  if (lowerMessage.includes('network') || lowerMessage.includes('connection')) {
    return 'Network connection issue. Your changes have been saved locally and will sync when online.'
  }

  return message
}
