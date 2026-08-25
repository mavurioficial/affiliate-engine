import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = 'COLE_AQUI_A_URL_DO_SUPABASE'
const supabaseKey = 'COLE_AQUI_A_CHAVE_PUBLISHABLE'

export const supabase = createClient(supabaseUrl, supabaseKey)

export async function getSession() {
  const { data, error } = await supabase.auth.getSession()

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
