export interface TableConfig {
  id: string
  name: string
  titleField: string
  searchFields: string[]
  color?: string
  urlTemplate?: string
}

export interface NocoRecord {
  Id?: string | number
  [key: string]: unknown
}

export interface SearchHit {
  table: TableConfig
  record: NocoRecord
}

interface RecordsResponse {
  list?: NocoRecord[]
}

const unsafeFieldCharacters = /[(),~]/

// Parses the user-owned table map at the settings boundary so query code can stay typed.
export function parseTables(value: string): TableConfig[] {
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("tables must be a non-empty array")
  }

  return parsed.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`table ${index + 1} must be an object`)
    }
    const table = item as Partial<TableConfig>
    if (!table.id || !table.name || !table.titleField || !Array.isArray(table.searchFields) || table.searchFields.length === 0) {
      throw new Error(`table ${index + 1} is missing id, name, titleField, or searchFields`)
    }
    if (table.searchFields.some((field) => typeof field !== "string" || unsafeFieldCharacters.test(field))) {
      throw new Error(`table ${index + 1} contains an unsupported field name`)
    }
    return {
      id: table.id,
      name: table.name,
      titleField: table.titleField,
      searchFields: table.searchFields,
      color: table.color,
      urlTemplate: table.urlTemplate
    }
  })
}

// Escapes values embedded in NocoDB's comparison expression before URL encoding.
export function buildWhere(search: string, fields: string[]): string {
  const escaped = search.replaceAll("\\", "\\\\").replaceAll(",", "\\,").replaceAll(")", "\\)")
  return fields.map((field) => `(${field},like,%${escaped}%)`).join("~or")
}

export function buildRecordUrl(baseUrl: string, table: TableConfig, record: NocoRecord): string | undefined {
  if (!table.urlTemplate) {
    return undefined
  }
  return table.urlTemplate
    .replaceAll("{baseUrl}", baseUrl.replace(/\/$/, ""))
    .replaceAll("{tableId}", encodeURIComponent(table.id))
    .replaceAll("{recordId}", encodeURIComponent(String(record.Id ?? "")))
}

export class NocoDBClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  // Searches tables concurrently because each table has an independent records endpoint.
  async search(tables: TableConfig[], search: string, limit: number, signal?: AbortSignal): Promise<SearchHit[]> {
    const perTableLimit = Math.max(1, Math.ceil(limit / tables.length))
    const groups = await Promise.all(
      tables.map(async (table) => {
        const url = new URL(`${this.baseUrl.replace(/\/$/, "")}/api/v2/tables/${encodeURIComponent(table.id)}/records`)
        url.searchParams.set("limit", String(perTableLimit))
        if (search) {
          url.searchParams.set("where", buildWhere(search, table.searchFields))
        }

        const response = await this.fetcher(url, {
          headers: { "xc-token": this.token },
          signal
        })
        if (!response.ok) {
          throw new Error(`${table.name}: HTTP ${response.status}`)
        }
        const payload = (await response.json()) as RecordsResponse
        return (payload.list ?? []).map((record) => ({ table, record }))
      })
    )
    return groups.flat().slice(0, limit)
  }
}
