import * as XLSX from 'xlsx'

const DAY_HEADERS = new Set(['day'])
const FROM_HEADERS = new Set(['from'])
const TO_HEADERS = new Set(['to'])
const NAME_HEADERS = new Set(['name'])

export const WEEK_DAYS = [
  'lunedì',
  'martedì',
  'mercoledì',
  'giovedì',
  'venerdì',
  'sabato',
  'domenica',
]

const WEEKDAYS = new Set(WEEK_DAYS.slice(0, 5))

export const SHIFTS = {
  mattina: { id: 'mattina', label: 'Mattina', from: '08:00', to: '14:10' },
  pomeriggio: { id: 'pomeriggio', label: 'Pomeriggio', from: '13:30', to: '19:40' },
  sabato: { id: 'sabato', label: 'Sabato', from: '08:00', to: '13:10' },
}

function normalizeHeader(value) {
  return String(value).trim().toLowerCase().replace(/[\s_]+/g, '')
}

function normalizeDay(value) {
  return String(value).trim().toLowerCase()
}

function normalizeTime(value) {
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return String(value).trim()
  return `${match[1].padStart(2, '0')}:${match[2]}`
}

export function slotKey(day, from, to) {
  return `${normalizeDay(day)}|${normalizeTime(from)}|${normalizeTime(to)}`
}

export function timeToMinutes(value) {
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

export function minutesToTime(total) {
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function parseSlotKey(key) {
  const [day, from, to] = String(key).split('|')
  if (!day || !from || !to) return null
  const start = timeToMinutes(from)
  const end = timeToMinutes(to)
  if (start == null || end == null) return null
  return { day: normalizeDay(day), from: normalizeTime(from), to: normalizeTime(to), start, end }
}

function containsWindow(window, from, to) {
  if (!window) return false
  const start = timeToMinutes(from)
  const end = timeToMinutes(to)
  const windowStart = timeToMinutes(window.from)
  const windowEnd = timeToMinutes(window.to)
  if (start == null || end == null || windowStart == null || windowEnd == null) return false
  return start >= windowStart && end <= windowEnd && end > start
}

function shiftRecord(shift, enabled) {
  return { id: shift.id, label: shift.label, from: shift.from, to: shift.to, enabled }
}

export function defaultDayShifts(office, day) {
  const normalized = normalizeDay(day)
  if (normalized === 'sabato') return [shiftRecord(SHIFTS.sabato, Boolean(office.openSaturday))]
  if (!WEEKDAYS.has(normalized)) {
    return [shiftRecord(SHIFTS.mattina, false), shiftRecord(SHIFTS.pomeriggio, false)]
  }
  return [shiftRecord(SHIFTS.mattina, true), shiftRecord(SHIFTS.pomeriggio, Boolean(office.openAfternoon))]
}

export function resolveShifts(office, day, dayHours) {
  const normalized = normalizeDay(day)
  const defaults = defaultDayShifts(office, day)
  const override = dayHours?.[office.id]?.[normalized]
  if (!override?.shifts) {
    if (override?.from && override?.to && !override.closed) {
      const window = { from: normalizeTime(override.from), to: normalizeTime(override.to) }
      return defaults.map((shift) => ({ ...shift, enabled: containsWindow(window, shift.from, shift.to) }))
    }
    return defaults
  }
  return defaults.map((shift) => {
    const saved = override.shifts[shift.id]
    if (!saved) return shift
    return {
      ...shift,
      enabled: Boolean(saved.enabled),
      from: saved.from ? normalizeTime(saved.from) : shift.from,
      to: saved.to ? normalizeTime(saved.to) : shift.to,
    }
  })
}

function shiftSpan(shifts) {
  const enabled = shifts.filter((shift) => shift.enabled)
  if (enabled.length === 0) return null
  const from = enabled.reduce((earliest, shift) =>
    timeToMinutes(shift.from) < timeToMinutes(earliest) ? shift.from : earliest,
  enabled[0].from)
  const to = enabled.reduce((latest, shift) =>
    timeToMinutes(shift.to) > timeToMinutes(latest) ? shift.to : latest,
  enabled[0].to)
  return { from, to }
}

export function resolveWindow(office, day, dayHours) {
  const normalized = normalizeDay(day)
  if (dayHours?.[office.id]?.[normalized]?.closed) return null
  return shiftSpan(resolveShifts(office, day, dayHours))
}

export function shiftsForDay(office, day, dayHours) {
  const normalized = normalizeDay(day)
  if (dayHours?.[office.id]?.[normalized]?.closed) return []
  return resolveShifts(office, day, dayHours).filter((shift) => shift.enabled)
}

function mergedIntervals(shifts) {
  const intervals = shifts
    .map((shift) => [timeToMinutes(shift.from), timeToMinutes(shift.to)])
    .filter((interval) => interval[0] != null && interval[1] != null && interval[1] > interval[0])
    .sort((a, b) => a[0] - b[0])
  const merged = []
  for (const [start, end] of intervals) {
    const last = merged[merged.length - 1]
    if (!last || start > last[1]) merged.push([start, end])
    else last[1] = Math.max(last[1], end)
  }
  return merged
}

export function openIntervals(office, day, dayHours) {
  const normalized = normalizeDay(day)
  if (dayHours?.[office.id]?.[normalized]?.closed) return []
  return mergedIntervals(resolveShifts(office, day, dayHours).filter((shift) => shift.enabled))
}

export function rangeFitsWindow(office, day, from, to, dayHours) {
  const start = timeToMinutes(from)
  const end = timeToMinutes(to)
  if (start == null || end == null || end <= start) return false
  let cursor = start
  for (const [intervalStart, intervalEnd] of openIntervals(office, day, dayHours)) {
    if (intervalStart > cursor) return false
    if (intervalEnd > cursor) cursor = intervalEnd
    if (cursor >= end) return true
  }
  return false
}

export function personHasOverlap(officeAssignments, day, from, to, name, ignore) {
  const start = timeToMinutes(from)
  const end = timeToMinutes(to)
  const normalized = normalizeDay(day)
  if (start == null || end == null || !name) return false
  for (const [key, names] of Object.entries(officeAssignments ?? {})) {
    if (!names.includes(name)) continue
    if (ignore && key === ignore.key && name === ignore.name) continue
    const parsed = parseSlotKey(key)
    if (!parsed || parsed.day !== normalized) continue
    if (start < parsed.end && parsed.start < end) return true
  }
  return false
}

export function listAssignments(officeAssignments) {
  const order = new Map(WEEK_DAYS.map((day, index) => [day, index]))
  const items = []
  for (const [key, names] of Object.entries(officeAssignments ?? {})) {
    const parsed = parseSlotKey(key)
    if (!parsed) continue
    for (const name of names) items.push({ key, name, ...parsed })
  }
  items.sort((a, b) => {
    const dayDiff = (order.get(a.day) ?? 99) - (order.get(b.day) ?? 99)
    if (dayDiff !== 0) return dayDiff
    if (a.start !== b.start) return a.start - b.start
    return a.name.localeCompare(b.name)
  })
  return items
}

function peopleNames(people, officeId) {
  const needle = officeId.toLowerCase()
  return new Set(
    people
      .filter((person) => person.officeId.trim().toLowerCase() === needle)
      .map((person) => person.name),
  )
}

export function addAssignment(assignments, officeId, key, name) {
  const officeAssignments = assignments[officeId] ?? {}
  const names = officeAssignments[key] ?? []
  if (names.includes(name)) return assignments
  return {
    ...assignments,
    [officeId]: { ...officeAssignments, [key]: [...names, name] },
  }
}

export function removeAssignment(assignments, officeId, key, name) {
  const officeAssignments = assignments[officeId] ?? {}
  const names = (officeAssignments[key] ?? []).filter((current) => current !== name)
  return {
    ...assignments,
    [officeId]: { ...officeAssignments, [key]: names },
  }
}

export function createScheduleWorkbook(offices, assignments) {
  const workbook = XLSX.utils.book_new()
  for (const office of offices) {
    const rows = [['day', 'from', 'to', 'name']]
    for (const item of listAssignments(assignments[office.id])) {
      rows.push([item.day, item.from, item.to, item.name])
    }
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), office.id)
  }
  return workbook
}

