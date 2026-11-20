import type { Context, Plugin, PluginInitParams, PublicAPI, Query, QueryResponse, Result } from "@wox-launcher/wox-plugin"
import { COPY_ICON, NOCO_ICON } from "./icons.js"
import { buildRecordUrl, NocoDBClient, NocoRecord, parseTables, TableConfig } from "./nocodb.js"

const icon = { ImageType: "svg" as const, ImageData: NOCO_ICON }

class NocoDBPlugin implements Plugin {
  private api!: PublicAPI
  private activeRequest?: AbortController

  async init(_ctx: Context, initParams: PluginInitParams): Promise<void> {
    this.api = initParams.API
  }

  // Runs one cancellable federated query and turns NocoDB rows into native Wox results.
  async query(ctx: Context, query: Query): Promise<QueryResponse> {
    this.activeRequest?.abort()
    const request = new AbortController()
    this.activeRequest = request

    try {
      const [baseUrl, apiToken, tablesValue, limitValue, scoreValue] = await Promise.all([
        this.api.GetSetting(ctx, "baseUrl"),
        this.api.GetSetting(ctx, "apiToken"),
        this.api.GetSetting(ctx, "tables"),
        this.api.GetSetting(ctx, "resultLimit"),
        this.api.GetSetting(ctx, "resultScore")
      ])
      const tables = parseTables(tablesValue)
      const limit = Math.min(100, Math.max(1, Number.parseInt(limitValue, 10) || 20))
      const score = Number.parseInt(scoreValue, 10) || 1000
      const hits = await new NocoDBClient(baseUrl, apiToken).search(tables, query.Search.trim(), limit, request.signal)
      return {
        Results: await Promise.all(hits.map((hit) => this.toResult(ctx, baseUrl, hit.table, hit.record, score))),
        Layout: { ResultPreviewWidthRatio: 0.48 }
      }
    } catch (error) {
      if (request.signal.aborted) {
        return { Results: [] }
      }
      const message = error instanceof SyntaxError ? await this.api.GetTranslation(ctx, "invalid_config") : await this.api.GetTranslation(ctx, "request_failed")
      await this.api.Log(ctx, "Error", `${message}: ${error instanceof Error ? error.message : String(error)}`)
      return { Results: [{ Title: message, SubTitle: error instanceof Error ? error.message : String(error), Icon: icon }] }
    } finally {
      if (this.activeRequest === request) {
        this.activeRequest = undefined
      }
    }
  }

  private async toResult(ctx: Context, baseUrl: string, table: TableConfig, record: NocoRecord, score: number): Promise<Result> {
    const title = String(record[table.titleField] ?? record.Id ?? "Untitled")
    const details = Object.entries(record)
      .filter(([key, value]) => key !== table.titleField && value !== null && value !== "")
      .slice(0, 8)
    const recordUrl = buildRecordUrl(baseUrl, table, record)
    const preview = [`# ${escapeMarkdown(title)}`, `**${await this.api.GetTranslation(ctx, "table")}** · ${escapeMarkdown(table.name)}`]
    if (recordUrl) {
      preview.push(`[${recordUrl}](${recordUrl})`)
    }
    preview.push("", ...details.map(([key, value]) => `**${escapeMarkdown(key)}**  \n${escapeMarkdown(formatValue(value))}`))

    return {
      Id: `${table.id}:${String(record.Id ?? title)}`,
      Title: title,
      SubTitle: details.slice(0, 2).map(([key, value]) => `${key}: ${formatValue(value)}`).join(" · "),
      Icon: table.color ? { ImageType: "svg", ImageData: coloredTableIcon(table.color) } : icon,
      Group: table.name,
      ScoreKey: `${table.id}:${String(record.Id ?? title)}`,
      Score: score,
      GroupScore: score,
      Preview: {
        PreviewType: "markdown",
        PreviewData: preview.join("\n"),
        PreviewTags: [{ Label: table.name, Tooltip: await this.api.GetTranslation(ctx, "table") }]
      },
      Actions: [
        {
          Id: "copy-record",
          Name: await this.api.GetTranslation(ctx, "copy_record"),
          Icon: { ImageType: "svg", ImageData: COPY_ICON },
          IsDefault: true,
          Action: async (actionCtx) => {
            await this.api.Copy(actionCtx, { type: "text", text: JSON.stringify(record, null, 2) })
            await this.api.Notify(actionCtx, await this.api.GetTranslation(actionCtx, "copied"))
          }
        }
      ]
    }
  }
}

function formatValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value)
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_[\]<>]/g, "\\$&")
}

function coloredTableIcon(color: string): string {
  const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : "#7c3aed"
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="${safeColor}"/><path d="M12 14h24v20H12zM12 21h24M20 14v20" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg>`
}

export const plugin = new NocoDBPlugin()
