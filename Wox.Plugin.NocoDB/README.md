# NocoDB Search for Wox

Search records from several internal NocoDB tables without leaving the Wox launcher. The plugin follows NocoDB's table-first information model: results are grouped by table, each record has a compact field summary, and the preview shows the most useful row fields.

## Setup

1. Open the repository's **Actions** page, select **Build NocoDB plugin**, open the latest successful run, and download the **Wox.Plugin.NocoDB-package** artifact. GitHub wraps action artifacts in a ZIP, so extract it once to get `Wox.Plugin.NocoDB.wox`. Do not download the repository source ZIP: it is not an installable plugin package.
2. Open the extracted `.wox` file with Wox to install it. Developers can build the same package locally with `npm install && make package`.
3. Sign in to Wox Cloud Sync, then open this plugin's settings and set the NocoDB URL and an API token with read access to the desired tables. The NocoDB URL, token, table mapping, result limit, and priority are explicit cross-platform Wox settings, so Wox Cloud Sync carries them to the user's other signed-in devices.
4. Configure **Search tables (JSON)**, for example:

```json
[
  {
    "id": "mxxxxxxxxxxxxxx",
    "name": "People",
    "titleField": "Name",
    "searchFields": ["Name", "Email", "Team"],
    "color": "#7c3aed",
    "urlTemplate": "{baseUrl}/dashboard/#/nc/.../{recordId}"
  },
  {
    "id": "myyyyyyyyyyyyyy",
    "name": "Projects",
    "titleField": "Project",
    "searchFields": ["Project", "Owner", "Status"],
    "color": "#0891b2"
  }
]
```

`urlTemplate` is optional because NocoDB workspace routes vary by version and view. It supports `{baseUrl}`, `{tableId}`, and `{recordId}` placeholders and is exposed as a link in the record preview.

Type the keywords directly in Wox. The plugin uses the global `*` trigger, so no `noco` prefix is required. Its default result priority is `1000`, which puts NocoDB records ahead of ordinary global results; change **Global result priority** in the plugin settings if the surrounding plugin mix needs a different value. An empty search returns the first records from every configured table. Press Enter to copy the selected record as formatted JSON.

## Cloud configuration verification

1. Deploy or select a network-accessible NocoDB instance and create a read-only API token for the configured tables.
2. In Wox **Settings → General**, sign in to Wox Cloud Sync and confirm the sync status is connected.
3. In Wox **Settings → Plugins → NocoDB Search**, configure every field. These settings deliberately use `IsPlatformSpecific: false`; Wox therefore stores them as cloud-syncable plugin settings rather than device-only values.
4. On another Wox device signed into the same account, open the plugin settings and confirm the values arrive. Search for a known record without a prefix and confirm it is shown near the top.

The Wox desktop application itself is not a cloud service and should not be deployed beside NocoDB. “Configure NocoDB and Wox in the cloud” means exposing NocoDB over HTTPS and enabling Wox Cloud Sync for the plugin configuration. Never commit a live NocoDB token or include it in a screenshot.

## Package contents

The downloadable `.wox` archive contains only `plugin.json`, the compiled JavaScript under `dist/`, and this README. It does not require the repository, TypeScript compiler, SDK source, or `node_modules` at installation time. Run `make verify-package` to inspect a local build. The binary archive is deliberately not committed because the pull-request service rejects binary files; GitHub Actions builds it from the reviewed source and publishes it as a downloadable workflow artifact instead.

## Design and security

- Searches all configured tables concurrently through the NocoDB v2 records API.
- Cancels the preceding network request as soon as the query changes.
- Sends the API token only in the `xc-token` header to the configured NocoDB origin.
- Keeps server address, token, table mappings, result limit, and priority cloud-synced as cross-platform account settings.
- Caps a query at 100 records and distributes the requested limit across tables.
- Logs request errors without logging tokens or returned record data.
