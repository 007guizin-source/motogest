const express = require('express');
const { query, validationResult } = require('express-validator');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate, authorize('admin', 'gerente'));

const R = (n) => `R$ ${Number(n || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '-';

// ─── helpers de dados ──────────────────────────────────────────

async function getSalesReport(start, end) {
  const { rows } = await db.query(`
    SELECT
      s.number, s.created_at, s.total, s.payment_method, s.discount_amt,
      c.name as customer_name,
      u.name as seller_name,
      (SELECT SUM(si.price_buy * si.qty) FROM sale_items si WHERE si.sale_id = s.id) as cost,
      COUNT(si.id) as item_count
    FROM sales s
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN sale_items si ON si.sale_id = s.id
    WHERE s.status = 'completed'
      AND s.created_at::date BETWEEN $1 AND $2
    GROUP BY s.id, c.name, u.name
    ORDER BY s.created_at DESC
  `, [start, end]);
  return rows;
}

async function getTopProducts(start, end, limit = 20) {
  const { rows } = await db.query(`
    SELECT
      p.sku, p.name, p.price_sell,
      SUM(si.qty)      as qty_sold,
      SUM(si.subtotal) as revenue,
      SUM(si.subtotal - si.price_buy * si.qty) as profit
    FROM sale_items si
    JOIN products p ON p.id = si.product_id
    JOIN sales s ON s.id = si.sale_id
    WHERE s.status = 'completed'
      AND s.created_at::date BETWEEN $1 AND $2
    GROUP BY p.id
    ORDER BY revenue DESC
    LIMIT $3
  `, [start, end, limit]);
  return rows;
}

async function getStockReport() {
  const { rows } = await db.query(`
    SELECT p.sku, p.name, p.stock, p.stock_min, p.price_buy, p.price_sell, p.location,
      c.name as category,
      (p.stock * p.price_buy) as stock_value,
      ROUND(((p.price_sell - p.price_buy) / NULLIF(p.price_buy,0)) * 100, 1) as margin_pct
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.active = true
    ORDER BY p.stock ASC
  `);
  return rows;
}

async function getDebtReport() {
  const { rows } = await db.query(`
    SELECT name, document, phone, city, debt, credit_limit
    FROM customers
    WHERE active = true AND debt > 0
    ORDER BY debt DESC
  `);
  return rows;
}

// ─── PDF builder helpers ───────────────────────────────────────

function pdfHeader(doc, title, period) {
  doc.fontSize(20).fillColor('#f97316').text('MotoGest', 50, 45);
  doc.fontSize(11).fillColor('#666').text('Sistema de Gestão — Loja de Moto Peças', 50, 70);
  doc.moveTo(50, 92).lineTo(545, 92).strokeColor('#f97316').stroke();
  doc.fontSize(16).fillColor('#111').text(title, 50, 105);
  if (period) doc.fontSize(10).fillColor('#888').text(`Período: ${period}`, 50, 125);
  doc.moveDown(2);
}

function pdfTable(doc, headers, rows, startY) {
  const colWidths = headers.map(h => h.width);
  const rowHeight = 22;
  let y = startY || doc.y;

  // Header
  doc.rect(50, y, 495, rowHeight).fill('#f97316');
  let x = 50;
  headers.forEach((h, i) => {
    doc.fontSize(9).fillColor('#fff').text(h.label, x + 4, y + 6, { width: colWidths[i] - 8, align: h.align || 'left' });
    x += colWidths[i];
  });
  y += rowHeight;

  // Rows
  rows.forEach((row, ri) => {
    if (y > 720) { doc.addPage(); y = 50; }
    doc.rect(50, y, 495, rowHeight).fill(ri % 2 === 0 ? '#f9f9f9' : '#fff');
    x = 50;
    row.forEach((cell, ci) => {
      doc.fontSize(8).fillColor('#222').text(String(cell ?? '-'), x + 4, y + 6, { width: colWidths[ci] - 8, align: headers[ci].align || 'left' });
      x += colWidths[ci];
    });
    y += rowHeight;
  });

  return y;
}

// ─── ROTAS ────────────────────────────────────────────────────

// GET /api/reports/sales/pdf
router.get('/sales/pdf', [
  query('start').isDate().withMessage('Data inicial obrigatória.'),
  query('end').isDate().withMessage('Data final obrigatória.'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: 'Dados inválidos.', details: errors.array() });

  const { start, end } = req.query;
  const sales = await getSalesReport(start, end);

  const totalRevenue = sales.reduce((s, r) => s + Number(r.total), 0);
  const totalCost    = sales.reduce((s, r) => s + Number(r.cost || 0), 0);
  const totalProfit  = totalRevenue - totalCost;

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="vendas-${start}-${end}.pdf"`);
  doc.pipe(res);

  pdfHeader(doc, 'Relatório de Vendas', `${fmtDate(start)} a ${fmtDate(end)}`);

  // Totalizadores
  doc.fontSize(10).fillColor('#333');
  const summaryY = doc.y;
  [
    ['Total de Vendas', sales.length],
    ['Faturamento', R(totalRevenue)],
    ['Custo', R(totalCost)],
    ['Lucro Bruto', R(totalProfit)],
  ].forEach((item, i) => {
    const sx = 50 + (i * 125);
    doc.rect(sx, summaryY, 118, 50).fill('#fff5f0').stroke('#f97316');
    doc.fontSize(8).fillColor('#888').text(item[0], sx + 6, summaryY + 8);
    doc.fontSize(12).fillColor('#f97316').text(String(item[1]), sx + 6, summaryY + 22);
  });

  doc.moveDown(4);

  pdfTable(doc,
    [
      { label: '#',          width: 40 },
      { label: 'DATA',       width: 70 },
      { label: 'CLIENTE',    width: 120 },
      { label: 'PAGAMENTO',  width: 75 },
      { label: 'DESCONTO',   width: 60, align: 'right' },
      { label: 'TOTAL',      width: 70, align: 'right' },
      { label: 'LUCRO',      width: 60, align: 'right' },
    ],
    sales.map(s => [
      s.number,
      fmtDate(s.created_at),
      s.customer_name || 'Consumidor',
      s.payment_method,
      R(s.discount_amt),
      R(s.total),
      R(Number(s.total) - Number(s.cost || 0)),
    ])
  );

  doc.end();
}));

