import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = 'https://otikoxnfotyjgphrdudn.supabase.co'
const supabaseKey = 'sb_publishable_DSklSKpNz_Jlwi2Wx089TA_5JR8pBSt'

export const supabase = createClient(supabaseUrl, supabaseKey)

function timeout(ms) {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(null), ms)
  })
}

export async function getSession() {
  // A aplicação não pode ficar presa indefinidamente na tela de carregamento
  // por uma consulta de sessão lenta ou indisponível.
  const result = await Promise.race([
    supabase.auth.getSession(),
    timeout(7000)
  ])

  if (!result) {
    return null
  }

  const { data, error } = result

  if (error) throw error

  return data.session
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) throw error

  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()

  if (error) throw error
}

export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session)
  })
}
