import { useState } from 'react'
import offices from './data/uffici.json'
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

function App() {
  const [selectedId, setSelectedId] = useState(null)
  const [officesOpen, setOfficesOpen] = useState(true)
  const selected = offices.find((office) => office.id === selectedId) ?? null

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="menu">
          <button
            type="button"
            className="menu-toggle"
            aria-expanded={officesOpen}
            aria-controls="office-list"
            onClick={() => setOfficesOpen((open) => !open)}
          >
            <span>Offices</span>
            <span className="menu-count">{offices.length}</span>
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
          </button>
          {officesOpen && (
            <ul className="office-list" id="office-list">
              {offices.map((office) => {
                const isSelected = office.id === selectedId
                return (
                  <li key={office.id}>
                    <button
                      type="button"
                      className={isSelected ? 'office-item is-selected' : 'office-item'}
                      aria-current={isSelected ? 'true' : undefined}
                      onClick={() => setSelectedId(office.id)}
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
        </div>
      </aside>

      <main className="main">
        {selected ? (
          <article className="office-detail">
            <p className="detail-kicker">{selected.municipality}</p>
            <h2>{selected.name}</h2>
            <p className="detail-id">{selected.id}</p>
            <span className="level detail-level" data-level={selected.level}>
              Level {selected.level}
            </span>

            <section className="detail-section">
              <h3>Address</h3>
              <p className="address">{formatAddress(selected.address)}</p>
            </section>

            <section className="detail-section">
              <h3>Opening hours</h3>
              <table className="hours">
                <tbody>
                  {selected.openingHours.map((entry) => (
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
          </article>
        ) : (
          <div className="empty">
            <h2>Select an office</h2>
            <p>Choose a post office from the list to see its address and opening hours.</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
