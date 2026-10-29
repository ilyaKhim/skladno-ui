import { strToU8, zipSync } from 'fflate'

export type MaterialFormat = 'pdf' | 'docx' | 'txt'

/** Small valid documents exercise the real parsers, without checked-in customer documents. */
export function materialFile(format: MaterialFormat, blankPdfPage = false) {
  const text = `E2E original ${format.toUpperCase()} 41`
  if (format === 'txt') return { name: 'report.txt', mimeType: 'text/plain', buffer: Buffer.from(`\uFEFF${text}\nRevenue: 41`) }
  if (format === 'docx') {
    const zip = zipSync({
      '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
      '_rels/.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
      'word/document.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Выручка</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>41</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr/></w:body></w:document>`),
    })
    return { name: 'report.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from(zip) }
  }
  return { name: 'report.pdf', mimeType: 'application/pdf', buffer: pdf(text, blankPdfPage) }
}

function pdf(text: string, blankPage: boolean) {
  const escaped = text.replace(/[\\()]/g, '\\$&')
  const stream = `BT /F1 14 Tf 50 700 Td (${escaped}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [3 0 R${blankPage ? ' 6 0 R' : ''}] /Count ${blankPage ? 2 : 1} >>`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    ...(blankPage ? [
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 7 0 R >>',
      '<< /Length 0 >>\nstream\n\nendstream',
    ] : []),
  ]
  let document = '%PDF-1.4\n'
  const offsets = [0]
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(document))
    document += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const xref = Buffer.byteLength(document)
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  document += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(document)
}
