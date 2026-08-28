const supabaseUrl = 'https://otikoxnfotyjgphrdudn.supabase.co'
const supabaseKey = 'sb_publishable_DSklSKpNz_Jlwi2Wx089TA_5JR8pBSt'

let clientPromise = null

function timeout(ms) {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(null), ms)
  })
}

export async function getClient() {
  if (!clientPromise) {
    clientPromise = Promise.race([
      import('https://esm.sh/@supabase/supabase-js@2')
        .then(({ createClient }) => createClient(supabaseUrl, supabaseKey)),
      timeout(7000)
    ]).then((client) => {
      if (!client) {
        throw new Error('Não foi possível carregar o serviço de autenticação.')
      }
      return client
    }).catch((error) => {
      clientPromise = null
      throw error
    })
  }

  return clientPromise
}

export async function getSession() {
  try {
    const supabase = await getClient()
    const result = await Promise.race([
      supabase.auth.getSession(),
      timeout(7000)
    ])

    if (!result) return null

    const { data, error } = result
    if (error) throw error

    return data.session
  } catch (error) {
    console.warn('Autenticação indisponível na inicialização:', error)
    return null
  }
}

export async function signIn(email, password) {
  const supabase = await getClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) throw error

  return data
}

export async function signOut() {
  const supabase = await getClient()
  const { error } = await supabase.auth.signOut()

  if (error) throw error
}

export function onAuthChange(callback) {
  getClient()
    .then((supabase) => {
      supabase.auth.onAuthStateChange((_event, session) => {
        callback(session)
      })
    })
    .catch((error) => {
      console.warn('Monitoramento de autenticação indisponível:', error)
    })

  return { data: { subscription: { unsubscribe() {} } } }
}
