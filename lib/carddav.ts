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

function basicAuth(appleId: string, appPassword: string): string {
  return 'Basic ' + Buffer.from(`${appleId}:${appPassword}`).toString('base64')
}

const DAV_HEADERS = (auth: string, depth = '0') => ({
  Authorization: auth,
  'Content-Type': 'application/xml; charset=utf-8',
  Depth: depth,
  'User-Agent': 'VendorTracker/1.0 (CardDAV client)',
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

async function fetchContactsFromBook(bookUrl: string, auth: string): Promise<CardDAVContact[]> {
  const xml = await davFetch(
    'REPORT',
    bookUrl,
    auth,
    `<?xml version="1.0"?><C:addressbook-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><D:prop><D:getetag/><C:address-data/></D:prop></C:addressbook-query>`,
    '1',
  )
  const contacts: CardDAVContact[] = []
  // Fixed: capture group must not require leading whitespace
  const addrRe = /<(?:[^>]*:)?address-data(?:\s[^>]*)?>([^]*?)<\/(?:[^>]*:)?address-data>/gi
  let m
  while ((m = addrRe.exec(xml)) !== null) {
    const vcardText = m[1]
      .trim()
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#13;/g, '\r')
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
    const contact = parseVCard(vcardText)
    if (contact) contacts.push(contact)
  }
  return contacts
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

// Fetches contacts, optionally filtered to specific address book URLs
export async function fetchiCloudContacts(
  appleId: string,
  appPassword: string,
  selectedBookUrls?: string[], // undefined or empty = sync all
): Promise<CardDAVContact[]> {
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
    const bookContacts = await fetchContactsFromBook(book.url, auth)
    contacts.push(...bookContacts)
  }
  return contacts
}