export function scheduleToBytes(offices, assignments) {
  return XLSX.write(createScheduleWorkbook(offices, assignments), {
    bookType: 'xlsx',
    type: 'array',
  })
}

function headerIndex(headers, accepted) {
  return headers.findIndex((header) => accepted.has(header))
}

export function readScheduleFile(buffer, offices, people, dayHours) {
  let workbook
  try {
    workbook = XLSX.read(buffer, { type: 'array' })
  } catch {
    throw new Error('This schedule could not be read.')
  }

  const officesById = new Map(offices.map((office) => [office.id, office]))
  const assignments = {}
  let skippedSheets = 0
  let skippedRows = 0

  for (const sheetName of workbook.SheetNames) {
    const office = officesById.get(sheetName)
    if (!office) {
      skippedSheets += 1
      continue
    }

    const table = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: '',
      raw: false,
    })
    const headerRow = table.findIndex((row) => row.some((cell) => String(cell).trim()))
    if (headerRow === -1) {
      assignments[office.id] = {}
      continue
    }

    const headers = table[headerRow].map((cell) => normalizeHeader(cell))
    const dayIndex = headerIndex(headers, DAY_HEADERS)
    const fromIndex = headerIndex(headers, FROM_HEADERS)
    const toIndex = headerIndex(headers, TO_HEADERS)
    const nameIndex = headerIndex(headers, NAME_HEADERS)
    if (dayIndex === -1 || fromIndex === -1 || toIndex === -1 || nameIndex === -1) {
      skippedSheets += 1
      continue
    }

    const allowedNames = peopleNames(people, office.id)
    const officeAssignments = {}

    for (const row of table.slice(headerRow + 1)) {
      const day = String(row[dayIndex] ?? '').trim()
      const from = String(row[fromIndex] ?? '').trim()
      const to = String(row[toIndex] ?? '').trim()
      const name = String(row[nameIndex] ?? '').trim()
      if (!day && !from && !to && !name) continue

      const key = slotKey(day, from, to)
      if (!rangeFitsWindow(office, day, from, to, dayHours) || !allowedNames.has(name)) {
        skippedRows += 1
        continue
      }
      const names = officeAssignments[key] ?? []
      if (!names.includes(name)) officeAssignments[key] = [...names, name]
    }

    assignments[office.id] = officeAssignments
  }

  return { assignments, skippedSheets, skippedRows }
}

export function scheduleMessage(skippedSheets, skippedRows) {
  if (skippedSheets === 0 && skippedRows === 0) return 'Schedule loaded.'
  const sheets = skippedSheets === 1 ? '1 sheet' : `${skippedSheets} sheets`
  const rows = skippedRows === 1 ? '1 row' : `${skippedRows} rows`
  return `Schedule loaded. Skipped ${sheets} and ${rows} that did not match an office, the open shifts, or a person.`
}
