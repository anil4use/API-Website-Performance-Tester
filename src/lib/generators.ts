import { randomBytes } from 'crypto'

const FIRST_NAMES = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Henry', 'Iris', 'Jack']
const LAST_NAMES = ['Smith', 'Jones', 'Taylor', 'Brown', 'Wilson', 'Davis', 'Clark', 'Lewis', 'Hill', 'Green']
const DOMAINS = ['example.com', 'test.org', 'sample.net', 'demo.io', 'fake.dev']
const WORDS = ['alpha', 'beta', 'gamma', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet']

function rand(n: number): number {
  return Math.floor(Math.random() * n)
}

export const generators: Record<string, () => string> = {
  randomString: () => randomBytes(8).toString('hex'),
  randomEmail: () => {
    const first = FIRST_NAMES[rand(FIRST_NAMES.length)].toLowerCase()
    const last = LAST_NAMES[rand(LAST_NAMES.length)].toLowerCase()
    const domain = DOMAINS[rand(DOMAINS.length)]
    return `${first}.${last}${rand(1000)}@${domain}`
  },
  randomNumber: () => String(rand(1000000)),
  randomInt: () => String(rand(1000000)),
  uuid: () => {
    const bytes = randomBytes(16)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = bytes.toString('hex')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  },
  randomUUID: () => generators.uuid(),
  randomDate: () => {
    const start = new Date(2020, 0, 1).getTime()
    const end = new Date().getTime()
    return new Date(start + Math.random() * (end - start)).toISOString()
  },
  randomName: () => `${FIRST_NAMES[rand(FIRST_NAMES.length)]} ${LAST_NAMES[rand(LAST_NAMES.length)]}`,
  randomFirstName: () => FIRST_NAMES[rand(FIRST_NAMES.length)],
  randomLastName: () => LAST_NAMES[rand(LAST_NAMES.length)],
  randomWord: () => WORDS[rand(WORDS.length)],
  randomPhone: () => `+1${String(rand(9000000000) + 1000000000)}`,
  randomBoolean: () => (Math.random() > 0.5 ? 'true' : 'false'),
  randomFloat: () => (Math.random() * 1000).toFixed(2),
  timestamp: () => String(Date.now()),
}

export function applyGenerators(text: string): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const gen = generators[key]
    return gen ? gen() : match
  })
}

export function generateRandomJson(): string {
  return JSON.stringify({
    id: generators.uuid(),
    name: generators.randomName(),
    email: generators.randomEmail(),
    age: rand(80) + 18,
    active: Math.random() > 0.5,
    createdAt: generators.randomDate(),
    score: parseFloat(generators.randomFloat()),
  }, null, 2)
}

export function getAvailableGenerators(): { variable: string; description: string; example: string }[] {
  return [
    { variable: '{{randomString}}', description: 'Random 16-char hex string', example: 'a3f9b12c4d8e7f01' },
    { variable: '{{randomEmail}}', description: 'Random email address', example: 'alice.smith42@example.com' },
    { variable: '{{randomNumber}}', description: 'Random integer 0–999999', example: '482931' },
    { variable: '{{uuid}}', description: 'Random UUID v4', example: '550e8400-e29b-41d4-a716-446655440000' },
    { variable: '{{randomUUID}}', description: 'Random UUID v4 (alias)', example: '550e8400-...' },
    { variable: '{{randomDate}}', description: 'Random ISO date string', example: '2023-07-15T14:22:31.000Z' },
    { variable: '{{randomName}}', description: 'Random full name', example: 'Alice Smith' },
    { variable: '{{randomFirstName}}', description: 'Random first name', example: 'Alice' },
    { variable: '{{randomLastName}}', description: 'Random last name', example: 'Smith' },
    { variable: '{{randomPhone}}', description: 'Random US phone number', example: '+11234567890' },
    { variable: '{{randomBoolean}}', description: 'Random true/false', example: 'true' },
    { variable: '{{randomFloat}}', description: 'Random decimal 0–1000', example: '384.71' },
    { variable: '{{timestamp}}', description: 'Current Unix timestamp (ms)', example: '1720000000000' },
    { variable: '{{randomWord}}', description: 'Random word', example: 'alpha' },
  ]
}
