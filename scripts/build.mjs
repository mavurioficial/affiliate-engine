import { cpSync, mkdirSync, rmSync } from 'node:fs'

rmSync('dist', { recursive: true, force: true })
mkdirSync('dist', { recursive: true })

cpSync('index.html', 'dist/index.html')
cpSync('entrar', 'dist/entrar', { recursive: true })
cpSync('src', 'dist/src', { recursive: true })

console.log('Build estático criado em dist/.')
