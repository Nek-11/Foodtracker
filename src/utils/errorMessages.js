/**
 * Convert raw API / network errors into friendly, actionable messages.
 */
export function friendlyError(err) {
  // No API key configured
  if (err?.name === 'NoApiKeyError') {
    return 'No API key set — go to Settings to add a Claude or OpenAI key, then tap Retry.'
  }

  const msg = (err?.message || String(err)).toLowerCase()

  if (err instanceof TypeError || msg.includes('failed to fetch') || msg.includes('network')) {
    return 'No network connection — check your internet and try again.'
  }
  if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('api key') || msg.includes('incorrect api key')) {
    return 'Invalid API key — double-check the key you entered in Settings.'
  }
  if (msg.includes('403') || msg.includes('forbidden')) {
    return "API key doesn't have permission for this request — check your account plan."
  }
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('quota')) {
    return 'Rate limit reached — wait a moment, then try again.'
  }
  if (msg.includes('400') || msg.includes('bad request')) {
    return 'The image may be too large or in an unsupported format. Try a different photo.'
  }
  if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('overloaded')) {
    return 'The AI service is temporarily unavailable — try again in a minute.'
  }
  if (msg.includes('json') || msg.includes('unexpected response') || msg.includes('format')) {
    return 'AI returned an unreadable response. Add a text description and try again.'
  }
  if (msg.includes('context length') || msg.includes('too long') || msg.includes('max token')) {
    return 'The meal description is too long. Shorten your note and try again.'
  }

  return err?.message || 'Something went wrong — please try again.'
}
