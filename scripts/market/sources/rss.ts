/**
 * RSS oficiales: notas de prensa del BCE y de la Reserva Federal, y noticias
 * del Banco de España. Solo titulares y enlaces; nada de scraping de páginas.
 */
import { fetchText, parseRSS, source, type Source } from './shared'

const FEEDS = [
  { name: 'BCE · prensa', url: 'https://www.ecb.europa.eu/rss/press.html' },
  { name: 'Fed · prensa', url: 'https://www.federalreserve.gov/feeds/press_all.xml' },
  { name: 'Banco de España · noticias', url: 'https://www.bde.es/wbe/es/inicio/rss/rss-noticias/' },
]

function feed(name: string, url: string): Source {
  return async (ctx) => {
    const xml = await fetchText(ctx, url, { headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' } })
    const headlines = parseRSS(xml, name).filter((h) => h.title)
    if (headlines.length === 0) throw new Error('feed sin items')
    return { source: source(name, url, 'news', ctx.now), indicators: [], headlines }
  }
}

export const rssFeeds: Array<{ name: string; run: Source }> = FEEDS.map((f) => ({ name: f.name, run: feed(f.name, f.url) }))
