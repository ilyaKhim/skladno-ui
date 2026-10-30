import { createServer } from 'node:http'

/** A loopback-only provider fixture keeps browser tests on the real worker without paid calls. */
export async function startAiFixture() {
  const server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json')
    response.setHeader('Cache-Control', 'no-store')
    if (request.method !== 'POST' || request.url !== '/v1/responses') {
      response.writeHead(404).end('{}')
      return
    }
    try {
      let size = 0
      const chunks = []
      for await (const chunk of request) {
        size += chunk.length
        if (size > 1024 * 1024) throw new Error('Fixture request is too large')
        chunks.push(chunk)
      }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      const schema = input.text?.format?.schema
      const fieldNames = Object.keys(schema.properties.fields.properties)
      const slideNumbers = schema.properties.slides.items.properties.slide.enum
      const approved = JSON.stringify(input.input).match(/E2E approved (?:PDF|DOCX|TXT) 73/)?.[0]
      const reviewFixture = JSON.stringify(input.input).includes('E2E outline')
      const fields = Object.fromEntries(fieldNames.map((name) => [name, 'Тест']))
      fields.TITLE = approved ?? 'E2E presentation'
      const content = {
        fields,
        slides: slideNumbers.map((slide, index) => ({ slide, include: reviewFixture ? [1, 9, 13].includes(slide) : index === 0, reason: 'E2E fixture' })),
      }
      response.end(JSON.stringify({
        id: 'e2e-local-response',
        status: 'completed',
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(content) }] }],
        usage: { input_tokens: 100, output_tokens: 100, total_tokens: 200 },
      }))
    } catch {
      // Never dump the request: the application also uses this boundary to test audit privacy.
      response.writeHead(400).end(JSON.stringify({ error: { message: 'Invalid fixture request' } }))
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  return {
    url: `http://127.0.0.1:${address.port}/v1/responses`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
      server.closeAllConnections()
    }),
  }
}
