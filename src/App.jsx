import { useEffect, useRef, useState } from 'react'
import offices from './data/uffici.json'
import peopleCsv from './data/people.csv?raw'
import { parsePeopleFile, downloadPeople, ROLES } from './parsePeople.js'
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
  if (slots.length === 0) return 'Chiuso'
  return slots.map((slot) => `${slot.from}–${slot.to}`).join(', ')
}

function peopleLabel(count) {
  return count === 1 ? '1 persona' : `${count} persone`
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
      <p className="detail-kicker">Persona</p>
      <h2>{person.name}</h2>
      <p className="person-role">{person.role || 'Nessun ruolo'}</p>

      <section className="detail-section">
        <h3>Indirizzo</h3>
        <p className="address">{person.address || 'Nessun indirizzo'}</p>
      </section>

      <section className="detail-section">
        <h3>Telefono</h3>
        <p className="address">{person.phone || 'Nessun numero di telefono'}</p>
      </section>

      <section className="detail-section">
        <h3>Ufficio</h3>
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
            {person.officeId ? `${person.officeId} non è un ufficio conosciuto.` : 'Nessun ufficio assegnato.'}
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
          <th scope="col">Nome</th>
          <th scope="col">Ufficio</th>
          <th scope="col">Indirizzo</th>
          <th scope="col">Telefono</th>
          <th scope="col">Ruolo</th>
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
                <span className="person-office is-unknown">{person.officeId || 'Nessun ufficio'}</span>
              )}
            </td>
            <td>{person.address || '—'}</td>
            <td>{person.phone || '—'}</td>
            <td>{person.role || '—'}</td>
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
  const [role, setRole] = useState('')
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
    if (role === 'none') {
      if (person.role) return []
    } else if (role && person.role !== role) {
      return []
    }
    const haystack = [person.name, person.address, person.phone, person.role, person.officeId, office?.name, office?.municipality]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    if (tokens.some((token) => !haystack.includes(token))) return []
    return [{ person, index, office }]
  })

  return (
    <main className="main people-page">
      <header className="office-head people-head">
        <div>
          <p className="detail-kicker">Persone</p>
          <h2>Tutte le persone</h2>
          <p className="people-summary">
            {rows.length === people.length
              ? peopleLabel(people.length)
              : `${rows.length} di ${peopleLabel(people.length)}`}
          </p>
        </div>
        <button type="button" className="choose-button people-export" onClick={() => downloadPeople(people)}>
          Esporta Excel
        </button>
      </header>

      <div className="people-tools">
        <label>
          Cerca
          <input
            type="search"
            value={query}
            placeholder="Nome, indirizzo, telefono o ruolo"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          Ufficio
          <select
            value={officeOptions.some((office) => office.id === officeId) || officeId === 'unknown' ? officeId : ''}
            onChange={(event) => setOfficeId(event.target.value)}
          >
            <option value="">Tutti gli uffici</option>
            {officeOptions.map((office) => (
              <option key={office.id} value={office.id}>
                {office.name}
              </option>
            ))}
            <option value="unknown">Ufficio sconosciuto</option>
          </select>
        </label>
        <label>
          Comune
          <select value={municipality} onChange={(event) => setMunicipality(event.target.value)}>
            <option value="">Tutti i comuni</option>
            {municipalities.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ruolo
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="">Tutti i ruoli</option>
            {ROLES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
            <option value="none">Nessun ruolo</option>
          </select>
        </label>
      </div>

      <section className="info-card people-table-card">
        <PeopleTable
          rows={rows}
          onSelect={onSelect}
          empty={people.length === 0 ? 'Nessuna persona caricata.' : 'Nessuna persona corrisponde alla ricerca.'}
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
        <h1>Carica un file persone</h1>
        <p>
          Trascina qui un file CSV o Excel, oppure scegline uno dal computer. Il file deve avere le
          colonne nome, id ufficio, indirizzo e telefono. La colonna ruolo può contenere DZ, RGOZ,
          RCZ, COLLABORATORE, SCM, SCF, OFE oppure OSP.
        </p>
        <button type="button" className="choose-button" onClick={() => fileInput.current?.click()}>
          Scegli file
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
      setLoadError(error instanceof Error ? error.message : 'Impossibile leggere questo file.')
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
        text: error instanceof Error ? error.message : 'Impossibile leggere questi turni.',
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
            aria-label={menuOpen ? 'Chiudi menu' : 'Apri menu'}
            aria-expanded={menuOpen}
            aria-controls="sidebar"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="burger-lines" />
          </button>
        </header>
      )}
      {narrow && menuOpen && (
        <button type="button" className="backdrop" aria-label="Chiudi menu" onClick={() => setMenuOpen(false)} />
      )}
      <aside id="sidebar" className="sidebar" inert={narrow && !menuOpen ? true : undefined}>
        <div className="load-bar">
          <button type="button" className="load-button" onClick={() => downloadSchedule(offices, assignments)}>
            Salva turni
          </button>
          <button type="button" className="load-button" onClick={() => scheduleInput.current?.click()}>
            Carica turni
          </button>
          <button type="button" className="load-button" onClick={() => fileInput.current?.click()}>
            Carica persone
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
            Turni
          </button>
          <section className={officesOpen ? 'menu-section is-open' : 'menu-section'}>
            <button
              type="button"
              className="menu-toggle"
              aria-expanded={officesOpen}
              aria-controls="office-list"
              onClick={() => setOfficesOpen((open) => !open)}
            >
              <span>Uffici</span>
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
          <button
            type="button"
            className={selection?.kind === 'people' ? 'menu-link menu-link-end is-selected' : 'menu-link menu-link-end'}
            aria-current={selection?.kind === 'people' ? 'page' : undefined}
            onClick={openPeople}
          >
            <span>Persone</span>
            <span className="menu-count">{people.length}</span>
          </button>
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
                  Livello {selectedOffice.level}
                </span>
              </p>
            </header>

            <div className="office-cards">
              <section className="info-card">
                <h3>Indirizzo</h3>
                <p className="address">{formatAddress(selectedOffice.address)}</p>
              </section>

              <section className="info-card">
                <h3>Turni del personale</h3>
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
                          : 'Chiuso'}
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">{SHIFTS.sabato.label}</th>
                      <td className={selectedOffice.openSaturday ? undefined : 'is-closed'}>
                        {selectedOffice.openSaturday
                          ? `${SHIFTS.sabato.from}–${SHIFTS.sabato.to}`
                          : 'Chiuso'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <section className="info-card info-card-wide">
                <h3>Orari di apertura</h3>
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
                <h3>Turni</h3>
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
                  <span>Persone</span>
                  <span className="menu-count">{assigned.length}</span>
                  <Chevron />
                </summary>
                <div className="people-accordion-body">
                  <PeopleTable
                    rows={assigned.map(({ person, index }) => ({ person, index, office: selectedOffice }))}
                    onSelect={selectPerson}
                    empty="Nessuna persona assegnata."
                  />
                </div>
              </details>
            </div>
          </div>
        ) : (
          <div className="empty">
            <h2>Seleziona un ufficio o una persona</h2>
            <p>Scegli un ufficio postale o una persona dall'elenco per vederne i dettagli.</p>
          </div>
        )}
      </main>
      )}
    </div>
  )
}

export default App
