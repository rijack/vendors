export interface CardDAVContact {
  uid: string
  name: string
  company: string | null
  role: string | null
  phone: string | null
  email: string | null
  location: string | null
}

export interface CardDAVBook {
  url: string
  name: string
}

export interface CardDAVGroup {
  uid: string
  name: string
  memberUids: string[]
}

function basicAuth(appleId: string, appPassword: string): string {
  return 'Basic ' + Buffer.from(`${appleId}:${appPassword}`).toString('base64')
}

const DAV_HEADERS = (auth: string, depth = '0') => ({
  Authorization: auth,
  'Content-Type': 'application/xml; charset=utf-8',
  Depth: depth,
  'User-Agent': 'VendorTracker/1.0 (CardDAV client)',
  'Cache-Control': 'no-cache, no-store',
  Pragma: 'no-cache',
})

// Follow redirects manually so non-GET methods are preserved
async function davFetch(
  method: string,
  url: string,
  auth: string,
  body: string,
  depth = '0',
): Promise<string> {
  let currentUrl = url
  for (let i = 0; i < 6; i++) {
    const res = await fetch(currentUrl, {
      method,
      headers: DAV_HEADERS(auth, depth),
      body,
      redirect: 'manual',
    })
    if (res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308) {
      const loc = res.headers.get('location')
      if (!loc) throw new Error(`Redirect with no Location header from ${currentUrl}`)
      currentUrl = loc.startsWith('http') ? loc : new URL(loc, currentUrl).href
      continue
    }
    if (res.status === 401) {
      throw new Error('Invalid Apple ID or app-specific password')
    }
    if (res.status !== 207 && !res.ok) {
      const text = await res.text()
      throw new Error(`CardDAV ${method} → ${res.status}: ${text.slice(0, 300)}`)
    }
    return res.text()
  }
  throw new Error('Too many redirects')
}

// Extract first text content of a tag, handling any namespace prefix
function xmlTag(xml: string, localName: string): string | null {
  const re = new RegExp(
    `<(?:[^>]*:)?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[^>]*:)?${localName}>`,
    'i',
  )
  const m = xml.match(re)
  return m ? m[1].trim() : null
}

function xmlHref(xml: string): string | null {
  return xmlTag(xml, 'href')
}

function xmlResponses(xml: string): string[] {
  const results: string[] = []
  // Note: no leading \s inside the capture group — content may start with any char
  const re = /<(?:[^>]*:)?response(?:\s[^>]*)?>([^]*?)<\/(?:[^>]*:)?response>/gi
  let m
  while ((m = re.exec(xml)) !== null) results.push(m[1])
  return results
}

function toAbsolute(href: string): string {
  return href.startsWith('http') ? href : `https://contacts.icloud.com${href}`
}

function normalizeUrl(url: string): string {
  return url.endsWith('/') ? url : url + '/'
}

const PROPFIND_HOME_BODY = `<?xml version="1.0"?><D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><D:prop><D:current-user-principal/><C:addressbook-home-set/></D:prop></D:propfind>`
const PROPFIND_HOME_SET_BODY = `<?xml version="1.0"?><D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><D:prop><C:addressbook-home-set/></D:prop></D:propfind>`

async function resolveAddressBookHome(auth: string): Promise<string> {
  const candidates = [
    'https://contacts.icloud.com/',
    'https://contacts.icloud.com/.well-known/carddav',
  ]

  for (const url of candidates) {
    const res = await fetch(url, {
      method: 'PROPFIND',
      headers: DAV_HEADERS(auth),
      body: PROPFIND_HOME_BODY,
      redirect: 'manual',
    })

    if (res.status === 401) {
      throw new Error('Invalid Apple ID or app-specific password')
    }

    if (res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308) {
      const loc = res.headers.get('location')
      if (loc) return toAbsolute(loc)
    }

    if (res.status === 207) {
      const xml = await res.text()

      const homeTag = xmlTag(xml, 'addressbook-home-set')
      const homeHref = homeTag ? xmlHref(homeTag) : null
      if (homeHref) return toAbsolute(homeHref)

      const principalTag = xmlTag(xml, 'current-user-principal')
      const principalHref = principalTag ? xmlHref(principalTag) : null
      if (principalHref) {
        const xml2 = await davFetch('PROPFIND', toAbsolute(principalHref), auth, PROPFIND_HOME_SET_BODY)
        const homeTag2 = xmlTag(xml2, 'addressbook-home-set')
        const homeHref2 = homeTag2 ? xmlHref(homeTag2) : null
        if (homeHref2) return toAbsolute(homeHref2)
      }
    }
  }

  throw new Error(
    'iCloud CardDAV: could not discover contacts URL. ' +
    'Make sure iCloud Contacts is enabled and your app-specific password is correct (format: xxxx-xxxx-xxxx-xxxx).',
  )
}

