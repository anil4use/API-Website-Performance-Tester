import { MongoClient, Db, Collection, ObjectId } from 'mongodb'
import type { HistoryDetail, TestReport, TestType, TestStatus } from './types'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017'
const DB_NAME = process.env.MONGODB_DB || 'api_perf_tester'

let client: MongoClient | null = null
let db: Db | null = null

async function getDb(): Promise<Db> {
  if (db) return db
  client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
  await client.connect()
  db = client.db(DB_NAME)
  await ensureIndexes(db)
  return db
}

async function ensureIndexes(database: Db): Promise<void> {
  const col = database.collection('test_history')
  await col.createIndex({ started_at: -1 })
  await col.createIndex({ test_type: 1 })
  await col.createIndex({ target: 1 })
}

function getCollection(database: Db): Collection {
  return database.collection('test_history')
}

export async function saveTestResult(report: TestReport): Promise<void> {
  const database = await getDb()
  const col = getCollection(database)
  const metrics = report.metrics

  const doc = {
    _id: report.id,
    test_name: report.testName,
    target: report.target,
    test_type: report.testType,
    started_at: report.startedAt,
    completed_at: report.completedAt,
    duration: report.duration,
    total_requests: metrics.totalRequests,
    success_rate: metrics.totalRequests > 0
      ? (metrics.successfulRequests / metrics.totalRequests) * 100
      : 0,
    p95: metrics.p95,
    p99: metrics.p99,
    error_rate: metrics.errorRate,
    requests_per_second: metrics.requestsPerSecond,
    status: 'completed',
    config_snapshot: JSON.stringify(report.config),
    report_snapshot: JSON.stringify(report),
    created_at: Date.now(),
  }

  await col.replaceOne({ _id: report.id }, doc, { upsert: true })
}

export async function getHistory(limit = 50, offset = 0): Promise<HistoryDetail[]> {
  const database = await getDb()
  const col = getCollection(database)

  const rows = await col
    .find({})
    .sort({ started_at: -1 })
    .skip(offset)
    .limit(limit)
    .toArray()

  return rows.map(rowToHistory)
}

export async function getHistoryEntry(id: string): Promise<HistoryDetail | null> {
  const database = await getDb()
  const col = getCollection(database)
  const row = await col.findOne({ _id: id })
  return row ? rowToHistory(row) : null
}

export async function deleteHistoryEntry(id: string): Promise<boolean> {
  const database = await getDb()
  const col = getCollection(database)
  const result = await col.deleteOne({ _id: id })
  return result.deletedCount > 0
}

export async function getHistoryCount(): Promise<number> {
  const database = await getDb()
  return getCollection(database).countDocuments()
}

function rowToHistory(row: any): HistoryDetail {
  return {
    id: row._id,
    testName: row.test_name,
    target: row.target,
    testType: row.test_type as TestType,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    duration: row.duration,
    totalRequests: row.total_requests,
    successRate: row.success_rate,
    p95: row.p95,
    p99: row.p99,
    errorRate: row.error_rate,
    requestsPerSecond: row.requests_per_second,
    status: row.status as TestStatus,
    configSnapshot: row.config_snapshot,
    reportSnapshot: row.report_snapshot,
  }
}
