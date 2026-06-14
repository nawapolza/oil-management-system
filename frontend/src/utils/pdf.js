import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { dateTH, num, thb } from './format'

export function exportDeliveriesPDF(rows, title = 'รายงานบันทึกน้ำมัน') {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  doc.setFont('helvetica')
  doc.setFontSize(18)
  doc.text(title, 40, 40)
  doc.setFontSize(10)
  doc.text(`Export: ${new Date().toLocaleString('th-TH')}`, 40, 58)

  autoTable(doc, {
    startY: 78,
    head: [[
      'Date', 'Bill', 'Employee', 'Plate', 'Origin', 'Oil', 'Destination', 'Weight', 'Liters', 'Amount', 'Status'
    ]],
    body: rows.map((r) => [
      dateTH(r.work_date),
      r.bill_no || '-',
      r.employee_name || '-',
      r.plate_no || '-',
      r.origin_place || '-',
      r.oil_type || '-',
      r.destination_place || '-',
      num(r.tank_weight, 3),
      num(r.quantity_liters, 2),
      thb(r.amount_baht),
      r.payment_status === 'paid' ? 'paid' : 'pending',
    ]),
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 4 },
    headStyles: { fontStyle: 'bold' },
  })

  doc.save(`oil-report-${Date.now()}.pdf`)
}

export function exportDashboardPDF(stats) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  doc.setFont('helvetica')
  doc.setFontSize(18)
  doc.text('OilOps Dashboard Summary', 40, 40)
  doc.setFontSize(10)
  doc.text(`Export: ${new Date().toLocaleString('th-TH')}`, 40, 58)

  const s = stats?.summary || {}
  autoTable(doc, {
    startY: 84,
    head: [['Metric', 'Value']],
    body: [
      ['Total trips', num(s.total_trips, 0)],
      ['Total liters', num(s.total_liters, 2)],
      ['Total amount', thb(s.total_amount)],
      ['Avg price / liter', thb(s.avg_price)],
      ['Pending payments', num(s.pending_payments, 0)],
      ['Missing photos', num(s.missing_photos, 0)],
    ],
    styles: { font: 'helvetica', fontSize: 10 },
  })

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 24,
    head: [['Destination', 'Liters', 'Amount', 'Trips']],
    body: (stats?.topDestinations || []).map((r) => [r.destination, num(r.liters), thb(r.amount), num(r.trips, 0)]),
    styles: { font: 'helvetica', fontSize: 9 },
  })

  doc.save(`oil-dashboard-${Date.now()}.pdf`)
}
