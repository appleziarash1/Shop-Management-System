const toOptionalText = (value) => {
  const nextValue = String(value || '').trim()
  return nextValue || null
}

export const normalizeShopPayload = (formData = {}) => ({
  name: String(formData.name || '').trim(),
  location: toOptionalText(formData.location),
  contact_info: toOptionalText(formData.contact_info),
  address_line_1: toOptionalText(formData.address_line_1),
  address_line_2: toOptionalText(formData.address_line_2),
  city: toOptionalText(formData.city),
  district: toOptionalText(formData.district),
  registration_number: toOptionalText(formData.registration_number),
  tpin: toOptionalText(formData.tpin),
  vat_registered: Boolean(formData.vat_registered),
  vat_number: formData.vat_registered ? toOptionalText(formData.vat_number) : null
})

export const formatShopAddress = (shop = {}) => {
  const parts = [
    shop.address_line_1,
    shop.address_line_2,
    shop.location,
    shop.city,
    shop.district
  ].map(toOptionalText).filter(Boolean)

  return parts.length ? parts.join(', ') : ''
}

export const getShopComplianceLines = (shop = {}) => {
  const lines = []

  if (shop.registration_number) {
    lines.push(`Reg No: ${shop.registration_number}`)
  }

  if (shop.tpin) {
    lines.push(`TPIN: ${shop.tpin}`)
  }

  if (shop.vat_registered) {
    lines.push(shop.vat_number ? `VAT No: ${shop.vat_number}` : 'VAT Registered')
  }

  return lines
}