async function listBooks(homeUrl: string, auth: string): Promise<CardDAVBook[]> {
  const xml = await davFetch(
    'PROPFIND',
    homeUrl,
    auth,
    `<?xml version="1.0"?><D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><D:prop><D:resourcetype/><D:displayname/></D:prop></D:propfind>`,
    '1',
  )
  const books: CardDAVBook[] = []
  const homeNorm = normalizeUrl(toAbsolute(homeUrl))

  for (const resp of xmlResponses(xml)) {
    // Only include actual address books (not the home collection itself)
    if (!resp.toLowerCase().includes('addressbook')) continue
    const href = xmlHref(resp)
    if (!href) continue
    const url = toAbsolute(href)
    if (normalizeUrl(url) === homeNorm) continue

    const displayName = xmlTag(resp, 'displayname')
    books.push({ url, name: displayName || 'Address Book' })
  }

  // If nothing found, treat the home itself as the address book
  if (books.length === 0) {
    books.push({ url: homeUrl, name: 'iCloud Contacts' })
  }

  return books
}

function parseVCard(raw: string): CardDAVContact | null {
  // Unfold continuation lines (RFC 6350)
  const text = raw.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')

  const getFirst = (key: string): string | null => {
    const m = text.match(new RegExp(`^${key}(?:;[^:\\r\\n]*)?:(.+)$`, 'mi'))
    return m ? m[1].trim() : null
  }

  const uid = getFirst('UID')
  if (!uid) return null

  const fn = getFirst('FN')
  const nRaw = getFirst('N')
  let name = fn || ''
  if (!name && nRaw) {
    const parts = nRaw.split(';')
    name = [parts[1], parts[0]].filter(Boolean).join(' ').trim()
  }

  const orgRaw = getFirst('ORG')
  const company = orgRaw ? orgRaw.split(';')[0].trim() || null : null

  const adrRaw = getFirst('ADR')
  let location: string | null = null
  if (adrRaw) {
    const p = adrRaw.split(';')
    location = [p[3], p[4]].filter(Boolean).join(', ') || null
  }

  return {
    uid: uid.replace(/^urn:uuid:/i, ''),
    name: name || 'Unknown',
    company,
    role: getFirst('TITLE'),
    phone: getFirst('TEL'),
    email: getFirst('EMAIL'),
    location,
  }
}

function isGroupVCard(text: string): boolean {
  return /^KIND:group$/mi.test(text) || /^X-ADDRESSBOOKSERVER-KIND:group$/mi.test(text)
}

function parseGroupVCard(raw: string): CardDAVGroup | null {
  const text = raw.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')
  if (!isGroupVCard(text)) return null

  const uid = text.match(/^UID(?:;[^:\r\n]*)?:(.+)$/mi)?.[1]?.trim()
  if (!uid) return null

  const fn = text.match(/^FN(?:;[^:\r\n]*)?:(.+)$/mi)?.[1]?.trim()

  const memberUids: string[] = []
  const memberRe = /^X-ADDRESSBOOKSERVER-MEMBER(?:;[^:\r\n]*)?:(.+)$/gmi
  let m
  while ((m = memberRe.exec(text)) !== null) {
    memberUids.push(m[1].trim().replace(/^urn:uuid:/i, ''))
  }

  return {
    uid: uid.replace(/^urn:uuid:/i, ''),
    name: fn || 'Unnamed Group',
    memberUids,
  }
}

function decodeVCardEntities(raw: string): string {
  return raw
    .trim()
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#13;/g, '\r')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
}

async function fetchRawVCards(bookUrl: string, auth: string): Promise<string[]> {
  const xml = await davFetch(
    'REPORT',
    bookUrl,
    auth,
    `<?xml version="1.0"?><C:addressbook-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><D:prop><D:getetag/><C:address-data/></D:prop></C:addressbook-query>`,
    '1',
  )
  const cards: string[] = []
  const addrRe = /<(?:[^>]*:)?address-data(?:\s[^>]*)?>([^]*?)<\/(?:[^>]*:)?address-data>/gi
  let m
  while ((m = addrRe.exec(xml)) !== null) {
    cards.push(decodeVCardEntities(m[1]))
  }
  return cards
}

