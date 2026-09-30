async function errorMessage(response) {
  const body = await response.json().catch(() => ({}))
  const detail = body.detail
  if (detail && typeof detail === 'object') {
    return [detail.message, ...(detail.problems || [])].filter(Boolean).join(' — ')
  }
  return detail || `Request failed (${response.status})`
}

async function request(url, { method = 'GET', body, key } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (key) headers['X-Routing-Key'] = key
  // API data changes per request (new inboxes, recent calls), so never serve it from a cache
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(await errorMessage(response))
  return response.json()
}

/** Which inbox a call is about: a sample ({datasetId}) or the user's own project ({project}). */
const target = (source) =>
  source.project ? { project: source.project } : { dataset_id: source.datasetId }

/**
 * SSE over POST: EventSource is GET-only, so the stream is read by hand and
 * onEvent is called for every `data:` message as it arrives.
 */
async function postStream(url, body, onEvent) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(await errorMessage(response))

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop()
    for (const chunk of chunks) {
      if (chunk.startsWith('data: ')) onEvent(JSON.parse(chunk.slice(6)))
    }
  }
}

export const getDatasets = () => request('/api/datasets')

/** Events: drafting (per attempt), problems (what the validator caught), done | failed. */
export const compileWorkflow = (source, description, onEvent) =>
  postStream('/api/compile', { ...target(source), description }, onEvent)

/** Events: one `item` per finished item, then a `summary`. */
export const runWorkflow = (source, workflow, customItem, onEvent) =>
  postStream('/api/run', { ...target(source), workflow, custom_item: customItem || null }, onEvent)

/** Problems with an edited workflow (empty list when it's valid). Throws if the project itself is invalid. */
export const validateWorkflow = (source, workflow) =>
  request('/api/validate', { method: 'POST', body: { ...target(source), workflow } })

export const publishProject = (project, workflow) =>
  request('/api/projects', { method: 'POST', body: { project, workflow } })

export const updatePublished = (published, project, workflow) =>
  request(`/api/projects/${published.id}`, { method: 'PUT', body: { project, workflow }, key: published.api_key })

export const unpublishProject = (published) =>
  request(`/api/projects/${published.id}`, { method: 'DELETE', key: published.api_key })

export const recentRuns = (published) =>
  request(`/api/projects/${published.id}/runs`, { key: published.api_key })
