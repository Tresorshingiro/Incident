# Rwanda Incident Console

Report incidents in Rwanda and pin them to a precise, fully-qualified location:
coordinates, matched address, nearest point of interest, and the complete
administrative hierarchy — Province, District, Sector, Cell, Village.

Every auto-filled field stays editable, and the UI shows plainly which values
came from a lookup and which you changed.

## Setup

```bash
npm install
cp .env.example .env      # then fill in the credentials below
npm run dev               # http://localhost:5173
```

Other scripts: `npm test` (Vitest), `npm run build`, `npm run preview`.
Verified against Node 20.20.2.

## Environment variables

| Variable | Purpose |
|---|---|
| `ESRI_USERNAME` | Esri Rwanda portal user. **No `VITE_` prefix.** |
| `ESRI_PASSWORD` | That user's password. **No `VITE_` prefix.** |
| `APP_ORIGIN` | Origin the portal token is bound to. Default `http://localhost:5173`. |

**The missing `VITE_` prefix is deliberate and load-bearing.** Vite only inlines
`VITE_`-prefixed variables into client code, so these credentials never reach
the browser bundle. They are read only by the `/api/arcgis-token` middleware in
`vite.config.ts`, which calls the portal server-side and returns just a
short-lived token. You can prove it after a build:

```bash
npm run build
grep -ri "ESRI_PASSWORD" dist/    # expect no matches
```

Rotate any credentials that have been shared in a chat or ticket.

## Service URLs

All of these live in **`src/config/layers.ts`**. Nothing else in the codebase
hardcodes a service URL, so swapping any of them is a one-file change.

| What | URL | Auth |
|---|---|---|
| Geocoder | `https://esrirw.rw/server/rest/services/Reverse_Geocoding_Version9/GeocodeServer` | **Portal token** |
| Admin boundaries | `https://esrirw.rw/server/rest/services/Hosted/Rwanda_Administrative_Boundaries1/FeatureServer` | Anonymous |
| Token service | `https://esrirw.rw/portal/sharing/rest/generateToken` | Username + password |

Boundary layers: `1` Province, `2` District, `3` Sector, `4` Cell, `5` Village
(2022). Each layer carries its own name field **and every ancestor's**, which is
why one query against layer 5 usually answers all five levels.

### To fill in or change

- **`FUTURE_INCIDENT_LAYER_URL`** — currently points at
  `.../Emergency_Report/FeatureServer/0`, an existing Esri Rwanda point layer
  with Create enabled. `submitIncident()` does not write to it yet; see
  "Going live" below. Replace this if incidents should land somewhere else.
- **`ADMIN_SERVICE_BASE`** and the layer indexes in `ADMIN_LAYERS` — change
  these to point at a different boundary service.
- **`GEOCODE_URL`** — to use the ArcGIS World Geocoding Service instead, set
  this to `https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer`
  and replace the token interceptor in `src/arcgis-config.ts` with an API key.

## How it works

```
config/layers.ts        URLs + field names, no logic
services/token.ts       portal token cache over /api/arcgis-token
   |
services/geocode.ts     the four locator calls, normalised
services/adminLookup.ts point-in-polygon hierarchy resolver (anonymous)
services/poi.ts         nearby-POI search
   |
services/resolveLocation.ts   the funnel: all three in parallel, then merged
   |
state/useIncidentForm         field values + provenance
   |
UI: IncidentMap | SearchBox | IncidentForm
```

### The unified resolve flow

All three ways of setting a location funnel into `resolveLocation(point)`, so
the same fields get filled the same way in every case:

1. **Pin on the map** — click, or drag the marker.
2. **Search** — type a place, pick a candidate.
3. **Suggest** — typeahead (debounced 300 ms, in-flight requests cancelled),
   then the suggestion's `magicKey` is resolved to a point.

`resolveLocation` runs reverse geocode, boundary lookup and POI search
concurrently under `Promise.allSettled` and reports a status per section, so one
failing lookup never blanks the other two.

### Two sources for the hierarchy

Both the locator and the boundary polygons answer the administrative hierarchy.
They are merged per level: the **boundary polygon wins** (it is authoritative
geography and answers for any point in the country), the locator **fills gaps**
(the polygon can be missing at the edges), and a genuine disagreement is
**flagged in the UI** rather than silently resolved. A `disputed` tag shows the
locator's alternative on hover.

This caught a real bug during development: a malformed spatial query was
returning Rubavu for a point in Kigali, and every level flagged as disputed made
it obvious.

### Field provenance

Every location field is `{ value, autoValue, origin }`. A resolve fills fields
you have not touched; a field you edited keeps your value, is visually flagged,
and offers "revert" back to the looked-up value. A later resolve updates
`autoValue` but never overwrites your edit.

