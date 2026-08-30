import assert from "node:assert/strict"
import test from "node:test"
import { buildRecordUrl, buildWhere, NocoDBClient, parseTables } from "../dist/nocodb.js"
import { plugin } from "../dist/index.js"
import { readFile } from "node:fs/promises"

test("parseTables validates and normalizes table settings", () => {
  assert.deepEqual(parseTables('[{"id":"m1","name":"People","titleField":"Name","searchFields":["Name","Email"]}]'), [
    { id: "m1", name: "People", titleField: "Name", searchFields: ["Name", "Email"], color: undefined, urlTemplate: undefined }
  ])
  assert.throws(() => parseTables("[]"), /non-empty array/)
  assert.throws(() => parseTables('[{"id":"m1","name":"People","titleField":"Name","searchFields":["Name)~or(Id,eq,1"]}]'), /unsupported/)
})

test("buildWhere creates an OR expression and escapes values", () => {
  assert.equal(buildWhere("Ada, Inc)", ["Name", "Email"]), "(Name,like,%Ada\\, Inc\\)%)~or(Email,like,%Ada\\, Inc\\)%)")
})

test("NocoDBClient sends an authenticated, encoded v2 records request", async () => {
  let requestedUrl = ""
  let requestedToken = ""
  const fetcher = async (input, init) => {
    requestedUrl = String(input)
    requestedToken = new Headers(init?.headers).get("xc-token") ?? ""
    return new Response(JSON.stringify({ list: [{ Id: 7, Name: "Ada" }] }), { status: 200 })
  }
  const tables = parseTables('[{"id":"m 1","name":"People","titleField":"Name","searchFields":["Name"]}]')
  const hits = await new NocoDBClient("https://noco.example.com/", "secret", fetcher).search(tables, "Ada Lovelace", 10)

  const url = new URL(requestedUrl)
  assert.equal(url.pathname, "/api/v2/tables/m%201/records")
  assert.equal(url.searchParams.get("where"), "(Name,like,%Ada Lovelace%)")
  assert.equal(requestedToken, "secret")
  assert.equal(hits[0]?.record.Name, "Ada")
})

test("buildRecordUrl expands configured placeholders", () => {
  const table = parseTables('[{"id":"m1","name":"People","titleField":"Name","searchFields":["Name"],"urlTemplate":"{baseUrl}/table/{tableId}/{recordId}"}]')[0]
  assert.equal(buildRecordUrl("https://noco.example.com/", table, { Id: 42 }), "https://noco.example.com/table/m1/42")
})

test("plugin is globally activated and exposes cloud-syncable NocoDB settings", async () => {
  const manifest = JSON.parse(await readFile(new URL("../plugin.json", import.meta.url), "utf8"))
  assert.deepEqual(manifest.TriggerKeywords, ["*"])
  assert.deepEqual(
    manifest.SettingDefinitions.map((definition) => definition.Value.Key),
    ["baseUrl", "apiToken", "tables", "resultLimit", "resultScore"]
  )
  assert.ok(manifest.SettingDefinitions.every((definition) => definition.IsPlatformSpecific === false))
  assert.equal(manifest.SettingDefinitions.at(-1).Value.DefaultValue, "1000")
})

test("global results use the configured priority score", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ list: [{ Id: 7, Name: "Ada" }] }), { status: 200 })
  const settings = {
    baseUrl: "https://noco.example.com",
    apiToken: "secret",
    tables: '[{"id":"m1","name":"People","titleField":"Name","searchFields":["Name"]}]',
    resultLimit: "20",
    resultScore: "1500"
  }
  const api = {
    GetSetting: async (_ctx, key) => settings[key],
    GetTranslation: async (_ctx, key) => key,
    Log: async () => undefined
  }

  try {
    await plugin.init({}, { API: api })
    const response = await plugin.query({}, { Search: "Ada" })
    assert.equal(response.Results[0].Title, "Ada")
    assert.equal(response.Results[0].Score, 1500)
    assert.equal(response.Results[0].GroupScore, 1500)
  } finally {
    globalThis.fetch = originalFetch
  }
})
