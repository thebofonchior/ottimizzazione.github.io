import * as XLSX from 'xlsx'

const NAME_HEADERS = new Set(['name', 'nome'])
const OFFICE_HEADERS = new Set(['officeid', 'ufficio'])

function normalizeHeader(value) {
  return String(value).trim().toLowerCase().replace(/[\s_]+/g, '')
}

function readWorkbook(buffer, filename) {
  const isCsv = filename.toLowerCase().endsWith('.csv')
  if (!isCsv) return XLSX.read(buffer, { type: 'array' })

  const text = new TextDecoder('utf-8').decode(buffer).replace(/^\uFEFF/, '')
  const header = text.split(/\r?\n/).find((line) => line.trim()) ?? ''
  const semicolons = header.split(';').length
  const commas = header.split(',').length
  const FS = semicolons > commas ? ';' : ','
  return XLSX.read(text, { type: 'string', FS })
}

export function parsePeopleFile(buffer, filename) {
  let workbook
  try {
    workbook = readWorkbook(buffer, filename)
  } catch {
    throw new Error('This file could not be read.')
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error('This file has no people.')

  const table = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })
  const headerIndex = table.findIndex((row) => row.some((cell) => String(cell).trim()))
  if (headerIndex === -1) throw new Error('This file has no people.')

  const headers = table[headerIndex].map((cell) => normalizeHeader(cell))
  const nameIndex = headers.findIndex((header) => NAME_HEADERS.has(header))
  const officeIndex = headers.findIndex((header) => OFFICE_HEADERS.has(header))
  if (nameIndex === -1 || officeIndex === -1) {
    throw new Error('This file needs a name column and an office id column.')
  }

  const people = []
  for (const row of table.slice(headerIndex + 1)) {
    const name = String(row[nameIndex] ?? '').trim()
    const officeId = String(row[officeIndex] ?? '').trim()
    if (!name) continue
    people.push({ name, officeId })
  }

  if (people.length === 0) throw new Error('This file has no people.')
  return people
}
