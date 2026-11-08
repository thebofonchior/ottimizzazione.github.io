import * as XLSX from 'xlsx'

const NAME_HEADERS = new Set(['name', 'nome'])
const OFFICE_HEADERS = new Set(['officeid', 'ufficio'])
const ADDRESS_HEADERS = new Set(['address', 'homeaddress', 'indirizzo'])
const PHONE_HEADERS = new Set(['phone', 'phonenumber', 'telephone', 'telefono', 'tel', 'cellulare'])
const ROLE_HEADERS = new Set(['role', 'ruolo'])

export const ROLES = ['DZ', 'RGOZ', 'RCZ', 'COLLABORATORE', 'SCM', 'SCF', 'OFE', 'OSP']

function canonicalRole(value) {
  const role = String(value ?? '').trim().toUpperCase()
  if (!role) return ''
  return ROLES.includes(role) ? role : null
}

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
    throw new Error('Impossibile leggere questo file.')
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error('Questo file non contiene persone.')

  const table = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })
  const headerIndex = table.findIndex((row) => row.some((cell) => String(cell).trim()))
  if (headerIndex === -1) throw new Error('Questo file non contiene persone.')

  const headers = table[headerIndex].map((cell) => normalizeHeader(cell))
  const nameIndex = headers.findIndex((header) => NAME_HEADERS.has(header))
  const officeIndex = headers.findIndex((header) => OFFICE_HEADERS.has(header))
  const addressIndex = headers.findIndex((header) => ADDRESS_HEADERS.has(header))
  const phoneIndex = headers.findIndex((header) => PHONE_HEADERS.has(header))
  const roleIndex = headers.findIndex((header) => ROLE_HEADERS.has(header))
  if (nameIndex === -1 || officeIndex === -1 || addressIndex === -1 || phoneIndex === -1) {
    throw new Error('Questo file deve avere le colonne nome, id ufficio, indirizzo e telefono.')
  }

  const people = []
  for (const row of table.slice(headerIndex + 1)) {
    const name = String(row[nameIndex] ?? '').trim()
    const officeId = String(row[officeIndex] ?? '').trim()
    const address = String(row[addressIndex] ?? '').trim()
    const phone = String(row[phoneIndex] ?? '').trim()
    const role = roleIndex === -1 ? '' : canonicalRole(row[roleIndex])
    if (!name) continue
    if (role === null) {
      throw new Error(
        `Il ruolo di ${name} deve essere uno tra ${ROLES.join(', ')}.`,
      )
    }
    people.push({ name, officeId, address, phone, role })
  }

  if (people.length === 0) throw new Error('Questo file non contiene persone.')
  return people
}

export function downloadPeople(people) {
  const rows = [
    ['name', 'officeId', 'address', 'phone', 'role'],
    ...people.map((person) => [person.name, person.officeId, person.address, person.phone, person.role || '']),
  ]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'people')
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'people.xlsx'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
