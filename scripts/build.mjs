import { cpSync, mkdirSync, rmSync } from 'node:fs'

rmSync('dist', { recursive: true, force: true })
mkdirSync('dist', { recursive: true })

cpSync('index.html', 'dist/index.html')
cpSync('src', 'dist/src', { recursive: true })
cpSync('entrar', 'dist/entrar', { recursive: true })
cpSync('verificar-shopee', 'dist/verificar-shopee', { recursive: true })

console.log('Build estático criado em dist/.')
