import https from 'https'

const BASE = process.env.FFA_API_URL ?? 'https://ffa-api.avaloncreativeltd.com'

// Node.js 24 built-in fetch (undici) fails TLS verification on this server's cert.
// The native https module handles it correctly — used for ALL external API calls.
function httpsReq(url: string, method: string, body?: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const headers: Record<string, string | number> = body
      ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      : {}
    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method, rejectUnauthorized: false, headers },
      (res) => {
        let data = ''; res.on('data', c => { data += c }); res.on('end', () => resolve({ status: res.statusCode ?? 0, text: data }))
      }
    )
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}
// Keep backwards-compatible alias used by ffaItemLookup below
const httpsPost = (url: string, body: string) => httpsReq(url, 'POST', body)

export type SdltSensitivity = 'Low' | 'Medium' | 'High'
export type FfaStatus = 'Include' | 'Exclude' | 'Negotiate'
export type BuyerResponseType = 'accept' | 'counter' | 'reject'

export interface FfaItemLookupResult {
  item_name: string
  brand: string
  model: string
  estimated_value: number | null
  sdlt_sensitivity: SdltSensitivity
  suggested_status: FfaStatus
  reasoning: string
}

interface FfaApiRawResult {
  status?: string
  code?: string
  message?: string
  item?: {
    detected_title?: string
    brand?: string | null
    model?: string | null
    specifications?: Record<string, string>
  }
  pricing?: {
    average_price_gbp?: number | null
    price_confidence?: string
  }
  ta10?: {
    sdlt_sensitivity?: string
    suggested_status?: string
    flags?: string[]
  }
  reasoning?: string
}

export interface FfaItem {
  item_name: string
  brand: string
  model: string
  estimated_value: number | null
  sdlt_sensitivity: SdltSensitivity
  notes: string
  status: FfaStatus
  room: string
  image?: string  // base64 data URL, stripped of prefix before sending
}

export interface FfaFormSummary {
  submission_id: string
  item_count: number
  property_reference: string
  timestamp: string
}

export interface FfaFormItem extends FfaItem {
  id?: string
}

export interface FfaFormDetail {
  submission_id: string
  property_reference: string
  timestamp: string
  items: FfaFormItem[]
}

export interface FfaBuyerResponseItem {
  item_name: string
  response: BuyerResponseType
  counter_value?: number
  notes?: string
}

export async function ffaItemLookup(imageBase64: string, ta10Category?: string): Promise<FfaItemLookupResult> {
  const payload = JSON.stringify({ base64_image: imageBase64, ta10_category: ta10Category ?? null })

  const mapSdlt = (s?: string | null): SdltSensitivity => {
    const v = (s ?? '').toLowerCase()
    if (v === 'high')   return 'High'
    if (v === 'medium') return 'Medium'
    return 'Low'
  }
  const mapStatus = (s?: string | null): FfaStatus => {
    const v = (s ?? '').toLowerCase()
    if (v.startsWith('excl')) return 'Exclude'
    if (v.startsWith('neg'))  return 'Negotiate'
    return 'Include'
  }

  let lastErr = ''
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { status, text } = await httpsPost(`${BASE}/v1/item-lookup`, payload)
    if (status >= 200 && status < 300) {
      const raw: FfaApiRawResult = JSON.parse(text)
      if (raw.status === 'error') throw new Error(raw.message ?? raw.code ?? 'API error')
      return {
        item_name:        raw.item?.detected_title ?? '',
        brand:            raw.item?.brand ?? '',
        model:            raw.item?.model ?? '',
        estimated_value:  raw.pricing?.average_price_gbp ?? null,
        sdlt_sensitivity: mapSdlt(raw.ta10?.sdlt_sensitivity),
        suggested_status: mapStatus(raw.ta10?.suggested_status),
        reasoning:        raw.reasoning ?? '',
      }
    }
    lastErr = `item-lookup ${status}: ${text}`
    if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt))
  }
  throw new Error(lastErr)
}

