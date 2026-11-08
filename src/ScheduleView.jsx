import { useEffect, useRef, useState } from 'react'
import {
  WEEK_DAYS,
  addAssignment,
  listAssignments,
  minutesToTime,
  personHasOverlap,
  rangeFitsWindow,
  openIntervals,
  removeAssignment,
  resolveShifts,
  resolveWindow,
  shiftsForDay,
  slotKey,
  timeToMinutes,
} from './schedule.js'

const HOUR_HEIGHT = 56

const COLORS = [
  ['#1e3a5c', '#8eb6de', '#e7f2fc'],
  ['#1c4538', '#8dcebb', '#e5f7f1'],
  ['#4a3816', '#e2c07a', '#fbf4e4'],
  ['#4a2c40', '#e0a8c8', '#fbeff5'],
  ['#2e4020', '#b7ce86', '#f3f8e8'],
  ['#3a3054', '#c2b0e0', '#f4f0fb'],
  ['#4a2e2a', '#e2aea4', '#fbeeed'],
  ['#1d3e4a', '#8ec8d8', '#e8f6fa'],
]

function labelDay(day) {
  return day.charAt(0).toUpperCase() + day.slice(1)
}

function peopleForOffice(people, officeId) {
  const needle = officeId.toLowerCase()
  return people.filter((person) => person.officeId.trim().toLowerCase() === needle)
}

function colorFor(name) {
  let hash = 0
  for (const char of name) hash = (hash * 33 + char.charCodeAt(0)) >>> 0
  return COLORS[hash % COLORS.length]
}

function gridBounds(office, dayHours, blocks) {
  let start = 8 * 60
  let end = office?.openAfternoon ? 20 * 60 : 15 * 60
  if (!office) return { start, end }
  for (const day of WEEK_DAYS) {
    const openWindow = resolveWindow(office, day, dayHours)
    if (!openWindow) continue
    const from = timeToMinutes(openWindow.from)
    const to = timeToMinutes(openWindow.to)
    if (from == null || to == null) continue
    start = Math.min(start, Math.floor(from / 60) * 60)
    end = Math.max(end, Math.ceil(to / 60) * 60)
  }
  for (const block of blocks) {
    start = Math.min(start, Math.floor(block.start / 60) * 60)
    end = Math.max(end, Math.ceil(block.end / 60) * 60)
  }
  if (end <= start) end = start + 60
  return { start, end }
}

function topFor(minutes, gridStart) {
  return ((minutes - gridStart) / 60) * HOUR_HEIGHT
}

function placeBlocks(blocks) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end)
  let cluster = []
  let clusterEnd = -1

  function flush() {
    const colEnds = []
    for (const block of cluster) {
      let col = 0
      while ((colEnds[col] ?? -1) > block.start) col += 1
      colEnds[col] = block.end
      block.col = col
    }
    const cols = Math.max(colEnds.length, 1)
    for (const block of cluster) block.cols = cols
    cluster = []
  }

  for (const block of sorted) {
    if (cluster.length > 0 && block.start >= clusterEnd) flush()
    cluster.push(block)
    clusterEnd = Math.max(clusterEnd, block.end)
  }
  flush()
  return sorted
}

export function ScheduleView({ offices, people, assignments, onAssignmentsChange, dayHours, onDayHoursChange }) {
  return (
    <main className="schedule">
      <div className="schedule-stack">
        {offices.map((office) => (
          <section key={office.id} className="schedule-office-block">
            <p className="detail-kicker">{office.municipality}</p>
            <h2>{office.name}</h2>
            <OfficeCalendar
              office={office}
              people={people}
              assignments={assignments}
              onAssignmentsChange={onAssignmentsChange}
              dayHours={dayHours}
              onDayHoursChange={onDayHoursChange}
            />
          </section>
        ))}
      </div>
    </main>
  )
}