// GET /api/reports/sales/excel
router.get('/sales/excel', [
  query('start').isDate(),
  query('end').isDate(),
], asyncHandler(async (req, res) => {
  const { start, end } = req.query;
  const sales = await getSalesReport(start, end);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MotoGest';
  const ws = wb.addWorksheet('Vendas');

  ws.columns = [
    { header: 'Nº',         key: 'number',       width: 8  },
    { header: 'Data',       key: 'date',          width: 14 },
    { header: 'Cliente',    key: 'customer',      width: 24 },
    { header: 'Pagamento',  key: 'payment',       width: 14 },
    { header: 'Itens',      key: 'items',         width: 8  },
    { header: 'Desconto',   key: 'discount',      width: 14 },
    { header: 'Total',      key: 'total',         width: 14 },
    { header: 'Custo',      key: 'cost',          width: 14 },
    { header: 'Lucro',      key: 'profit',        width: 14 },
  ];

  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } };

  sales.forEach(s => {
    const profit = Number(s.total) - Number(s.cost || 0);
    ws.addRow({
      number:   s.number,
      date:     fmtDate(s.created_at),
      customer: s.customer_name || 'Consumidor',
      payment:  s.payment_method,
      items:    s.item_count,
      discount: Number(s.discount_amt),
      total:    Number(s.total),
      cost:     Number(s.cost || 0),
      profit,
    });
  });

  // Totais
  const lastRow = sales.length + 2;
  ws.addRow({});
  ws.addRow({
    number: 'TOTAL',
    total:  sales.reduce((s, r) => s + Number(r.total), 0),
    cost:   sales.reduce((s, r) => s + Number(r.cost || 0), 0),
    profit: sales.reduce((s, r) => s + (Number(r.total) - Number(r.cost || 0)), 0),
  });
  ws.getRow(lastRow + 1).font = { bold: true };

  ['discount', 'total', 'cost', 'profit'].forEach(key => {
    ws.getColumn(key).numFmt = 'R$ #,##0.00';
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="vendas-${start}-${end}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}));

// GET /api/reports/products/pdf — produtos mais vendidos
router.get('/products/pdf', [
  query('start').isDate(),
  query('end').isDate(),
], asyncHandler(async (req, res) => {
  const { start, end } = req.query;
  const products = await getTopProducts(start, end);

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="produtos-${start}-${end}.pdf"`);
  doc.pipe(res);

  pdfHeader(doc, 'Produtos Mais Vendidos', `${fmtDate(start)} a ${fmtDate(end)}`);
  pdfTable(doc,
    [
      { label: 'SKU',      width: 65 },
      { label: 'PRODUTO',  width: 195 },
      { label: 'QTD',      width: 45, align: 'right' },
      { label: 'RECEITA',  width: 70, align: 'right' },
      { label: 'LUCRO',    width: 70, align: 'right' },
      { label: 'MARGEM',   width: 50, align: 'right' },
    ],
    products.map(p => {
      const margin = p.revenue > 0 ? ((p.profit / p.revenue) * 100).toFixed(1) + '%' : '-';
      return [p.sku, p.name, p.qty_sold, R(p.revenue), R(p.profit), margin];
    })
  );
  doc.end();
}));

// GET /api/reports/stock/pdf
router.get('/stock/pdf', asyncHandler(async (req, res) => {
  const products = await getStockReport();
  const totalValue = products.reduce((s, p) => s + Number(p.stock_value), 0);

  const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="estoque.pdf"');
  doc.pipe(res);

  pdfHeader(doc, 'Relatório de Estoque', `Gerado em ${fmtDate(new Date())}`);
  doc.fontSize(10).fillColor('#333').text(`Valor total em estoque: ${R(totalValue)}`, { align: 'right' }).moveDown();

  pdfTable(doc,
    [
      { label: 'SKU',        width: 75 },
      { label: 'PRODUTO',    width: 210 },
      { label: 'CATEGORIA',  width: 90 },
      { label: 'LOCAL',      width: 50 },
      { label: 'ESTOQUE',    width: 55, align: 'right' },
      { label: 'MÍN',        width: 40, align: 'right' },
      { label: 'P.CUSTO',    width: 70, align: 'right' },
      { label: 'P.VENDA',    width: 70, align: 'right' },
      { label: 'MARGEM',     width: 50, align: 'right' },
      { label: 'VL.ESTOQUE', width: 75, align: 'right' },
    ],
    products.map(p => [
      p.sku, p.name, p.category, p.location || '-',
      p.stock, p.stock_min,
      R(p.price_buy), R(p.price_sell),
      (p.margin_pct || 0) + '%',
      R(p.stock_value),
    ])
  );
  doc.end();
}));

// GET /api/reports/stock/excel
router.get('/stock/excel', asyncHandler(async (req, res) => {
  const products = await getStockReport();

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Estoque');
  ws.columns = [
    { header: 'SKU',           key: 'sku',         width: 12 },
    { header: 'Produto',       key: 'name',        width: 35 },
    { header: 'Categoria',     key: 'category',    width: 16 },
    { header: 'Localização',   key: 'location',    width: 12 },
    { header: 'Estoque',       key: 'stock',       width: 10 },
    { header: 'Mínimo',        key: 'stock_min',   width: 10 },
    { header: 'P. Compra',     key: 'price_buy',   width: 14 },
    { header: 'P. Venda',      key: 'price_sell',  width: 14 },
    { header: 'Margem %',      key: 'margin',      width: 12 },
    { header: 'Valor Estoque', key: 'stock_val',   width: 16 },
  ];

  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } };

  products.forEach(p => {
    const row = ws.addRow({
      sku: p.sku, name: p.name, category: p.category,
      location: p.location, stock: p.stock, stock_min: p.stock_min,
      price_buy: Number(p.price_buy), price_sell: Number(p.price_sell),
      margin: Number(p.margin_pct), stock_val: Number(p.stock_value),
    });
    if (p.stock <= p.stock_min) {
      row.getCell('stock').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBBF24' } };
    }
    if (p.stock === 0) {
      row.getCell('stock').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFB7185' } };
    }
  });

  ['price_buy', 'price_sell', 'stock_val'].forEach(k => {
    ws.getColumn(k).numFmt = 'R$ #,##0.00';
  });
  ws.getColumn('margin').numFmt = '0.0"%"';

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="estoque.xlsx"');
  await wb.xlsx.write(res);
  res.end();
}));

// GET /api/reports/debts/pdf
router.get('/debts/pdf', asyncHandler(async (req, res) => {
  const debts = await getDebtReport();
  const total = debts.reduce((s, d) => s + Number(d.debt), 0);

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="fiado.pdf"');
  doc.pipe(res);

  pdfHeader(doc, 'Relatório de Fiado / Inadimplência', fmtDate(new Date()));
  doc.fontSize(11).fillColor('#f97316').text(`Total em aberto: ${R(total)}`).moveDown();

  pdfTable(doc,
    [
      { label: 'CLIENTE',   width: 155 },
      { label: 'CPF/CNPJ',  width: 100 },
      { label: 'TELEFONE',  width: 90 },
      { label: 'CIDADE',    width: 80 },
      { label: 'DÉBITO',    width: 70, align: 'right' },
    ],
    debts.map(d => [d.name, d.document || '-', d.phone || '-', d.city || '-', R(d.debt)])
  );

  doc.end();
}));

module.exports = router;
