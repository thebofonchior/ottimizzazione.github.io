import { useEffect, useRef, useState } from 'react'
import offices from './data/uffici.json'
import peopleCsv from './data/people.csv?raw'
import { parsePeopleFile } from './parsePeople.js'
import { SHIFTS, readScheduleFile, scheduleMessage, scheduleToBytes } from './schedule.js'
import { OfficeCalendar, ScheduleView } from './ScheduleView.jsx'
import './App.css'

// Temporary for development: the people list always starts from this file.
const developmentPeople = parsePeopleFile(new TextEncoder().encode(peopleCsv), 'people.csv')
const ASSIGNMENTS_KEY = 'progetto-richi.assignments'
const DAY_HOURS_KEY = 'progetto-richi.dayHours'

function readStored(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value
  } catch {
    return {}
  }
}

function downloadSchedule(offices, assignments) {
  const bytes = scheduleToBytes(offices, assignments)
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'schedule.xlsx'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function formatAddress(address) {
  return `${address.street}, ${address.postalCode} ${address.locality} (${address.province})`
}

function formatDay(day) {
  return day.charAt(0).toUpperCase() + day.slice(1)
}

function formatSlots(slots) {
  if (slots.length === 0) return 'Closed'
  return slots.map((slot) => `${slot.from}–${slot.to}`).join(', ')
}

function findOffice(officeId) {
  const needle = officeId.trim().toLowerCase()
  if (!needle) return null
  return offices.find((office) => office.id.toLowerCase() === needle) ?? null
}

function useNarrowScreen() {
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 800px)').matches)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 800px)')
    const onChange = () => setNarrow(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return narrow
}

function PersonDetail({ person }) {
  const office = findOffice(person.officeId)

  return (
    <article className="office-detail">
      <p className="detail-kicker">Person</p>
      <h2>{person.name}</h2>

      <section className="detail-section">
        <h3>Home address</h3>
        <p className="address">{person.address || 'No address'}</p>
      </section>

      <section className="detail-section">
        <h3>Phone</h3>
        <p className="address">{person.phone || 'No phone number'}</p>
      </section>

      <section className="detail-section">
        <h3>Office</h3>
        {office ? (
          <>
            <p className="address">{office.name}</p>
            <p className="detail-id">{office.id}</p>
            <p className="person-place">
              {office.municipality} · {formatAddress(office.address)}
            </p>
          </>
        ) : (
          <p className="assigned-empty">
            {person.officeId ? `${person.officeId} is not a known office.` : 'No office is assigned.'}
          </p>
        )}
      </section>
    </article>
  )
}

