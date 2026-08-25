import { readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

function files(directory) { return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(directory, entry.name)) : entry.name.endsWith('.js') ? [join(directory, entry.name)] : []) }
for (const file of files('src').concat(files('scripts'))) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' })
console.log('Verificação de sintaxe concluída.')

