import { cpSync, mkdirSync, rmSync } from 'node:fs'

rmSync('dist', { recursive: true, force: true })
mkdirSync('dist', { recursive: true })

cpSync('index.html', 'dist/index.html')
cpSync('offers-service-worker.js', 'dist/offers-service-worker.js')
cpSync('src', 'dist/src', { recursive: true })

// O main.js atual ainda importa módulos de compatibilidade fora de src.
// Eles precisam acompanhar o build para que o GitHub Pages consiga resolver
// todos os imports em produção.
cpSync('domain', 'dist/domain', { recursive: true })
cpSync('infrastructure', 'dist/infrastructure', { recursive: true })

console.log('Build estático criado em dist/.')
