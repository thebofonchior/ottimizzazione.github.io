import { useRef, useState } from 'react'
import offices from './data/uffici.json'
import { parsePeopleFile } from './parsePeople.js'
import './App.css'

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

const PEOPLE_STORAGE_KEY = 'people'

function findOffice(officeId) {
  const needle = officeId.trim().toLowerCase()
  if (!needle) return null
  return offices.find((office) => office.id.toLowerCase() === needle) ?? null
}

function isStoredPerson(value) {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof value.name === 'string' &&
    typeof value.officeId === 'string'
  )
}

function readSavedPeople() {
  try {
    const stored = localStorage.getItem(PEOPLE_STORAGE_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed) || !parsed.every(isStoredPerson)) return []
    return parsed
  } catch {
    return []
  }
}

function savePeople(nextPeople) {
  localStorage.setItem(PEOPLE_STORAGE_KEY, JSON.stringify(nextPeople))
}

function PersonDetail({ person }) {
  const office = findOffice(person.officeId)

  return (
    <article className="office-detail">
      <p className="detail-kicker">Person</p>
      <h2>{person.name}</h2>

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
  const [selection, setSelection] = useState(null)
  const [officesOpen, setOfficesOpen] = useState(true)
  const [peopleOpen, setPeopleOpen] = useState(() => readSavedPeople().length > 0)
  const [people, setPeople] = useState(readSavedPeople)
  const [loadError, setLoadError] = useState(null)
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

  async function onPeopleFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const nextPeople = parsePeopleFile(await file.arrayBuffer(), file.name)
      savePeople(nextPeople)
      setPeople(nextPeople)
      setPeopleOpen(true)
      setLoadError(null)
      setSelection((current) => (current?.kind === 'person' ? null : current))
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'This file could not be read.')
    }
  }

  function selectOffice(id) {
    setSelection({ kind: 'office', id })
  }

  function selectPerson(index) {
    setSelection({ kind: 'person', index })
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="load-bar">
          <button type="button" className="load-button" onClick={() => fileInput.current?.click()}>
            Load people
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv"
            hidden
            onChange={onPeopleFile}
          />
          {loadError && (
            <p className="load-error" role="alert">
              {loadError}
            </p>
          )}
        </div>

        <div className="menu">
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

          <section className={peopleOpen ? 'menu-section is-open' : 'menu-section'}>
            <button
              type="button"
              className="menu-toggle"
              aria-expanded={peopleOpen}
              aria-controls="people-list"
              onClick={() => setPeopleOpen((open) => !open)}
            >
              <span>People</span>
              <span className="menu-count">{people.length}</span>
              <Chevron />
            </button>
            {peopleOpen && (
              <ul className="office-list" id="people-list">
                {people.length === 0 ? (
                  <li className="people-empty">No people loaded.</li>
                ) : (
                  people.map((person, index) => {
                    const office = findOffice(person.officeId)
                    const isSelected = selection?.kind === 'person' && selection.index === index
                    return (
                      <li key={`${person.name}-${person.officeId}-${index}`}>
                        <button
                          type="button"
                          className={isSelected ? 'person-item is-selected' : 'person-item'}
                          aria-current={isSelected ? 'true' : undefined}
                          onClick={() => selectPerson(index)}
                        >
                          <span className="office-name">{person.name}</span>
                          <span className={office ? 'person-office' : 'person-office is-unknown'}>
                            {person.officeId || 'No office'}
                            {office ? '' : ' · unknown'}
                          </span>
                        </button>
                      </li>
                    )
                  })
                )}
              </ul>
            )}
          </section>
        </div>
      </aside>

      <main className="main">
        {selectedPerson ? (
          <PersonDetail person={selectedPerson} />
        ) : selectedOffice ? (
          <article className="office-detail">
            <p className="detail-kicker">{selectedOffice.municipality}</p>
            <h2>{selectedOffice.name}</h2>
            <p className="detail-id">{selectedOffice.id}</p>
            <span className="level detail-level" data-level={selectedOffice.level}>
              Level {selectedOffice.level}
            </span>

            <section className="detail-section">
              <h3>Address</h3>
              <p className="address">{formatAddress(selectedOffice.address)}</p>
            </section>

            <section className="detail-section">
              <h3>Opening hours</h3>
              <table className="hours">
                <tbody>
                  {selectedOffice.openingHours.map((entry) => (
                    <tr key={entry.day}>
                      <th scope="row">{formatDay(entry.day)}</th>
                      <td className={entry.slots.length === 0 ? 'is-closed' : undefined}>
                        {formatSlots(entry.slots)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="detail-section">
              <h3>People</h3>
              {assigned.length === 0 ? (
                <p className="assigned-empty">No people are assigned.</p>
              ) : (
                <ul className="assigned-people">
                  {assigned.map(({ person, index }) => (
                    <li key={`${person.name}-${index}`}>
                      <button type="button" onClick={() => selectPerson(index)}>
                        {person.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </article>
        ) : (
          <div className="empty">
            <h2>Select an office or a person</h2>
            <p>Choose a post office or a person from the list to see their details.</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
