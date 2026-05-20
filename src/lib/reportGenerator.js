import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format } from 'date-fns'

/**
 * Generates a standard A4 PDF report for a list of items.
 * @param {Object} options
 * @param {string} options.title - The title of the report (e.g. "Customer Debts")
 * @param {Array} options.headers - Array of column headers
 * @param {Array} options.data - Array of rows (arrays or objects matching headers)
 * @param {Object} options.shop - Shop details (name, location)
 * @param {string} options.fileName - Optional custom file name
 * @param {string} options.orientation - 'p' for portrait, 'l' for landscape
 */
export const downloadListReport = ({ 
  title, 
  headers, 
  data, 
  shop, 
  fileName = 'report', 
  orientation = 'p',
  summaryText = ''
}) => {
  const doc = new jsPDF({
    orientation: orientation,
    unit: 'mm',
    format: 'a4'
  })

  const shopName = shop?.name || 'Shop Management System'
  const shopLocation = shop?.location || 'Malawi'
  const dateStr = format(new Date(), 'dd MMMM yyyy HH:mm')

  // Header / Brand Bar
  doc.setFillColor(184, 134, 11) // Primary color (Gold/Metallic)
  doc.rect(0, 0, 210, 30, 'F')
  
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(22)
  doc.text(title.toUpperCase(), 105, 20, { align: 'center' })

  // Shop info
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(11)
  doc.text(`Shop: ${shopName}`, 14, 40)
  doc.text(`Location: ${shopLocation}`, 14, 46)
  doc.text(`Date Generated: ${dateStr}`, 14, 52)
  
  if (summaryText) {
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(summaryText, 14, 62)
    doc.setFont('helvetica', 'normal')
  }

  // Table
  autoTable(doc, {
    startY: summaryText ? 68 : 58,
    head: [headers],
    body: data,
    theme: 'grid',
    headStyles: {
      fillColor: [184, 134, 11],
      textColor: [255, 255, 255],
      fontSize: 10,
      fontStyle: 'bold'
    },
    styles: {
      fontSize: 9,
      cellPadding: 3
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245]
    },
    margin: { top: 20, bottom: 20 }
  })

  // Footer (Simple page numbering)
  const pageCount = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(
      `Page ${i} of ${pageCount} - ${shopName} - ${dateStr}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    )
  }

  doc.save(`${fileName}_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`)
}