function PeopleTable({ rows, onSelect, empty }) {
  if (rows.length === 0) return <p className="assigned-empty">{empty}</p>

  return (
    <table className="people-table">
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Office</th>
          <th scope="col">Address</th>
          <th scope="col">Phone</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ person, index, office }) => (
          <tr key={`${person.name}-${index}`}>
            <td>
              <button type="button" className="people-name" onClick={() => onSelect(index)}>
                {person.name}
              </button>
            </td>
            <td>
              {office ? (
                office.name
              ) : (
                <span className="person-office is-unknown">{person.officeId || 'No office'}</span>
              )}
            </td>
            <td>{person.address || '—'}</td>
            <td>{person.phone || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PeoplePage({ people, onSelect }) {
  const [query, setQuery] = useState('')
  const [officeId, setOfficeId] = useState('')
  const [municipality, setMunicipality] = useState('')
  const municipalities = [...new Set(offices.map((office) => office.municipality))].sort((a, b) =>
    a.localeCompare(b),
  )
  const officeOptions = offices.filter((office) => !municipality || office.municipality === municipality)
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const rows = people.flatMap((person, index) => {
    const office = findOffice(person.officeId)
    if (officeId === 'unknown') {
      if (office) return []
    } else if (officeId && office?.id !== officeId) {
      return []
    }
    if (municipality && office?.municipality !== municipality) return []
    const haystack = [person.name, person.address, person.phone, person.officeId, office?.name, office?.municipality]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    if (tokens.some((token) => !haystack.includes(token))) return []
    return [{ person, index, office }]
  })

  return (
    <main className="main people-page">
      <header className="office-head">
        <p className="detail-kicker">People</p>
        <h2>All people</h2>
        <p className="people-summary">
          {rows.length === people.length ? `${people.length} people` : `${rows.length} of ${people.length}`}
        </p>
      </header>

      <div className="people-tools">
        <label>
          Search
          <input
            type="search"
            value={query}
            placeholder="Name, address, or phone"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          Office
          <select
            value={officeOptions.some((office) => office.id === officeId) || officeId === 'unknown' ? officeId : ''}
            onChange={(event) => setOfficeId(event.target.value)}
          >
            <option value="">All offices</option>
            {officeOptions.map((office) => (
              <option key={office.id} value={office.id}>
                {office.name}
              </option>
            ))}
            <option value="unknown">Unknown office</option>
          </select>
        </label>
        <label>
          Municipality
          <select value={municipality} onChange={(event) => setMunicipality(event.target.value)}>
            <option value="">All municipalities</option>
            {municipalities.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="info-card people-table-card">
        <PeopleTable
          rows={rows}
          onSelect={onSelect}
          empty={people.length === 0 ? 'No people loaded.' : 'No people match this search.'}
        />
      </section>
    </main>
  )
}

function Home({ onFile, error }) {
  const fileInput = useRef(null)
  const [dragging, setDragging] = useState(false)

  function takeFile(file) {
    setDragging(false)
    if (file) onFile(file)
  }

  return (
    <main className="home">
      <div
        className={dragging ? 'drop-zone is-dragging' : 'drop-zone'}
        onDragEnter={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          takeFile(event.dataTransfer.files?.[0])
        }}
      >
        <h1>Load a people file</h1>
        <p>
          Drop a CSV or Excel file here, or choose one from your computer. The file needs columns
          for name, office id, home address, and phone number.
        </p>
        <button type="button" className="choose-button" onClick={() => fileInput.current?.click()}>
          Choose file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,.xlsx,.xls,text/csv"
          hidden
          onChange={(event) => {
            takeFile(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        {error && (
          <p className="load-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  )
}

function Chevron() {
  return (
    <svg className="chevron" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M6 3.5 10.5 8 6 12.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function App() {
  const fileInput = useRef(null)
  const scheduleInput = useRef(null)
  const narrow = useNarrowScreen()
  const [menuOpen, setMenuOpen] = useState(false)
  const [selection, setSelection] = useState(null)
  const [officesOpen, setOfficesOpen] = useState(true)
  const [people, setPeople] = useState(developmentPeople)
  const [loadError, setLoadError] = useState(null)
  const [scheduleNotice, setScheduleNotice] = useState(null)
  const [assignments, setAssignments] = useState(() => readStored(ASSIGNMENTS_KEY))
  const [dayHours, setDayHours] = useState(() => readStored(DAY_HOURS_KEY))
  const selectedOffice =
    selection?.kind === 'office'
      ? (offices.find((office) => office.id === selection.id) ?? null)
      : null
  const selectedPerson =
    selection?.kind === 'person' ? (people[selection.index] ?? null) : null
  const assigned = selectedOffice
    ? people.flatMap((person, index) =>
        findOffice(person.officeId)?.id === selectedOffice.id ? [{ person, index }] : [],
      )
    : []

  async function loadPeopleFile(file) {
    if (!file) return

    try {
      const nextPeople = parsePeopleFile(await file.arrayBuffer(), file.name)
      setPeople(nextPeople)
      setLoadError(null)
      setMenuOpen(false)
      setSelection((current) => (current?.kind === 'person' ? null : current))
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'This file could not be read.')
    }
  }

  function onPeopleFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    loadPeopleFile(file)
  }

  function selectOffice(id) {
    setSelection({ kind: 'office', id })
    setMenuOpen(false)
  }

  function selectPerson(index) {
    setSelection({ kind: 'person', index })
    setMenuOpen(false)
  }

  function openSchedule() {
    setSelection({ kind: 'schedule' })
    setMenuOpen(false)
  }

  function openPeople() {
    setSelection({ kind: 'people' })
    setMenuOpen(false)
  }

  useEffect(() => {
    localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(assignments))
  }, [assignments])

  useEffect(() => {
    localStorage.setItem(DAY_HOURS_KEY, JSON.stringify(dayHours))
  }, [dayHours])

  async function onScheduleFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const result = readScheduleFile(await file.arrayBuffer(), offices, people, dayHours)
      setAssignments(result.assignments)
      setScheduleNotice({
        error: false,
        text: scheduleMessage(result.skippedSheets, result.skippedRows),
      })
    } catch (error) {
      setScheduleNotice({
        error: true,
        text: error instanceof Error ? error.message : 'This schedule could not be read.',
      })
    }
  }

  useEffect(() => {
    if (!menuOpen) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  return (
    <div className={menuOpen ? 'app menu-is-open' : 'app'}>
      {narrow && (
        <header className="topbar">
          <button
            type="button"
            className="burger"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="sidebar"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="burger-lines" />
          </button>
        </header>
      )}
      {narrow && menuOpen && (
        <button type="button" className="backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
      )}
      <aside id="sidebar" className="sidebar" inert={narrow && !menuOpen ? true : undefined}>
        <div className="load-bar">
          <button type="button" className="load-button" onClick={() => downloadSchedule(offices, assignments)}>
            Save schedule
          </button>
          <button type="button" className="load-button" onClick={() => scheduleInput.current?.click()}>
            Load schedule
          </button>
          <button type="button" className="load-button" onClick={() => fileInput.current?.click()}>
            Load people
          </button>
          <input
            ref={scheduleInput}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden
            onChange={onScheduleFile}
          />
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv"
            hidden
            onChange={onPeopleFile}
          />
          {scheduleNotice && (
            <p className={scheduleNotice.error ? 'load-error' : 'schedule-message'} role="status">
              {scheduleNotice.text}
            </p>
          )}
          {loadError && (
            <p className="load-error" role="alert">
              {loadError}
            </p>
          )}
        </div>

        <div className="menu">
          <button
            type="button"
            className={selection?.kind === 'schedule' ? 'menu-link is-selected' : 'menu-link'}
            aria-current={selection?.kind === 'schedule' ? 'page' : undefined}
            onClick={openSchedule}
          >
            Schedule
          </button>
          <button
            type="button"
            className={selection?.kind === 'people' ? 'menu-link is-selected' : 'menu-link'}
            aria-current={selection?.kind === 'people' ? 'page' : undefined}
            onClick={openPeople}
          >
            <span>People</span>
            <span className="menu-count">{people.length}</span>
          </button>
          <section className={officesOpen ? 'menu-section is-open' : 'menu-section'}>
            <button
              type="button"
              className="menu-toggle"
              aria-expanded={officesOpen}
              aria-controls="office-list"
              onClick={() => setOfficesOpen((open) => !open)}
            >
              <span>Offices</span>
              <span className="menu-count">{offices.length}</span>
              <Chevron />
            </button>
            {officesOpen && (
              <ul className="office-list" id="office-list">
                {offices.map((office) => {
                  const isSelected = selectedOffice?.id === office.id
                  return (
                    <li key={office.id}>
                      <button
                        type="button"
                        className={isSelected ? 'office-item is-selected' : 'office-item'}
                        aria-current={isSelected ? 'true' : undefined}
                        onClick={() => selectOffice(office.id)}
                      >
                        <span className="office-name">{office.name}</span>
                        <span className="office-meta">
                          <span>{office.municipality}</span>
                          <span className="level" data-level={office.level}>
                            {office.level}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      </aside>

      {selection?.kind === 'schedule' ? (
        <ScheduleView
          offices={offices}
          people={people}
          assignments={assignments}
          onAssignmentsChange={setAssignments}
          dayHours={dayHours}
          onDayHoursChange={setDayHours}
        />
      ) : selection?.kind === 'people' ? (
        <PeoplePage people={people} onSelect={selectPerson} />
      ) : people.length === 0 ? (
        <Home onFile={loadPeopleFile} error={loadError} />
      ) : (
      <main className="main">
        {selectedPerson ? (
          <PersonDetail person={selectedPerson} />
        ) : selectedOffice ? (
          <div className="office-view">
            <header className="office-head">
              <p className="detail-kicker">{selectedOffice.municipality}</p>
              <h2>{selectedOffice.name}</h2>
              <p className="office-head-meta">
                <span className="detail-id">{selectedOffice.id}</span>
                <span className="level" data-level={selectedOffice.level}>
                  Level {selectedOffice.level}
                </span>
              </p>
            </header>

            <div className="office-cards">
              <section className="info-card">
                <h3>Address</h3>
                <p className="address">{formatAddress(selectedOffice.address)}</p>
              </section>

              <section className="info-card">
                <h3>Staff shifts</h3>
                <table className="hours">
                  <tbody>
                    <tr>
                      <th scope="row">{SHIFTS.mattina.label}</th>
                      <td>
                        {SHIFTS.mattina.from}–{SHIFTS.mattina.to}
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">{SHIFTS.pomeriggio.label}</th>
                      <td className={selectedOffice.openAfternoon ? undefined : 'is-closed'}>
                        {selectedOffice.openAfternoon
                          ? `${SHIFTS.pomeriggio.from}–${SHIFTS.pomeriggio.to}`
                          : 'Closed'}
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">{SHIFTS.sabato.label}</th>
                      <td className={selectedOffice.openSaturday ? undefined : 'is-closed'}>
                        {selectedOffice.openSaturday
                          ? `${SHIFTS.sabato.from}–${SHIFTS.sabato.to}`
                          : 'Closed'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <section className="info-card info-card-wide">
                <h3>Opening hours</h3>
                <ul className="hours-grid">
                  {selectedOffice.openingHours.map((entry) => (
                    <li key={entry.day} className={entry.day === 'domenica' ? 'is-sunday' : undefined}>
                      <span>{formatDay(entry.day)}</span>
                      <span className={entry.slots.length === 0 ? 'is-closed' : undefined}>
                        {formatSlots(entry.slots)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="info-card info-card-wide">
                <h3>Schedule</h3>
                <OfficeCalendar
                  office={selectedOffice}
                  people={people}
                  assignments={assignments}
                  onAssignmentsChange={setAssignments}
                  dayHours={dayHours}
                  onDayHoursChange={setDayHours}
                />
              </section>

              <details className="info-card info-card-wide people-accordion">
                <summary>
                  <span>People</span>
                  <span className="menu-count">{assigned.length}</span>
                  <Chevron />
                </summary>
                <div className="people-accordion-body">
                  <PeopleTable
                    rows={assigned.map(({ person, index }) => ({ person, index, office: selectedOffice }))}
                    onSelect={selectPerson}
                    empty="No people are assigned."
                  />
                </div>
              </details>
            </div>
          </div>
        ) : (
          <div className="empty">
            <h2>Select an office or a person</h2>
            <p>Choose a post office or a person from the list to see their details.</p>
          </div>
        )}
      </main>
      )}
    </div>
  )
}

export default App