export async function ffaSubmitForm(
  propertyReference: string,
  items: FfaItem[],
): Promise<{ submission_id: string }> {
  const flaskItems = items.map(item => ({
    title:         item.item_name,
    brand:         item.brand,
    model:         item.model,
    price:         item.estimated_value,
    sdlt:          item.sdlt_sensitivity,
    status:        item.status,
    notes:         item.notes,
    category_name: item.room,
    reasoning:     '',
    image_b64:     item.image ?? '',
  }))
  const body = JSON.stringify({ property_ref: propertyReference, items: flaskItems })
  const { status, text } = await httpsReq(`${BASE}/v1/submit-form`, 'POST', body)
  if (status < 200 || status >= 300) throw new Error(`submit-form ${status}: ${text}`)
  return JSON.parse(text)
}

interface FlaskFormItem {
  item_title?: string
  brand?: string
  model?: string
  price?: string | number | null
  sdlt?: string
  status?: string
  notes?: string
  category_name?: string
  reasoning?: string
  image_b64?: string
}

export async function ffaGetForm(submissionId: string): Promise<FfaFormDetail> {
  const { status, text } = await httpsReq(`${BASE}/v1/forms/${submissionId}`, 'GET')
  if (status < 200 || status >= 300) throw new Error(`get-form ${status}`)
  const raw = JSON.parse(text) as { submission_id: string; property_ref?: string; property_reference?: string; submitted_at?: string; timestamp?: string; items: FlaskFormItem[] }
  return {
    submission_id:      raw.submission_id,
    property_reference: raw.property_ref ?? raw.property_reference ?? '',
    timestamp:          raw.submitted_at ?? raw.timestamp ?? '',
    items: (raw.items ?? []).map(i => ({
      item_name:        i.item_title ?? '',
      brand:            i.brand ?? '',
      model:            i.model ?? '',
      estimated_value:  i.price != null ? Number(i.price) : null,
      sdlt_sensitivity: (i.sdlt ?? 'Low') as SdltSensitivity,
      notes:            i.notes ?? '',
      status:           (i.status ?? 'Include') as FfaStatus,
      room:             i.category_name ?? 'General',
      reasoning:        i.reasoning ?? '',
      image:            i.image_b64 ? `data:image/jpeg;base64,${i.image_b64}` : undefined,
    })),
  }
}

export async function ffaListForms(): Promise<FfaFormSummary[]> {
  const { status, text } = await httpsReq(`${BASE}/v1/forms`, 'GET')
  if (status < 200 || status >= 300) throw new Error(`list-forms ${status}`)
  return JSON.parse(text)
}

export async function ffaBuyerResponse(
  submissionId: string,
  responses: FfaBuyerResponseItem[],
): Promise<void> {
  const body = JSON.stringify({ submission_id: submissionId, responses })
  const { status, text } = await httpsReq(`${BASE}/v1/buyer-response`, 'POST', body)
  if (status < 200 || status >= 300) throw new Error(`buyer-response ${status}: ${text}`)
}

// ── Field mapping helpers (Prisma ↔ external API) ──────────────────────────

export function sdltToItemType(sdlt: SdltSensitivity): string {
  if (sdlt === 'High') return 'FIXTURE'
  if (sdlt === 'Medium') return 'KITCHEN_APPLIANCE'
  return 'FITTING'
}

export function itemTypeToSdlt(itemType: string): SdltSensitivity {
  if (['FIXTURE', 'BATHROOM_FITTING', 'OUTDOOR_STRUCTURE', 'SECURITY_SYSTEM'].includes(itemType)) return 'High'
  if (['KITCHEN_APPLIANCE', 'SMART_HOME', 'LIGHT_FITTING'].includes(itemType)) return 'Medium'
  return 'Low'
}

export function ffaStatusToPrisma(status: FfaStatus): string {
  if (status === 'Include') return 'INCLUDED'
  if (status === 'Exclude') return 'EXCLUDED'
  return 'NEGOTIABLE'
}

export function prismaStatusToFfa(status: string): FfaStatus {
  if (status === 'EXCLUDED' || status === 'REMOVED_PRIOR') return 'Exclude'
  if (status === 'NEGOTIABLE' || status === 'FOR_SALE') return 'Negotiate'
  return 'Include'
}