// Returns the absolute href for the contact with the given UID, or null if not found
async function findContactHrefByUid(bookUrl: string, auth: string, uid: string): Promise<string | null> {
  const xml = await davFetch(
    'REPORT',
    bookUrl,
    auth,
    `<?xml version="1.0"?><C:addressbook-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><D:prop><D:getetag/><C:address-data/></D:prop></C:addressbook-query>`,
    '1',
  )
  const addrRe = /<(?:[^>]*:)?response(?:\s[^>]*)?>([^]*?)<\/(?:[^>]*:)?response>/gi
  let m
  while ((m = addrRe.exec(xml)) !== null) {
    const block = m[1]
    const addrMatch = /<(?:[^>]*:)?address-data(?:\s[^>]*)?>([^]*?)<\/(?:[^>]*:)?address-data>/i.exec(block)
    if (!addrMatch) continue
    const vcard = decodeVCardEntities(addrMatch[1])
    const uidMatch = vcard.match(/^UID(?:;[^:\r\n]*)?:(.+)$/mi)
    const cardUid = uidMatch?.[1]?.trim().replace(/^urn:uuid:/i, '')
    if (cardUid === uid) {
      const href = xmlHref(block)
      return href ? toAbsolute(href) : null
    }
  }
  return null
}

async function fetchContactsFromBookInternal(bookUrl: string, auth: string): Promise<CardDAVContact[]> {
  const cards = await fetchRawVCards(bookUrl, auth)
  const contacts: CardDAVContact[] = []
  for (const raw of cards) {
    if (isGroupVCard(raw)) continue // skip group vCards
    const contact = parseVCard(raw)
    if (contact) contacts.push(contact)
  }
  return contacts
}

async function fetchGroupsInternal(bookUrl: string, auth: string): Promise<CardDAVGroup[]> {
  const cards = await fetchRawVCards(bookUrl, auth)
  const groups: CardDAVGroup[] = []
  for (const raw of cards) {
    const group = parseGroupVCard(raw)
    if (group) groups.push(group)
  }
  return groups
}

// Public wrapper: fetch contacts from a single address book by URL
export async function fetchContactsFromBook(
  appleId: string,
  appPassword: string,
  bookUrl: string,
): Promise<CardDAVContact[]> {
  const auth = basicAuth(appleId, appPassword)
  return fetchContactsFromBookInternal(bookUrl, auth)
}

// Returns all available address books for the account
export async function fetchAddressBooks(
  appleId: string,
  appPassword: string,
): Promise<CardDAVBook[]> {
  const auth = basicAuth(appleId, appPassword)
  const homeUrl = await resolveAddressBookHome(auth)
  return listBooks(homeUrl, auth)
}

// Returns all iCloud contact groups (KIND:group vCards) with their member UIDs
export async function fetchGroups(
  appleId: string,
  appPassword: string,
): Promise<CardDAVGroup[]> {
  const auth = basicAuth(appleId, appPassword)
  const homeUrl = await resolveAddressBookHome(auth)
  const allBooks = await listBooks(homeUrl, auth)
  const groups: CardDAVGroup[] = []
  for (const book of allBooks) {
    const bookGroups = await fetchGroupsInternal(book.url, auth)
    groups.push(...bookGroups)
  }
  return groups
}

// Fetches contacts, optionally filtered to specific address book URLs and/or specific contact UIDs.
// Also returns the primary book URL (first discovered book) for use in outbound sync.
export async function fetchiCloudContacts(
  appleId: string,
  appPassword: string,
  selectedBookUrls?: string[], // undefined or empty = sync all books
  selectedUids?: string[], // if non-empty, only return contacts with these UIDs
): Promise<{ contacts: CardDAVContact[]; primaryBookUrl: string | null }> {
  const auth = basicAuth(appleId, appPassword)
  const homeUrl = await resolveAddressBookHome(auth)
  const allBooks = await listBooks(homeUrl, auth)

  const booksToSync =
    selectedBookUrls && selectedBookUrls.length > 0
      ? allBooks.filter((b) =>
          selectedBookUrls.some((sel) => normalizeUrl(sel) === normalizeUrl(b.url)),
        )
      : allBooks

  const contacts: CardDAVContact[] = []
  for (const book of booksToSync) {
    const bookContacts = await fetchContactsFromBookInternal(book.url, auth)
    contacts.push(...bookContacts)
  }

  const filtered =
    selectedUids && selectedUids.length > 0
      ? contacts.filter((c) => selectedUids.includes(c.uid))
      : contacts

  return { contacts: filtered, primaryBookUrl: allBooks[0]?.url ?? null }
}