export function OfficeCalendar({ office, people, assignments, onAssignmentsChange, dayHours, onDayHoursChange }) {
  const startInput = useRef(null)
  const openingStart = useRef(null)
  const [draft, setDraft] = useState(null)
  const [hoursDraft, setHoursDraft] = useState(null)
  const roster = peopleForOffice(people, office.id)
  const officeAssignments = office ? (assignments[office.id] ?? {}) : {}
  const blocks = listAssignments(officeAssignments)
  const { start: gridStart, end: gridEnd } = gridBounds(office, dayHours, blocks)
  const hourCount = (gridEnd - gridStart) / 60
  const gridHeight = hourCount * HOUR_HEIGHT
  const focusKey = draft
    ? `person|${draft.day}|${draft.original?.key ?? ''}|${draft.original?.name ?? ''}`
    : hoursDraft
      ? `open|${hoursDraft.day}`
      : ''

  useEffect(() => {
    if (draft) startInput.current?.focus()
    else if (hoursDraft) openingStart.current?.focus()
  }, [focusKey, draft, hoursDraft])

  useEffect(() => {
    if (!draft && !hoursDraft) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setDraft(null)
        setHoursDraft(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [draft, hoursDraft])

  function openAdd(day) {
    if (!office || !resolveWindow(office, day, dayHours)) return
    setHoursDraft(null)
    setDraft({ day, from: '', to: '', name: '', original: null })
  }

  function openDayHours(day) {
    if (!office) return
    const shifts = resolveShifts(office, day, dayHours)
    const closed = Boolean(dayHours?.[office.id]?.[day]?.closed) || shifts.every((shift) => !shift.enabled)
    setDraft(null)
    setHoursDraft({ day, closed, shifts })
  }

  function updateShift(id, patch) {
    setHoursDraft((current) => {
      if (!current) return current
      return {
        ...current,
        shifts: current.shifts.map((shift) => (shift.id === id ? { ...shift, ...patch } : shift)),
      }
    })
  }

  function openEdit(block) {
    setDraft({
      day: block.day,
      from: block.from,
      to: block.to,
      name: block.name,
      original: { key: block.key, name: block.name },
    })
  }

  function saveHours(event) {
    event.preventDefault()
    if (!office || !draft?.name) return
    if (!rangeFitsWindow(office, draft.day, draft.from, draft.to, dayHours)) return
    if (personHasOverlap(officeAssignments, draft.day, draft.from, draft.to, draft.name, draft.original)) return
    let next = assignments
    if (draft.original) next = removeAssignment(next, office.id, draft.original.key, draft.original.name)
    next = addAssignment(next, office.id, slotKey(draft.day, draft.from, draft.to), draft.name)
    onAssignmentsChange(next)
    setDraft(null)
  }

  function removeHours() {
    if (!office || !draft?.original) return
    onAssignmentsChange(removeAssignment(assignments, office.id, draft.original.key, draft.original.name))
    setDraft(null)
  }

  function saveDayHours(event) {
    event.preventDefault()
    if (!office || !hoursDraft || !hoursRangeOk) return
    const shifts = Object.fromEntries(
      hoursDraft.shifts.map((shift) => [
        shift.id,
        { enabled: shift.enabled, from: shift.from, to: shift.to },
      ]),
    )
    onDayHoursChange({
      ...dayHours,
      [office.id]: {
        ...dayHours[office.id],
        [hoursDraft.day]: {
          closed: hoursDraft.closed || hoursDraft.shifts.every((shift) => !shift.enabled),
          shifts,
        },
      },
    })
    setHoursDraft(null)
  }

  const draftWindow = office && draft ? resolveWindow(office, draft.day, dayHours) : null
  const draftFits = Boolean(office && draft && rangeFitsWindow(office, draft.day, draft.from, draft.to, dayHours))
  const enabledShifts = hoursDraft?.shifts.filter((shift) => shift.enabled) ?? []
  const hoursRangeOk =
    Boolean(hoursDraft?.closed) ||
    (enabledShifts.length > 0 &&
      enabledShifts.every((shift) => {
        const start = timeToMinutes(shift.from)
        const end = timeToMinutes(shift.to)
        return start != null && end != null && end > start
      }))
  const draftOverlap = Boolean(
    draft?.name &&
      personHasOverlap(officeAssignments, draft.day, draft.from, draft.to, draft.name, draft.original),
  )

  return (
    <div className="office-calendar">
      <p className="schedule-shifts">
        Mattina 08:00–14:10
        {office.openAfternoon ? ' · Pomeriggio 13:30–19:40' : ' · Afternoon closed'}
        {office.openSaturday ? ' · Sabato 08:00–13:10' : ' · Saturday closed'}
      </p>
      <div className="cal-scroll">
          <div className="cal">
            <div className="cal-gutter cal-gutter-head" />
            {WEEK_DAYS.map((day) => {
              const dayShifts = shiftsForDay(office, day, dayHours)
              const isCurrent = draft?.day === day || hoursDraft?.day === day
              const className = isCurrent ? 'cal-dayhead is-current' : 'cal-dayhead'
              return (
                <button
                  key={day}
                  type="button"
                  className={className}
                  aria-label={`Opening hours for ${labelDay(day)}`}
                  onClick={() => openDayHours(day)}
                >
                  <span className="cal-dayname">{labelDay(day)}</span>
                  <span className={dayShifts.length > 0 ? 'cal-daysub' : 'cal-daysub is-closed'}>
                    {dayShifts.length > 0
                      ? dayShifts.map((shift) => (
                          <span key={shift.id}>
                            {shift.from}–{shift.to}
                          </span>
                        ))
                      : 'Closed'}
                  </span>
                </button>
              )
            })}
            <div className="cal-gutter" style={{ height: gridHeight }}>
              {Array.from({ length: hourCount }, (_, index) => (
                <span
                  key={index}
                  className="cal-timelabel"
                  style={{ top: index === 0 ? 2 : index * HOUR_HEIGHT }}
                >
                  {minutesToTime(gridStart + index * 60)}
                </span>
              ))}
            </div>
            {WEEK_DAYS.map((day) => {
              const openWindow = resolveWindow(office, day, dayHours)
              const dayBlocks = placeBlocks(blocks.filter((block) => block.day === day))
              const intervals = openIntervals(office, day, dayHours)
              const unavailable = []
              let cursor = gridStart
              for (const [start, end] of intervals) {
                const from = Math.max(start, gridStart)
                const to = Math.min(end, gridEnd)
                if (from > cursor) {
                  unavailable.push({ top: topFor(cursor, gridStart), height: topFor(from, gridStart) - topFor(cursor, gridStart) })
                }
                cursor = Math.max(cursor, to)
              }
              if (cursor < gridEnd) {
                unavailable.push({
                  top: topFor(cursor, gridStart),
                  height: gridHeight - topFor(cursor, gridStart),
                })
              }
              return (
                <div
                  key={day}
                  className={openWindow ? 'cal-col' : 'cal-col is-closed'}
                  style={{ height: gridHeight }}
                  onClick={openWindow ? () => openAdd(day) : undefined}
                >
                  {Array.from({ length: hourCount }, (_, index) => (
                    <div key={index}>
                      <div className="cal-hour-line" style={{ top: index * HOUR_HEIGHT }} />
                      <div className="cal-half-line" style={{ top: index * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
                    </div>
                  ))}
                  {shiftsForDay(office, day, dayHours).map((shift) => (
                    <div
                      key={shift.id}
                      className={`cal-band cal-band-${shift.id}`}
                      style={{
                        top: topFor(timeToMinutes(shift.from), gridStart),
                        height:
                          topFor(timeToMinutes(shift.to), gridStart) - topFor(timeToMinutes(shift.from), gridStart),
                      }}
                    />
                  ))}
                  {unavailable.map((region) => (
                    <div key={`${region.top}`} className="cal-unavailable" style={region} />
                  ))}
                  {!openWindow && <p className="cal-closed-label">Closed</p>}
                  {dayBlocks.map((block) => {
                    const [background, border, text] = colorFor(block.name)
                    const height = Math.max(topFor(block.end, gridStart) - topFor(block.start, gridStart), 22)
                    return (
                      <button
                        key={`${block.key}-${block.name}`}
                        type="button"
                        className="cal-block"
                        style={{
                          top: topFor(block.start, gridStart),
                          height,
                          left: `calc(4px + ${block.col} * (100% - 8px) / ${block.cols})`,
                          width: `calc((100% - 8px) / ${block.cols} - 4px)`,
                          background,
                          borderColor: border,
                          color: text,
                        }}
                        aria-label={`Edit ${block.name}, ${block.from} to ${block.to}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          openEdit(block)
                        }}
                      >
                        <span className="cal-block-name">{block.name}</span>
                        {height >= 38 && (
                          <span className="cal-block-time">
                            {block.from}–{block.to}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      {!draft && !hoursDraft && (
        <p className="schedule-hint">
          Click a day name to change opening hours. Click the calendar to add a person.
        </p>
      )}

      {draft && office && (
        <div className="modal-backdrop" onClick={() => setDraft(null)}>
          <form
            className="hours-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${office.id}-hours-title`}
            onClick={(event) => event.stopPropagation()}
            onSubmit={saveHours}
          >
            <h2 id={`${office.id}-hours-title`}>{draft.original ? 'Change hours' : 'Add hours'}</h2>
            <p className="hours-day">{labelDay(draft.day)}</p>
            {draftWindow && (
              <p className="shift-note">
                Choose a shift, or set the start and end. Hours stay inside {draftWindow.from}–{draftWindow.to}.
              </p>
            )}
            <div className="shift-presets">
              {shiftsForDay(office, draft.day, dayHours).map((shift) => {
                const selected = draft.from === shift.from && draft.to === shift.to
                return (
                  <button
                    key={shift.id}
                    type="button"
                    className={selected ? 'shift-preset is-current' : 'shift-preset'}
                    aria-pressed={selected}
                    onClick={() => setDraft({ ...draft, from: shift.from, to: shift.to })}
                  >
                    {shift.label} {shift.from}–{shift.to}
                  </button>
                )
              })}
            </div>
            <div className="hours-times">
              <label>
                Start
                <input
                  ref={startInput}
                  type="time"
                  step={600}
                  value={draft.from}
                  onChange={(event) => setDraft({ ...draft, from: event.target.value.slice(0, 5) })}
                  required
                />
              </label>
              <label>
                End
                <input
                  type="time"
                  step={600}
                  value={draft.to}
                  onChange={(event) => setDraft({ ...draft, to: event.target.value.slice(0, 5) })}
                  required
                />
              </label>
            </div>
            {roster.length === 0 ? (
              <p className="shift-note">No people are assigned to this office.</p>
            ) : (
              <label>
                Person
                <select
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  required
                >
                  <option value="">Choose</option>
                  {roster.map((person) => (
                    <option key={person.name} value={person.name}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!draftFits && draft.from && draft.to && draftWindow && (
              <p className="load-error">Hours have to stay inside {draftWindow.from}–{draftWindow.to}.</p>
            )}
            {draftFits && draftOverlap && (
              <p className="load-error">{draft.name} already has hours in that range.</p>
            )}
            <div className="hours-actions">
              {draft.original && (
                <button type="button" className="choose-button hours-remove" onClick={removeHours}>
                  Remove
                </button>
              )}
              <button type="button" className="choose-button" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button type="submit" className="choose-button" disabled={!draft.name || !draftFits || draftOverlap}>
                {draft.original ? 'Save' : 'Add'}
              </button>
            </div>
          </form>
        </div>
      )}

      {hoursDraft && office && (
        <div className="modal-backdrop" onClick={() => setHoursDraft(null)}>
          <form
            className="hours-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${office.id}-opening-title`}
            onClick={(event) => event.stopPropagation()}
            onSubmit={saveDayHours}
          >
            <h2 id={`${office.id}-opening-title`}>Opening hours</h2>
            <p className="hours-day">{labelDay(hoursDraft.day)}</p>
            <p className="shift-note">
              Change a shift’s hours, or turn one shift off. People can only be scheduled inside the shifts that stay on.
            </p>
            <label className="hours-closed">
              <input
                type="checkbox"
                checked={hoursDraft.closed}
                onChange={(event) => setHoursDraft({ ...hoursDraft, closed: event.target.checked })}
              />
              Closed for the day
            </label>
            {hoursDraft.shifts.map((shift, index) => (
              <div key={shift.id} className="shift-row">
                <label className="hours-closed">
                  <input
                    type="checkbox"
                    checked={shift.enabled}
                    disabled={hoursDraft.closed}
                    onChange={(event) => updateShift(shift.id, { enabled: event.target.checked })}
                  />
                  {shift.label}
                </label>
                <div className="hours-times">
                  <label>
                    Start
                    <input
                      ref={index === 0 ? openingStart : undefined}
                      type="time"
                      step={600}
                      value={shift.from}
                      disabled={hoursDraft.closed || !shift.enabled}
                      onChange={(event) => updateShift(shift.id, { from: event.target.value.slice(0, 5) })}
                    />
                  </label>
                  <label>
                    End
                    <input
                      type="time"
                      step={600}
                      value={shift.to}
                      disabled={hoursDraft.closed || !shift.enabled}
                      onChange={(event) => updateShift(shift.id, { to: event.target.value.slice(0, 5) })}
                    />
                  </label>
                </div>
              </div>
            ))}
            {!hoursDraft.closed && enabledShifts.length === 0 && (
              <p className="load-error">Turn on a shift, or close the day.</p>
            )}
            {!hoursDraft.closed && enabledShifts.length > 0 && !hoursRangeOk && (
              <p className="load-error">Each open shift needs an end after the start.</p>
            )}
            <div className="hours-actions">
              <button type="button" className="choose-button" onClick={() => setHoursDraft(null)}>
                Cancel
              </button>
              <button type="submit" className="choose-button" disabled={!hoursRangeOk}>
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
