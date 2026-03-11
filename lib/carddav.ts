export interface CardDAVContact {
  uid: string
  name: string
  company: string | null
  role: string | null
  phone: string | null
  email: string | null
  location: string | null
}

function basicAuth(appleId: string, appPassword: string): string {
  return 'Basic ' + Buffer.from(`${appleId}:${appPassword}`).toString('base64')
}

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
      headers: {
        Authorization: auth,
        'Content-Type': 'application/xml; charset=utf-8',
        Depth: depth,
      },
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
      throw new Error('Invalid Apple ID or app-specific password (401 Unauthorized)')
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
  const re = /<(?:[^>]*:)?response(?:\s[^>]*)?>(\s[\s\S]*?)<\/(?:[^>]*:)?response>/gi
  let m
  while ((m = re.exec(xml)) !== null) results.push(m[1])
  return results
}

async function resolveAddressBookHome(auth: string): Promise<string> {
  // iCloud's well-known endpoint redirects (via GET) to the user-specific CardDAV root.
  // We use GET + redirect:follow so fetch resolves the final URL automatically.
  const getRes = await fetch('https://contacts.icloud.com/.well-known/carddav', {
    method: 'GET',
    headers: { Authorization: auth },
    redirect: 'follow',
  })

  if (getRes.status === 401) {
    throw new Error('Invalid Apple ID or app-specific password (401 Unauthorized)')
  }

  // The final URL after redirects is the user's CardDAV root
  // e.g. https://contacts.icloud.com/1234567890/carddav/
  const rootUrl = getRes.url

  if (!rootUrl || rootUrl.includes('.well-known')) {
    throw new Error(
      `iCloud CardDAV: discovery redirect failed — ended up at ${rootUrl}. Check your Apple ID and app-specific password.`,
    )
  }

  // Ask this root for the addressbook-home-set
  const xml = await davFetch(
    'PROPFIND',
    rootUrl,
    auth,
    `<?xml version="1.0"?><D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><D:prop><C:addressbook-home-set/></D:prop></D:propfind>`,
  )
  const homeTag = xmlTag(xml, 'addressbook-home-set')
  const homeHref = homeTag ? xmlHref(homeTag) : null

  // Fall back to rootUrl itself if addressbook-home-set isn't exposed
  if (!homeHref) return rootUrl

  return homeHref.startsWith('http') ? homeHref : `https://contacts.icloud.com${homeHref}`
}

async function listAddressBooks(homeUrl: string, auth: string): Promise<string[]> {
  const xml = await davFetch(
    'PROPFIND',
    homeUrl,
    auth,
    `<?xml version="1.0"?><D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><D:prop><D:resourcetype/><D:displayname/></D:prop></D:propfind>`,
    '1',
  )
  const books: string[] = []
  for (const resp of xmlResponses(xml)) {
    if (!resp.includes('addressbook')) continue
    const href = xmlHref(resp)
    if (!href) continue
    const url = href.startsWith('http') ? href : `https://contacts.icloud.com${href}`
    if (url !== homeUrl) books.push(url)
  }
  return books.length > 0 ? books : [homeUrl]
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

export async function fetchiCloudContacts(
  appleId: string,
  appPassword: string,
): Promise<CardDAVContact[]> {
  const auth = basicAuth(appleId, appPassword)
  const homeUrl = await resolveAddressBookHome(auth)
  const books = await listAddressBooks(homeUrl, auth)

  const contacts: CardDAVContact[] = []
  for (const bookUrl of books) {
    const xml = await davFetch(
      'REPORT',
      bookUrl,
      auth,
      `<?xml version="1.0"?><C:addressbook-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><D:prop><D:getetag/><C:address-data/></D:prop></C:addressbook-query>`,
      '1',
    )
    const addrRe = /<(?:[^>]*:)?address-data(?:\s[^>]*)?>(\s[\s\S]*?)<\/(?:[^>]*:)?address-data>/gi
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
  }

  return contacts
}