## Verified service behaviour

Confirmed live on 2026-09-07. The implementation depends on each of these:

| Behaviour | Consequence in the code |
|---|---|
| The locator returns `province` / `District` / `Sector` / `cell` / `village` — inconsistently cased, with duplicate standard Esri fields | One mapping table, `ADMIN_FIELD_MAP` in `geocode.ts` |
| `countryCode=RWA` returns **0** candidates for a category+location search, and 5 without it | `countryCode` is omitted for proximity searches only |
| The SDK silently drops the `distance` parameter | Sent as a raw query param via `requestOptions.query` |
| `suggest` can return `isCollection: true`, whose `magicKey` resolved to **9** candidates | `findAddressCandidates` always returns an array; the UI shows a picker |
| `geocodeAddresses` returns records **out of order** | Re-sorted by `ResultID` |
| POI candidates carry a server `Distance` in metres | Used directly; haversine only as a fallback |
| A spatial query whose geometry filter fails to apply returns the whole layer | `adminLookup` refuses any result set that is not exactly one feature |

## Developer harness

`/dev` exercises every service call directly — `suggest`,
`findAddressCandidates` (with and without a `magicKey`), `geocodeAddresses`,
`reverseGeocode`, `adminLookup`, `nearbyPOI`, and `resolveLocation`. Each panel
shows the parameters actually sent, the elapsed time, and the normalised
response. Use it first when something looks wrong; it separates a service
problem from a UI problem in one click.

## Basemaps

The app has no ArcGIS Online API key, so the SDK's named basemaps
(`streets-navigation-vector` and friends) would render blank. `src/config/basemaps.ts`
uses keyless services instead: OpenStreetMap, and World Topo / World Imagery
from `services.arcgisonline.com`.

Esri Rwanda also publishes `Hosted/TopographicMap` as a VectorTileServer, which
would be the nicest option, but it currently returns HTTP 500
(`Error creating object to be cached`) with and without a token. Restore it in
that file if it gets fixed server-side.

## Going live

`submitIncident()` in `src/services/incidents.ts` builds the payload and logs
it. It is already shaped for `applyEdits`:

```ts
{ geometry: { x, y, spatialReference: { wkid: 4326 } }, attributes: { ... } }
```

To write real features, replace the `console.info` with an `applyEdits` against
`FUTURE_INCIDENT_LAYER_URL`. The commit path already calls `commitGeocode()`
first — the one and only call in the codebase made with `forStorage: true`.

## Deploying to Vercel

`/api/arcgis-token` exists twice, deliberately, behind one contract:

- **development** — middleware in `vite.config.ts`
- **production** — `api/arcgis-token.ts`, a Vercel serverless function

Both call the same `requestPortalToken()` in `src/server/tokenMiddleware.ts`, so
the client never knows which one answered.

**You must set the environment variables in the Vercel dashboard.** `.env` is
gitignored and is never uploaded, so a deployment without them returns
`{"error":"ESRI_USERNAME and ESRI_PASSWORD must be set..."}` and the app runs
with the locator offline.

Project → Settings → Environment Variables, for Production *and* Preview:

| Name | Value |
|---|---|
| `ESRI_USERNAME` | the portal user |
| `ESRI_PASSWORD` | that user's password |

Do **not** set `APP_ORIGIN` in Vercel. The function derives the token's referer
from the incoming request, so production and every preview URL work without
per-domain configuration; a hardcoded value would break preview deployments.

Redeploy after adding variables — Vercel does not apply them to existing builds.

### If the locator shows offline in production

Open the network tab and look at `/api/arcgis-token`:

| Response | Cause |
|---|---|
| `404` | The function is not deployed. Confirm `api/arcgis-token.ts` and `vercel.json` are committed. |
| `500` with `ESRI_USERNAME ... must be set` | Environment variables missing, or set but not redeployed. |
| `500` with `Invalid username or password` | Wrong credentials, or the portal account is locked. |
| `200` with a token, but geocoding still fails | The portal rejected the referer. Check the deployment origin is reachable and that the account has access to `Reverse_Geocoding_Version9`. |

The administrative hierarchy keeps working in every one of these cases, because
those boundary layers are anonymous. That split — hierarchy fills in, address
and POI do not — is the signature of a token problem rather than a service one.

## Testing

```bash
npm test
```

Covers the debounce and cancellation helper, geocode normalisation and the
constraint rules, `adminLookup`'s fast path / fallback / partial and total
failure, and the `resolveLocation` merge policy. The locator and boundary
services are mocked; use `/dev` for live end-to-end checks.
