import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import pg from 'pg'

// Execute the real SQL against old rows in a new, disposable schema, never the user schema.
const schema = `draft_migration_${randomBytes(6).toString('hex')}`
const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL ?? 'postgresql://godeck:godeck-local-only@127.0.0.1:5433/godeck', connectionTimeoutMillis: 10000 })
await db.connect()
try {
  await db.query(`CREATE SCHEMA "${schema}"`)
  await db.query(`SET search_path TO "${schema}"`)
  const directory = new URL('../backend/src/main/resources/db/migration/', import.meta.url)
  const migrations = (await readdir(directory)).filter((name) => /^V\d+__.*\.sql$/.test(name))
    .sort((a, b) => Number(a.match(/^V(\d+)/)[1]) - Number(b.match(/^V(\d+)/)[1]))
  for (const name of migrations.filter((name) => Number(name.match(/^V(\d+)/)[1]) <= 12))
    await db.query(await readFile(new URL(name, directory), 'utf8'))
  const owner = randomUUID()
  const ids = {}
  for (const status of ['awaiting_review', 'queued', 'running', 'succeeded']) {
    const id = randomUUID()
    ids[status] = id
    await db.query(`INSERT INTO generated_presentations(id,user_id,template_id,topic,status,request_hash,created_at,updated_at,content_json,current_version,review_before_render,outline_revision,outline_confirmed_revision)
      VALUES($1,$2,'opal','migration test',$3,$4,now(),now(),$5,$6,true,1,$7)`,
    [id, owner, status, 'a'.repeat(64), '{"fields":{"TITLE":"Preserved"},"slides":[]}', status === 'succeeded' ? 4 : 1, status === 'awaiting_review' ? null : 1])
  }
  await db.query(`INSERT INTO presentation_revisions(id,presentation_id,user_id,version,message,content_json,output_path,slide_count)
    VALUES($1,$2,$3,4,'published','{}','unchanged.pptx',1)`, [randomUUID(), ids.succeeded, owner])
  await db.query(await readFile(new URL('V13__unpublished_editor_drafts.sql', directory), 'utf8'))
  await db.query(await readFile(new URL('V14__presentation_ai_edits.sql', directory), 'utf8'))
  assert.equal((await db.query('SELECT count(*)::int AS count FROM presentation_ai_edits')).rows[0].count, 0)
  // Old journal rows survive the telemetry migration and stay readable as "not tracked".
  const oldEdit = randomUUID()
  await db.query(`INSERT INTO presentation_ai_edits(id,presentation_id,user_id,kind,request_id,request_hash,action,params_json,target_kind,target_ref,source_length,status,result_json,model,created_at)
    VALUES($1,$2,$3,'TEXT_EDIT',$4,$5,'custom','{"instruction":"old"}','template_field','slide-1/TITLE',3,'unsupported','{"status":"unsupported"}','gpt-5.4-mini',now())`,
  [oldEdit, ids.succeeded, owner, randomUUID(), 'b'.repeat(64)])
  await db.query(await readFile(new URL('V15__presentation_ai_edit_telemetry.sql', directory), 'utf8'))
  const { rows: [oldRow] } = await db.query('SELECT status,result_json,prompt_version,outcome,cleared_at FROM presentation_ai_edits WHERE id=$1', [oldEdit])
  assert.deepEqual(oldRow, { status: 'unsupported', result_json: '{"status":"unsupported"}', prompt_version: null, outcome: null, cleared_at: null })
  await db.query("UPDATE presentation_ai_edits SET status='alternative', outcome='applied', outcome_variant=0 WHERE id=$1", [oldEdit])
  await assert.rejects(db.query("UPDATE presentation_ai_edits SET status='maybe' WHERE id=$1", [oldEdit]), /presentation_ai_edits_status_check/)
  await assert.rejects(db.query("UPDATE presentation_ai_edits SET outcome='maybe' WHERE id=$1", [oldEdit]), /presentation_ai_edits_outcome_check/)
  for (const status of ['awaiting_review', 'queued', 'running']) {
    const { rows: [row] } = await db.query('SELECT status,current_version,content_json FROM generated_presentations WHERE id=$1', [ids[status]])
    assert.equal(row.status, 'draft')
    assert.equal(row.current_version, 0)
    assert.match(row.content_json, /Preserved/)
  }
  const { rows: [published] } = await db.query('SELECT status,current_version FROM generated_presentations WHERE id=$1', [ids.succeeded])
  assert.deepEqual(published, { status: 'succeeded', current_version: 4 })
  assert.equal((await db.query('SELECT count(*)::int AS count FROM presentation_revisions')).rows[0].count, 1)
  console.log('Draft and AI-edit migrations: old prepared jobs preserved; published v4 unchanged; AI journal ready; old journal rows survive telemetry.')
} finally {
  await db.query('RESET search_path')
  await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
  await db.end()
}