// ---------------------------------------------------------------------------
// Outbound (App → iCloud) write operations
// ---------------------------------------------------------------------------

// Build a vCard string from app contact data
export function generateVCard(
  uid: string,
  contact: {
    name: string
    company?: string | null
    role?: string | null
    phone?: string | null
    email?: string | null
    location?: string | null
  },
): string {
  const parts = contact.name.trim().split(/\s+/)
  const nValue =
    parts.length > 1
      ? `${parts[parts.length - 1]};${parts.slice(0, -1).join(' ')};;;`
      : `${contact.name};;;;`

  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `UID:${uid}`,
    `FN:${contact.name}`,
    `N:${nValue}`,
  ]
  if (contact.company) lines.push(`ORG:${contact.company}`)
  if (contact.role) lines.push(`TITLE:${contact.role}`)
  if (contact.phone) lines.push(`TEL;type=CELL:${contact.phone}`)
  if (contact.email) lines.push(`EMAIL;type=INTERNET:${contact.email}`)
  if (contact.location) lines.push(`ADR;type=HOME:;;${contact.location};;;;`)
  lines.push('END:VCARD')
  return lines.join('\r\n') + '\r\n'
}

async function doPut(url: string, auth: string, vcard: string): Promise<void> {
  let currentUrl = url
  for (let i = 0; i < 6; i++) {
    const res = await fetch(currentUrl, {
      method: 'PUT',
      headers: {
        Authorization: auth,
        'Content-Type': 'text/vcard; charset=utf-8',
        'User-Agent': 'VendorTracker/1.0 (CardDAV client)',
      },
      body: vcard,
      redirect: 'manual',
    })
    if (res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308) {
      const loc = res.headers.get('location')
      if (!loc) throw new Error('Redirect with no Location header')
      currentUrl = loc.startsWith('http') ? loc : new URL(loc, currentUrl).href
      continue
    }
    if (res.status === 401) throw new Error('Invalid Apple ID or app-specific password')
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`CardDAV PUT → ${res.status}: ${text.slice(0, 200)}`)
    }
    return
  }
  throw new Error('Too many redirects')
}

// Create or update a contact in iCloud via CardDAV PUT
export async function pushContactToiCloud(
  appleId: string,
  appPassword: string,
  bookUrl: string,
  uid: string,
  contact: {
    name: string
    company?: string | null
    role?: string | null
    phone?: string | null
    email?: string | null
    location?: string | null
  },
): Promise<void> {
  const auth = basicAuth(appleId, appPassword)
  const vcard = generateVCard(uid, contact)

  // First try the canonical UID-based URL
  const canonicalUrl = normalizeUrl(bookUrl) + uid + '.vcf'
  try {
    await doPut(canonicalUrl, auth, vcard)
    return
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    // 404 from iCloud often means the contact exists at a different href — look it up
    if (!msg.includes('404')) throw err
  }

  // Look up the contact's actual href by UID
  const actualHref = await findContactHrefByUid(bookUrl, auth, uid)
  if (actualHref && actualHref !== canonicalUrl) {
    await doPut(actualHref, auth, vcard)
    return
  }

  // Contact not found on iCloud at all — create it at the canonical URL
  // (retry without throwing on 404 — maybe it was a transient error)
  await doPut(canonicalUrl, auth, vcard)
}

// Delete a contact from iCloud via CardDAV DELETE
export async function deleteContactFromiCloud(
  appleId: string,
  appPassword: string,
  bookUrl: string,
  uid: string,
): Promise<void> {
  const auth = basicAuth(appleId, appPassword)
  const url = normalizeUrl(bookUrl) + uid + '.vcf'

  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: auth,
      'User-Agent': 'VendorTracker/1.0 (CardDAV client)',
    },
  })
  if (res.status === 401) throw new Error('Invalid Apple ID or app-specific password')
  if (res.status === 404) return // already gone
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`CardDAV DELETE → ${res.status}: ${text.slice(0, 200)}`)
  }
}
