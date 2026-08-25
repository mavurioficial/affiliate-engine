import { sections } from './app/catalog.js'
import { getSession, signIn, signOut, onAuthChange } from './app/auth.js'

const root = document.querySelector('#root')
const labels = { name: 'Nome', description: 'Descrição', locale: 'Localidade', currency: 'Moeda', markets: 'Mercados', languages: 'Idiomas', status: 'Estado', platform: 'Plataforma', category: 'Categoria', product: 'Produto', market: 'Mercado', offer: 'Oferta', destination: 'Destino', capability: 'Capacidade' }
let page = 'dashboard'
let session = null
let catalogs = {}
let catalogsLoaded = false
const value = (item) => Array.isArray(item) ? item.join(' · ') : item
const editable = (entry, field) => Array.isArray(entry[field]) ? entry[field].join(', ') : (entry[field] ?? '')
const escapeHtml = (item) => String(item ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
async function loadCatalogs() {
  const results = await Promise.all(
    sections.map(async (section) => {
      const entries = await section.repository.list()
      return [section.id, entries]
    })
  )

  catalogs = Object.fromEntries(results)
  catalogsLoaded = true
}

function getEntries(section) {
  return catalogs[section.id] || []
}

function navigation() { return `<aside><button class="brand" data-page="dashboard" aria-label="Ir ao dashboard"><span>M</span><b>Mavuri</b><em>Affiliate Engine</em></button><nav aria-label="Navegação principal"><button class="${page === 'dashboard' ? 'active' : ''}" data-page="dashboard">Visão geral</button><p>Administração</p>${sections.map((s) => `<button class="${page === s.id ? 'active' : ''}" data-page="${s.id}">${s.label}</button>`).join('')}</nav><footer>
  <strong>${session?.user?.email || ''}</strong><br>
  Fundação MVP<br>
  Dados locais no navegador<br><br>
  <button data-logout>Sair</button>
</footer></aside>` }
function loginPage() {
  return `
    <div class="login-shell">
      <form class="login-card" data-login>
        <p class="eyebrow">MAVURI</p>
        <h1>Affiliate Engine</h1>
        <p>Acesse o ambiente administrativo.</p>

        <label>
          <span>E-mail</span>
          <input
            type="email"
            name="email"
            required
            autocomplete="email"
            placeholder="seu@email.com"
          />
        </label>

        <label>
          <span>Senha</span>
          <input
            type="password"
            name="password"
            required
            autocomplete="current-password"
            placeholder="Sua senha"
          />
        </label>

        <p class="login-error" hidden></p>

        <button class="primary" type="submit">
          Entrar
        </button>
      </form>
    </div>
  `
}
async function dashboard() {
  const counts = await Promise.all(
    sections.map(async (s) => {
      const entries = await s.repository.list()
      return {
        id: s.id,
        count: entries.length
      }
    })
  )

  const countById = Object.fromEntries(
    counts.map((item) => [item.id, item.count])
  )

  return `<header class="page-heading">
    <p class="eyebrow">MVP · Supabase</p>
    <h1>Fundação do Affiliate Engine</h1>
    <p>Uma visão navegável do domínio com persistência dos dados no banco.</p>
  </header>

  <section class="status-card">
    <div>
      <p class="eyebrow">Estado atual</p>
      <h2>Interface administrativa integrada ao Supabase</h2>
      <p>Os cadastros são armazenados no banco de dados e podem ser acessados posteriormente.</p>
    </div>
    <span class="status-dot">Integração com banco ativa</span>
  </section>

  <section>
    <div class="section-title">
      <h2>Áreas disponíveis</h2>
      <p>Escolha uma área para consultar e administrar os dados.</p>
    </div>

    <div class="area-grid">
      ${sections.map((s) => `
        <button class="area-card" data-page="${s.id}">
          <span>${s.eyebrow}</span>
          <strong>${s.label}</strong>
          <small>${countById[s.id] || 0} registro(s)</small>
        </button>
      `).join('')}
    </div>
  </section>

  <section class="next-steps">
    <h2>Backup dos dados</h2>
    <p>Você pode exportar os cadastros para um arquivo JSON, importar um backup ou restaurar os dados demonstrativos.</p>

    <div class="form-actions">
      <button data-export>Exportar backup</button>
      <button data-import>Importar backup</button>
      <button class="danger" data-reset>Restaurar dados iniciais</button>
    </div>

    <input id="backup-file" type="file" accept="application/json,.json" hidden />
  </section>

  <section class="next-steps">
    <h2>Limites desta etapa</h2>
    <ul>
      <li>Os dados são armazenados no Supabase.</li>
      <li>A autenticação e as permissões continuam sendo tratadas separadamente.</li>
      <li>Telegram continua apenas como canal conceitual, sem credenciais ou chamadas de API.</li>
    </ul>
  </section>`
}
function fieldInput(s, entry, field) { const reference = s.references?.[field]; if (reference) { const target = sections.find((item) => item.id === reference.section); const options = target.repository.list(); const current = Array.isArray(entry[field]) ? entry[field] : [entry[field]].filter(Boolean); return `<label><span>${labels[field]}</span><select name="${field}" ${reference.multiple ? 'multiple size="4"' : ''} required><option value="" ${current.length ? '' : 'selected'} ${reference.multiple ? 'hidden' : ''}>Selecione...</option>${options.map((item) => `<option value="${escapeHtml(item.name)}" ${current.includes(item.name) ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select>${reference.multiple ? '<small>Use Ctrl para selecionar mais de uma opção.</small>' : ''}</label>` } return `<label><span>${labels[field]}</span><input name="${field}" value="${escapeHtml(editable(entry, field))}" ${field === 'name' ? 'required' : ''} /></label>` }
function sectionPage(s) { const entries = s.repository.list(); return `<header class="page-heading"><p class="eyebrow">${s.eyebrow}</p><div class="heading-row"><div><h1>${s.title}</h1><p>${s.intro}</p></div><button class="primary" data-add="${s.id}">+ Novo cadastro</button></div></header><section class="catalog" aria-label="${s.title}">${entries.length ? entries.map((entry) => `<article class="entry"><div><h2>${escapeHtml(entry.name)}</h2><p>${escapeHtml(entry.description)}</p></div><dl>${s.fields.map((field) => `<div><dt>${labels[field]}</dt><dd>${escapeHtml(value(entry[field]))}</dd></div>`).join('')}</dl><div class="entry-actions"><button data-edit="${entry.id}">Editar</button><button class="danger" data-remove="${entry.id}">Excluir</button></div></article>`).join('') : `<div class="empty">Nenhum cadastro nesta área.</div>`}</section><p class="notice">Os dados ficam salvos neste navegador. Use o backup da Visão geral antes de limpar os dados do navegador ou trocar de dispositivo.</p>` }
function formPage(s, entry = null) { const isEdit = Boolean(entry); const blank = Object.fromEntries(['name', 'description', ...s.fields].map((field) => [field, ''])); const record = entry || blank; return `<header class="page-heading"><p class="eyebrow">${s.eyebrow}</p><h1>${isEdit ? 'Editar cadastro' : 'Novo cadastro'}</h1><p>${s.label}</p></header><form class="editor" data-section="${s.id}" data-id="${entry?.id || ''}">${fieldInput(s, record, 'name')}${fieldInput(s, record, 'description')}${s.fields.map((field) => fieldInput(s, record, field)).join('')}<div class="form-actions"><button type="button" data-page="${s.id}">Cancelar</button><button class="primary" type="submit">${isEdit ? 'Salvar alterações' : 'Adicionar cadastro'}</button></div></form>` }
async function render() {
  if (!session) {
    root.innerHTML = loginPage()
    bind()
    return
  }

  const section = sections.find((s) => s.id === page)

  const edit = page.startsWith('edit:')
    ? sections.find((s) => s.id === page.split(':')[1])
    : null

  const add = page.startsWith('add:')
    ? sections.find((s) => s.id === page.split(':')[1])
    : null

  const entry = edit
    ? (await edit.repository.list()).find(
        (item) => item.id === page.split(':')[2]
      )
    : null

  const content = edit
    ? formPage(edit, entry)
    : add
      ? formPage(add)
      : section
        ? sectionPage(section)
        : await dashboard()

  root.innerHTML = `
    <div class="shell">
      ${navigation()}
      <main>${content}</main>
    </div>
  `

  bind()
}
function exportBackup() { const catalogs = Object.fromEntries(sections.map((s) => [s.id, s.repository.list()])); const backup = { version: 1, application: 'Mavuri Affiliate Engine', exportedAt: new Date().toISOString(), catalogs }; const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `mavuri-affiliate-engine-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url) }
function importBackup(file) { const reader = new FileReader(); reader.onload = () => { try { const backup = JSON.parse(reader.result); if (!backup || backup.version !== 1 || !backup.catalogs || typeof backup.catalogs !== 'object') throw new Error('Formato inválido'); const missing = sections.some((s) => !Array.isArray(backup.catalogs[s.id])); if (missing) throw new Error('Backup incompleto'); if (!confirm('Importar o backup substituirá todos os dados locais atuais. Continuar?')) return; sections.forEach((s) => s.repository.replace(backup.catalogs[s.id])); alert('Backup importado com sucesso.'); render() } catch { alert('Não foi possível importar este arquivo. Selecione um backup válido do Mavuri Affiliate Engine.') } }; reader.readAsText(file) }
function usageOf(sectionId, name) { return sections.flatMap((s) => Object.entries(s.references || {}).filter(([, reference]) => reference.section === sectionId).flatMap(([field]) => s.repository.list().filter((entry) => Array.isArray(entry[field]) ? entry[field].includes(name) : entry[field] === name).map((entry) => ({ section: s, entry })))) }
function bind() {   const loginForm = root.querySelector('[data-login]')

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault()

      const errorElement = loginForm.querySelector('.login-error')
      const button = loginForm.querySelector('button[type="submit"]')
      const formData = new FormData(loginForm)

      errorElement.hidden = true
      button.disabled = true
      button.textContent = 'Entrando...'

      try {
        await signIn(
          formData.get('email'),
          formData.get('password')
        )
      } catch (error) {
        errorElement.textContent =
          error.message || 'Não foi possível realizar o login.'
        errorElement.hidden = false
      } finally {
        button.disabled = false
        button.textContent = 'Entrar'
      }
    })

    return
  }

  const logoutButton = root.querySelector('[data-logout]')

  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
      await signOut()
    })
  } root.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => { page = button.dataset.page; render() })); root.querySelectorAll('[data-add]').forEach((button) => button.addEventListener('click', () => { page = `add:${button.dataset.add}`; render() })); root.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => { const s = sections.find((item) => page === item.id); page = `edit:${s.id}:${button.dataset.edit}`; render() })); root.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => { const s = sections.find((item) => page === item.id); const entry = s.repository.list().find((item) => item.id === button.dataset.remove); const usage = entry ? usageOf(s.id, entry.name) : []; if (usage.length) { alert(`Não é possível excluir “${entry.name}” porque ele é usado em: ${usage.map((item) => `${item.section.label} / ${item.entry.name}`).join(', ')}.`); return } if (confirm('Excluir este cadastro local?')) { s.repository.remove(button.dataset.remove); render() } })); const exportButton = root.querySelector('[data-export]'); if (exportButton) exportButton.addEventListener('click', exportBackup); const importButton = root.querySelector('[data-import]'); const backupFile = root.querySelector('#backup-file'); if (importButton && backupFile) { importButton.addEventListener('click', () => backupFile.click()); backupFile.addEventListener('change', () => { if (backupFile.files?.[0]) importBackup(backupFile.files[0]); backupFile.value = '' }) } const resetButton = root.querySelector('[data-reset]'); if (resetButton) resetButton.addEventListener('click', () => { if (confirm('Restaurar todos os dados demonstrativos? Todos os cadastros locais serão perdidos.')) { sections.forEach((s) => s.repository.reset()); alert('Dados iniciais restaurados.'); render() } }); const form = root.querySelector('.editor'); if (form) form.addEventListener('submit', (event) => { event.preventDefault(); const s = sections.find((item) => item.id === form.dataset.section); const formData = new FormData(form); const data = Object.fromEntries(formData.entries()); Object.entries(s.references || {}).forEach(([field, reference]) => { if (reference.multiple) data[field] = formData.getAll(field).filter(Boolean) }); s.fields.forEach((field) => { if (!s.references?.[field] && data[field]?.includes(',')) data[field] = data[field].split(',').map((item) => item.trim()).filter(Boolean) }); if (!data.name?.trim()) { alert('Informe um nome para o cadastro.'); return } if (form.dataset.id) s.repository.update(form.dataset.id, data); else s.repository.create(data); page = s.id; render() }) }
async function start() {
  try {
    session = await getSession()
  } catch (error) {
    console.error('Erro ao verificar sessão:', error)
  }

  render()

  onAuthChange((nextSession) => {
    session = nextSession
    render()
  })
}

start()
