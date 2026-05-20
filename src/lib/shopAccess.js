const parseTimeParts = (timeValue, fallback) => {
  const raw = timeValue || fallback
  const [hours = '0', minutes = '0'] = raw.split(':')
  return {
    hours: Number(hours),
    minutes: Number(minutes)
  }
}

export const getShopAccessStatus = (shop, now = new Date()) => {
  if (!shop || shop.id === 'all') {
    return {
      isWithinHours: true,
      isManuallyClosed: false,
      canModify: false,
      statusLabel: 'Select a shop',
      reason: 'Select a specific shop to make changes.'
    }
  }

  if (shop.is_manually_closed) {
    return {
      isWithinHours: false,
      isManuallyClosed: true,
      canModify: false,
      statusLabel: 'Closed manually',
      reason: 'This shop is manually closed by the owner.'
    }
  }

  const opening = parseTimeParts(shop.opening_time, '08:00')
  const closing = parseTimeParts(shop.closing_time, '18:00')

  const openingTime = new Date(now)
  openingTime.setHours(opening.hours, opening.minutes, 0, 0)

  const closingTime = new Date(now)
  closingTime.setHours(closing.hours, closing.minutes, 0, 0)

  let isWithinHours = now >= openingTime && now <= closingTime

  if (closingTime <= openingTime) {
    isWithinHours = now >= openingTime || now <= closingTime
  }

  return {
    isWithinHours,
    isManuallyClosed: false,
    canModify: isWithinHours,
    statusLabel: isWithinHours ? 'Open' : 'Closed for the day',
    reason: isWithinHours
      ? `Shop is open from ${shop.opening_time || '08:00'} to ${shop.closing_time || '18:00'}.`
      : `This shop only allows changes between ${shop.opening_time || '08:00'} and ${shop.closing_time || '18:00'}.`
  }
}
