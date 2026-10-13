/**
 * Cadena de proveedores de la investigación profunda: Cloudflare → Groq, como
 * AXIS. Sin las claves de Cloudflare, Groq solo; sin claves, ninguno. Gemini
 * ya no participa aunque su clave siga en el entorno.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { marketProviders } from '../providers/select'

const CF = { CF_ACCOUNT_ID: 'acc', CF_API_TOKEN: 'tok' }

describe('marketProviders', () => {
  it('Cloudflare principal y Groq de fallback', () => {
    const p = marketProviders({ ...CF, GROQ_API_KEY: 'g' })
    assert.match(p.primary?.id ?? '', /^cloudflare:/)
    assert.match(p.fallback?.id ?? '', /^groq:/)
  })

  it('sin las claves de Cloudflare, Groq es el principal y no hay fallback', () => {
    const p = marketProviders({ GROQ_API_KEY: 'g', CF_ACCOUNT_ID: 'acc' })
    assert.match(p.primary?.id ?? '', /^groq:/)
    assert.equal(p.fallback, null)
  })

  it('solo Cloudflare: sin fallback', () => {
    const p = marketProviders(CF)
    assert.match(p.primary?.id ?? '', /^cloudflare:/)
    assert.equal(p.fallback, null)
  })

  it('sin claves no hay proveedor; Gemini ya no se usa', () => {
    const p = marketProviders({ GEMINI_API_KEY: 'k' })
    assert.equal(p.primary, null)
    assert.equal(p.fallback, null)
  })

  it('respeta los modelos de las variables del repositorio', () => {
    const p = marketProviders({ ...CF, GROQ_API_KEY: 'g', MARKET_CLOUDFLARE_MODEL: '@cf/x/y', MARKET_GROQ_MODEL: 'openai/gpt-oss-20b' })
    assert.equal(p.primary?.id, 'cloudflare:@cf/x/y')
    assert.equal(p.fallback?.id, 'groq:openai/gpt-oss-20b')
  })
})
