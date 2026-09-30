/**
 * The user's own projects, kept in this browser only (there are no accounts).
 * Storage can be missing or blocked (private windows, strict settings), so
 * every read and write is guarded and the app keeps working without it.
 */
const KEY = 'routing-slip.projects.v1'

export function loadProjects() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function persist(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
    return true
  } catch {
    return false
  }
}

export function saveProject(project) {
  const list = loadProjects()
  const next = { ...project, updated: Date.now() }
  const i = list.findIndex((p) => p.id === project.id)
  if (i >= 0) list[i] = next
  else list.unshift(next)
  persist(list)
  return next
}

export function deleteProject(id) {
  persist(loadProjects().filter((p) => p.id !== id))
}

export function newProjectId() {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/** The definition the API validates and runs: no browser-only fields. */
export const specOf = (p, { withItems = true } = {}) => ({
  name: p.name,
  fields: p.fields,
  outcomes: p.outcomes,
  knowledge: p.knowledge || [],
  items: withItems ? p.items || [] : [],
})

/** A project in the same shape as a sample inbox, so the panels can show either. */
export function asDataset(p) {
  const textFields = Object.entries(p.fields).filter(([, t]) => t === 'text').map(([f]) => f)
  const avgLength = (f) => (p.items || []).reduce((n, it) => n + String(it[f] || '').length, 0)
  const titleField = [...textFields].sort((a, b) => avgLength(b) - avgLength(a))[0]
  return {
    id: p.id,
    custom: true,
    name: p.name,
    fields: p.fields,
    outcomes: p.outcomes,
    knowledge: p.knowledge || [],
    items: (p.items || []).map((it, i) => ({ id: it.id || `item-${i + 1}`, ...it })),
    template: '',
    reference_workflow: p.workflow || null,
    display: { titleField, fromField: textFields.find((f) => f !== titleField) || null },
  }
}

// ---- export / import: one JSON file a consultant can hand to a client ----

export function exportProject(p) {
  const file = { format: 'routing-slip/1', ...p, published: undefined }
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'project'}.routing-slip.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function importProject(file) {
  const data = JSON.parse(await file.text())
  if (data.format !== 'routing-slip/1' || !data.fields || !data.outcomes) {
    throw new Error("This file isn't a Routing Slip project export.")
  }
  const { format, published, ...project } = data // eslint-disable-line no-unused-vars
  return saveProject({ ...project, id: newProjectId(), name: `${project.name}` })
}
