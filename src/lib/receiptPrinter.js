import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatShopAddress, getShopComplianceLines } from './shopDetails'

const formatReceiptDate = (value) => {
  const date = value ? new Date(value) : new Date()
  return Number.isNaN(date.getTime()) ? new Date().toLocaleString() : date.toLocaleString()
}

const toMoney = (formatCurrency, value) => formatCurrency(Number(value || 0))

const getShortReceiptNumber = (value) => {
  const seed = String(value || Date.now()).toUpperCase().replace(/[^A-Z0-9]/g, '')
  const normalized = seed.length >= 8 ? seed.slice(0, 8) : `${seed}${Date.now().toString(36).toUpperCase()}`
  return normalized.slice(0, 8)
}

const hexToRgb = (hex) => {
  const normalized = hex.replace('#', '').trim()
  if (normalized.length !== 6) return null

  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16)
  ]
}

const getSystemPrimaryColor = () => {
  if (typeof window === 'undefined') return [184, 134, 11]

  const cssValue = window.getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()
  if (!cssValue) return [184, 134, 11]

  if (cssValue.startsWith('#')) {
    return hexToRgb(cssValue) || [184, 134, 11]
  }

  const rgbMatch = cssValue.match(/\d+/g)
  if (rgbMatch && rgbMatch.length >= 3) {
    return rgbMatch.slice(0, 3).map(Number)
  }

  return [184, 134, 11]
}

export const downloadReceiptPdf = ({ sale, items, shop, customerName, formatCurrency }) => {
  const safeItems = items || []
  const addressLine = formatShopAddress(shop) || shop?.location || 'Shop Management System'
  const complianceLines = getShopComplianceLines(shop)
  const estimatedHeight = Math.max(135, 92 + (safeItems.length * 9) + (complianceLines.length * 4) + 34)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [90, estimatedHeight]
  })

  const receiptNumber = getShortReceiptNumber(sale?.id || `OFFLINE${Date.now()}`)
  const saleDate = formatReceiptDate(sale?.created_at)
  const paymentMethod = sale?.payment_method || 'Cash'
  const total = Number(sale?.total_amount || 0)
  const primaryColor = getSystemPrimaryColor()

  doc.setFillColor(...primaryColor)
  doc.rect(0, 0, 90, 28, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(shop?.name || 'Sales Receipt', 45, 10, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(addressLine, 45, 16, { align: 'center', maxWidth: 76 })
  doc.text('Official Receipt', 45, 21, { align: 'center' })
  complianceLines.forEach((line, index) => {
    doc.text(line, 45, 26 + (index * 4), { align: 'center' })
  })

  doc.setTextColor(33, 37, 41)
  doc.setFontSize(8)
  const detailsStartY = 35 + (complianceLines.length * 4)
  doc.text(`Receipt No: ${String(receiptNumber)}`, 6, detailsStartY)
  doc.text(`Date: ${saleDate}`, 6, detailsStartY + 5)
  doc.text(`Customer: ${customerName || 'Walk-in Customer'}`, 6, detailsStartY + 10)
  doc.text(`Payment: ${paymentMethod}`, 6, detailsStartY + 15)

  autoTable(doc, {
    startY: detailsStartY + 20,
    margin: { left: 6, right: 6 },
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      lineColor: [224, 224, 224],
      lineWidth: 0.1
    },
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontStyle: 'bold'
    },
    bodyStyles: {
      textColor: [33, 37, 41]
    },
    head: [['Item', 'Qty', 'Price', 'Amount']],
    body: safeItems.map((item) => {
      const quantity = Number(item.quantity || 0)
      const unitPrice = Number(item.unit_price || item.unitPrice || 0)
      const lineTotal = Number(item.total_price || item.totalPrice || (quantity * unitPrice))
      const name = item.name || item.productName || item.serviceName || item.products?.name || item.services?.name || 'Item'

      return [
        name,
        String(quantity),
        toMoney(formatCurrency, unitPrice),
        toMoney(formatCurrency, lineTotal)
      ]
    })
  })

  const tableEndY = doc.lastAutoTable?.finalY || 55
  const totalsY = tableEndY + 8

  doc.setDrawColor(200, 200, 200)
  doc.line(6, totalsY, 84, totalsY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('TOTAL', 6, totalsY + 7)
  doc.text(toMoney(formatCurrency, total), 84, totalsY + 7, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(90, 98, 104)
  doc.text('Thank you for shopping with us.', 45, totalsY + 17, { align: 'center' })
  doc.text('Generated automatically by ShopMS.', 45, totalsY + 22, { align: 'center' })

  const finalHeight = Math.max(estimatedHeight, totalsY + 28)
  doc.internal.pageSize.height = finalHeight
  doc.internal.pageSize.width = 90

  const fileName = `receipt_${receiptNumber}.pdf`
  doc.save(fileName)
  return true
}
