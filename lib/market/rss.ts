/**
 * Lectura de feeds RSS/Atom: solo titulares, enlaces y fechas (nada de
 * scraping). La usan el pipeline de mercado (scripts/market/sources/rss.ts) y
 * la búsqueda de mercado de AXIS en el servidor (lib/market/search.ts).
 */

export interface Headline {
  title: string
  link: string
  publishedAt: string
  source: string
}

/** Parser mínimo de RSS/Atom sin dependencias: título, enlace y fecha de cada item. */
export function parseRSS(xml: string, sourceName: string, max = 15): Headline[] {
  const items = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? []
  const pick = (block: string, tag: string) => {
    const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
    return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim() : ''
  }
  return items.slice(0, max).map((block) => {
    const linkAttr = block.match(/<link[^>]*href="([^"]+)"/i)?.[1]
    const published = pick(block, 'pubDate') || pick(block, 'published') || pick(block, 'updated') || pick(block, 'dc:date')
    const t = Date.parse(published)
    return {
      title: pick(block, 'title').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
      link: pick(block, 'link') || linkAttr || '',
      publishedAt: Number.isNaN(t) ? '' : new Date(t).toISOString(),
      source: sourceName,
    }
  })
}
