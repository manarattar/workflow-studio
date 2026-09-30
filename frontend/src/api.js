async function errorMessage(response) {
  const body = await response.json().catch(() => ({}))
  const detail = body.detail
  if (detail && typeof detail === 'object') {
    return [detail.message, ...(detail.problems || [])].filter(Boolean).join(' — ')
  }
  return detail || `Request failed (${response.status})`
}

export async function getDatasets() {
  const response = await fetch('/api/datasets')
  if (!response.ok) throw new Error(await errorMessage(response))
  return response.json()
}

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

/** Events: drafting (per attempt), problems (what the validator caught), done | failed. */
export function compileWorkflow(datasetId, description, onEvent) {
  return postStream('/api/compile', { dataset_id: datasetId, description }, onEvent)
}

/** Events: one `item` per finished email/message, then a `summary`. */
export function runWorkflow({ datasetId, workflow, customItem }, onEvent) {
  return postStream(
    '/api/run',
    { dataset_id: datasetId, workflow, custom_item: customItem || null },
    onEvent,
  )
}
