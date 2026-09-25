import { createHash } from 'node:crypto'
import { DATASETS, type SearchRow } from './model'

export type DayBatch = { rows: SearchRow[]; capped: boolean }
export type SqlClient = {
  query: (sql: string, params?: unknown[]) => Promise<unknown>
  release: () => void
}

export const CLAIM_SQL = `INSERT INTO "SeoSyncState" (property,run_id,locked_until) VALUES ($1,$2,now()+interval '10 minutes')
ON CONFLICT (property) DO UPDATE SET run_id=excluded.run_id,locked_until=excluded.locked_until
WHERE "SeoSyncState".locked_until < now() RETURNING run_id`

export async function saveDay(
  client: SqlClient,
  property: string,
  day: string,
  batches: DayBatch[],
) {
  if (batches.length !== DATASETS.length) {
    client.release()
    throw new Error('Incomplete day')
  }
  try {
    await client.query('BEGIN')
    await client.query(
      `DELETE FROM "SeoSearchDaily" WHERE property=$1 AND day=$2`,
      [property, day],
    )
    for (const [index, batch] of batches.entries()) {
      for (let offset = 0; offset < batch.rows.length; offset += 1000) {
        const chunk = batch.rows.slice(offset, offset + 1000).map((r) => ({
          ...r,
          key: createHash('sha256')
            .update(JSON.stringify([r.query, r.page, r.country, r.device]))
            .digest('hex'),
        }))
        await client.query(
          `INSERT INTO "SeoSearchDaily" (property,day,dataset,key,query,page,country,device,clicks,impressions,position)
          SELECT $1,$2,$3,x.key,x.query,x.page,x.country,x.device,x.clicks,x.impressions,x.position
          FROM jsonb_to_recordset($4::jsonb) AS x(key text,query text,page text,country text,device text,clicks double precision,impressions double precision,position double precision)`,
          [property, day, DATASETS[index], JSON.stringify(chunk)],
        )
      }
      await client.query(
        `INSERT INTO "SeoImportDay" (property,day,dataset,row_count,capped) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (property,day,dataset) DO UPDATE SET row_count=excluded.row_count,capped=excluded.capped,imported_at=now()`,
        [property, day, DATASETS[index], batch.rows.length, batch.capped],
      )
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}
