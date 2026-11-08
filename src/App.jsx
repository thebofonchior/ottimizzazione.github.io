import { useEffect, useRef, useState } from 'react'
import offices from './data/uffici.json'
import peopleCsv from './data/people.csv?raw'
import { parsePeopleFile } from './parsePeople.js'
import './App.css'

// Temporary for development: the people list always starts from this file.
const developmentPeople = parsePeopleFile(new TextEncoder().encode(peopleCsv), 'people.csv')

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

function groupPeopleByOffice(items) {
  const groups = []
  items.forEach((person, index) => {
    const office = findOffice(person.officeId)
    const id = office?.id ?? (person.officeId.trim() || 'No office')
    const existing = groups.find((group) => group.id === id)
    if (existing) {
      existing.people.push({ person, index })
    } else {
      groups.push({ id, known: Boolean(office), people: [{ person, index }] })
    }
  })

  const order = new Map(offices.map((office, index) => [office.id, index]))
  groups.sort((a, b) => {
    const aIndex = order.get(a.id) ?? Number.POSITIVE_INFINITY
    const bIndex = order.get(b.id) ?? Number.POSITIVE_INFINITY
    if (aIndex !== bIndex) return aIndex - bIndex
    return a.id.localeCompare(b.id)
  })
  return groups
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
  const narrow = useNarrowScreen()
  const [menuOpen, setMenuOpen] = useState(false)
  const [selection, setSelection] = useState(null)
  const [officesOpen, setOfficesOpen] = useState(true)
  const [peopleOpen, setPeopleOpen] = useState(developmentPeople.length > 0)
  const [openPeopleOffice, setOpenPeopleOffice] = useState(null)
  const [people, setPeople] = useState(developmentPeople)
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

  async function loadPeopleFile(file) {
    if (!file) return

    try {
      const nextPeople = parsePeopleFile(await file.arrayBuffer(), file.name)
      setPeople(nextPeople)
      setPeopleOpen(true)
      setOpenPeopleOffice(null)
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
                  groupPeopleByOffice(people).map((group) => {
                    const isOpen = openPeopleOffice === group.id
                    const panelId = `people-${group.id.replaceAll(' ', '-')}`
                    return (
                      <li key={group.id}>
                        <button
                          type="button"
                          className="menu-toggle is-nested"
                          aria-expanded={isOpen}
                          aria-controls={panelId}
                          onClick={() =>
                            setOpenPeopleOffice((current) => (current === group.id ? null : group.id))
                          }
                        >
                          <span className={group.known ? undefined : 'person-office is-unknown'}>
                            {group.id}
                          </span>
                          <span className="menu-count">{group.people.length}</span>
                          <Chevron />
                        </button>
                        {isOpen && (
                          <ul className="office-list" id={panelId}>
                            {group.people.map(({ person, index }) => {
                              const isSelected = selection?.kind === 'person' && selection.index === index
                              return (
                                <li key={`${person.name}-${index}`}>
                                  <button
                                    type="button"
                                    className={isSelected ? 'person-item is-selected' : 'person-item'}
                                    aria-current={isSelected ? 'true' : undefined}
                                    onClick={() => selectPerson(index)}
                                  >
                                    <span className="office-name">{person.name}</span>
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        )}
                      </li>
                    )
                  })
                )}
              </ul>
            )}
          </section>
        </div>
      </aside>

      {people.length === 0 ? (
        <Home onFile={loadPeopleFile} error={loadError} />
      ) : (
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
      )}
    </div>
  )
}

export default App
