export interface LensIdentification {
  identifiedName: string
  make: string
  model: string
}

const KNOWN_BRANDS = [
  'Bosch', 'Samsung', 'LG', 'Siemens', 'Beko', 'Hotpoint', 'Indesit', 'Hoover',
  'Miele', 'AEG', 'Zanussi', 'Whirlpool', 'Haier', 'Hisense', 'Panasonic', 'Sony',
  'Apple', 'Dyson', 'Neff', 'Smeg', 'Rangemaster', 'Aga', 'Nest', 'Hive',
  'Ring', 'Yale', 'Philips', 'Electrolux', 'Kenwood', 'Morphy Richards',
  'Russell Hobbs', 'De Longhi', 'Breville', 'Logik', 'Grundig', 'Sharp',
  'Toshiba', 'Hitachi', 'Mitsubishi', 'Baxi', 'Vaillant', 'Worcester', 'Nest',
  'Google', 'Amazon', 'Ring', 'Arlo', 'Hikvision', 'Dahua', 'Honeywell',
]

export async function identifyFromImageUrl(imageUrl: string): Promise<LensIdentification> {
  const apiKey = process.env.SERPAPI_API_KEY
  if (!apiKey) throw new Error('SERPAPI_API_KEY not configured')

  const params = new URLSearchParams({
    engine: 'google_lens',
    url: imageUrl,
    api_key: apiKey,
  })

  const res = await fetch(`https://serpapi.com/search?${params}`)
  if (!res.ok) throw new Error(`SerpAPI error ${res.status}`)

  const data = await res.json()

  // Knowledge graph gives the most precise product name
  const kgTitle = (data.knowledge_graph?.[0]?.title ?? '') as string
  // Visual matches as fallback
  const vmTitle = (data.visual_matches?.[0]?.title ?? '') as string
  const rawTitle = kgTitle || vmTitle

  return { identifiedName: rawTitle, ...parseMakeModel(rawTitle) }
}

function parseMakeModel(title: string): { make: string; model: string } {
  if (!title) return { make: '', model: '' }

  for (const brand of KNOWN_BRANDS) {
    if (title.toLowerCase().includes(brand.toLowerCase())) {
      const rest = title.replace(new RegExp(brand, 'i'), '').trim()
      // Match an alphanumeric model number (e.g. WAT28400GB, Series 6, WM14T790GB)
      const modelMatch = rest.match(/^([A-Z0-9][A-Z0-9\-]{2,})/i)
      return { make: brand, model: modelMatch?.[1] ?? rest.split(' ')[0] ?? '' }
    }
  }

  const parts = title.split(/\s+/)
  return { make: parts[0] ?? '', model: parts[1] ?? '' }
}
