import { execFileSync } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import crypto from 'crypto'
import { SupabaseClient } from '@supabase/supabase-js'

export interface MacContact {
  identifier: string
  name: string
  company: string
  role: string
  phone: string
  email: string
  location: string
}

export interface SupabaseContact {
  id: string
  name: string
  company: string | null
  role: string | null
  phone: string | null
  email: string | null
  location: string | null
  macos_contact_id: string | null
  contact_hash: string | null
}

// ── JXA runner ───────────────────────────────────────────────────────────────

function runJXA<T>(script: string): T {
  const file = path.join(tmpdir(), `vt-contacts-${Date.now()}.js`)
  writeFileSync(file, script, 'utf8')
  try {
    const out = execFileSync('osascript', ['-l', 'JavaScript', file], { encoding: 'utf8' })
    return JSON.parse(out) as T
  } finally {
    try { unlinkSync(file) } catch (_) { /* ignore */ }
  }
}

// ── macOS Contacts access ────────────────────────────────────────────────────

export function checkContactsAccess(): boolean {
  try {
    runJXA<boolean>(`
      var app = Application('Contacts')
      app.includeStandardAdditions = true
      var people = app.people()
      JSON.stringify(true)
    `)
    return true
  } catch {
    return false
  }
}

export function getAllMacContacts(): MacContact[] {
  return runJXA<MacContact[]>(`
    var app = Application('Contacts')
    var people = app.people()
    var result = []
    for (var i = 0; i < people.length; i++) {
      try {
        var p = people[i]
        var firstName = ''
        var lastName  = ''
        var company   = ''
        var jobTitle  = ''
        var phone     = ''
        var email     = ''
        var city      = ''
        var state     = ''
        try { firstName = p.firstName() || '' } catch(e) {}
        try { lastName  = p.lastName()  || '' } catch(e) {}
        try { company   = p.organization() || '' } catch(e) {}
        try { jobTitle  = p.jobTitle() || '' } catch(e) {}
        try { var phones = p.phones(); if (phones.length > 0) phone = phones[0].value() || '' } catch(e) {}
        try { var emails = p.emails(); if (emails.length > 0) email = emails[0].value() || '' } catch(e) {}
        try {
          var addrs = p.addresses()
          if (addrs.length > 0) {
            try { city  = addrs[0].city()  || '' } catch(e) {}
            try { state = addrs[0].state() || '' } catch(e) {}
          }
        } catch(e) {}
        var name = (firstName + ' ' + lastName).trim() || company || 'Unknown'
        var location = [city, state].filter(function(s){ return s }).join(', ')
        result.push({
          identifier: p.id(),
          name: name,
          company: company,
          role: jobTitle,
          phone: phone,
          email: email,
          location: location
        })
      } catch(e) {}
    }
    JSON.stringify(result)
  `)
}

function getMacContactById(identifier: string): MacContact | null {
  try {
    const results = runJXA<MacContact[]>(`
      var app = Application('Contacts')
      var people = app.people.whose({ id: { _equals: ${JSON.stringify(identifier)} } })
      if (people.length === 0) { JSON.stringify([]) }
      var p = people[0]
      var firstName = ''
      var lastName  = ''
      var company   = ''
      var jobTitle  = ''
      var phone     = ''
      var email     = ''
      var city      = ''
      var state     = ''
      try { firstName = p.firstName() || '' } catch(e) {}
      try { lastName  = p.lastName()  || '' } catch(e) {}
      try { company   = p.organization() || '' } catch(e) {}
      try { jobTitle  = p.jobTitle() || '' } catch(e) {}
      try { var phones = p.phones(); if (phones.length > 0) phone = phones[0].value() || '' } catch(e) {}
      try { var emails = p.emails(); if (emails.length > 0) email = emails[0].value() || '' } catch(e) {}
      try {
        var addrs = p.addresses()
        if (addrs.length > 0) {
          try { city  = addrs[0].city()  || '' } catch(e) {}
          try { state = addrs[0].state() || '' } catch(e) {}
        }
      } catch(e) {}
      var name = (firstName + ' ' + lastName).trim() || company || 'Unknown'
      var location = [city, state].filter(function(s){ return s }).join(', ')
      JSON.stringify([{ identifier: p.id(), name: name, company: company, role: jobTitle, phone: phone, email: email, location: location }])
    `)
    return results[0] ?? null
  } catch {
    return null
  }
}

function updateMacContact(identifier: string, fields: Partial<MacContact>): void {
  const nameParts = (fields.name ?? '').split(' ')
  const firstName = JSON.stringify(nameParts[0] ?? '')
  const lastName  = JSON.stringify(nameParts.slice(1).join(' '))
  const company   = JSON.stringify(fields.company ?? '')
  const jobTitle  = JSON.stringify(fields.role ?? '')
  const phone     = JSON.stringify(fields.phone ?? '')
  const email     = JSON.stringify(fields.email ?? '')
  const id        = JSON.stringify(identifier)

  runJXA<null>(`
    var app = Application('Contacts')
    var people = app.people.whose({ id: { _equals: ${id} } })
    if (people.length === 0) { JSON.stringify(null) }
    var p = people[0]
    try { p.firstName = ${firstName} } catch(e) {}
    try { p.lastName  = ${lastName}  } catch(e) {}
    try { p.organization = ${company}  } catch(e) {}
    try { p.jobTitle  = ${jobTitle}  } catch(e) {}
    try {
      if (${phone} !== '') {
        if (p.phones().length > 0) {
          p.phones()[0].value = ${phone}
        } else {
          var ph = app.Phone({ label: 'mobile', value: ${phone} })
          p.phones.push(ph)
        }
      }
    } catch(e) {}
    try {
      if (${email} !== '') {
        if (p.emails().length > 0) {
          p.emails()[0].value = ${email}
        } else {
          var em = app.Email({ label: 'work', value: ${email} })
          p.emails.push(em)
        }
      }
    } catch(e) {}
    app.save()
    JSON.stringify(null)
  `)
}

// ── Hash ─────────────────────────────────────────────────────────────────────

function hashContact(c: { name: string; company: string | null; role: string | null; phone: string | null; email: string | null; location: string | null }): string {
  return crypto.createHash('md5').update(JSON.stringify(c)).digest('hex')
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Import a single macOS contact into Supabase and mark it linked. */
export async function importContact(supabase: SupabaseClient, macosId: string): Promise<void> {
  const mac = getMacContactById(macosId)
  if (!mac) throw new Error('Contact not found in macOS Contacts')

  const data = {
    name: mac.name,
    company: mac.company || null,
    role: mac.role || null,
    phone: mac.phone || null,
    email: mac.email || null,
    location: mac.location || null,
    macos_contact_id: macosId,
    contact_hash: hashContact({
      name: mac.name, company: mac.company, role: mac.role,
      phone: mac.phone, email: mac.email, location: mac.location,
    }),
  }

  const { data: existing } = await supabase
    .from('contacts')
    .select('id')
    .eq('macos_contact_id', macosId)
    .maybeSingle()

  if (existing) {
    await supabase.from('contacts').update(data).eq('id', existing.id)
  } else {
    await supabase.from('contacts').insert(data)
  }
}

/** Clear the macOS link from a contact (keeps the contact record). */
export async function unlinkContact(supabase: SupabaseClient, macosId: string): Promise<void> {
  await supabase
    .from('contacts')
    .update({ macos_contact_id: null, contact_hash: null })
    .eq('macos_contact_id', macosId)
}

/** Bi-directional sync for all linked contacts. */
export async function syncAll(supabase: SupabaseClient): Promise<{ updated: number; pushed: number }> {
  const { data: rows } = await supabase
    .from('contacts')
    .select('*')
    .not('macos_contact_id', 'is', null)

  if (!rows?.length) return { updated: 0, pushed: 0 }

  let updated = 0
  let pushed = 0

  for (const sc of rows as SupabaseContact[]) {
    if (!sc.macos_contact_id) continue

    const mac = getMacContactById(sc.macos_contact_id)
    if (!mac) continue

    const macHash = hashContact({
      name: mac.name, company: mac.company, role: mac.role,
      phone: mac.phone, email: mac.email, location: mac.location,
    })

    if (macHash !== sc.contact_hash) {
      // macOS changed → push macOS → Supabase
      await supabase.from('contacts').update({
        name: mac.name,
        company: mac.company || null,
        role: mac.role || null,
        phone: mac.phone || null,
        email: mac.email || null,
        location: mac.location || null,
        contact_hash: macHash,
      }).eq('id', sc.id)
      updated++
    } else {
      // Check if web app changed the Supabase record
      const scHash = hashContact({
        name: sc.name, company: sc.company, role: sc.role,
        phone: sc.phone, email: sc.email, location: sc.location,
      })
      if (scHash !== sc.contact_hash) {
        // Supabase is newer → push Supabase → macOS
        try {
          updateMacContact(sc.macos_contact_id, {
            name: sc.name ?? '',
            company: sc.company ?? '',
            role: sc.role ?? '',
            phone: sc.phone ?? '',
            email: sc.email ?? '',
          })
          await supabase.from('contacts').update({ contact_hash: scHash }).eq('id', sc.id)
          pushed++
        } catch (_) {
          // Some macOS contacts are read-only (e.g. linked to iCloud accounts)
        }
      }
    }
  }

  return { updated, pushed }
}
