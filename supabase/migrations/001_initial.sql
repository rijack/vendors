-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Contacts ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  company          TEXT,
  category         TEXT,
  role             TEXT,
  location         TEXT,
  phone            TEXT,
  email            TEXT,
  macos_contact_id TEXT,
  contact_hash     TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_name    ON contacts(user_id, name);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(user_id, company);
CREATE INDEX IF NOT EXISTS idx_contacts_macos   ON contacts(macos_contact_id);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own their contacts"
  ON contacts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── Vendors ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name  TEXT NOT NULL,
  description   TEXT,
  website_url   TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendors_user_id ON vendors(user_id);
CREATE INDEX IF NOT EXISTS idx_vendors_name    ON vendors(user_id, company_name);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own their vendors"
  ON vendors FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── Vendor Categories (multi-value) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  category    TEXT NOT NULL,
  UNIQUE(vendor_id, category)
);

CREATE INDEX IF NOT EXISTS idx_vendor_categories_vendor ON vendor_categories(vendor_id);

ALTER TABLE vendor_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access vendor categories via vendor"
  ON vendor_categories FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM vendors WHERE vendors.id = vendor_categories.vendor_id
        AND vendors.user_id = auth.uid()
    )
  );

-- ─── Vendor ↔ Contact join (M:N) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  contact_id  UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  role_note   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(vendor_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_contacts_vendor  ON vendor_contacts(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_contacts_contact ON vendor_contacts(contact_id);

ALTER TABLE vendor_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access vendor contacts via vendor"
  ON vendor_contacts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM vendors WHERE vendors.id = vendor_contacts.vendor_id
        AND vendors.user_id = auth.uid()
    )
  );

-- ─── Vendor Assets ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_assets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id    UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  asset_type   TEXT NOT NULL CHECK(asset_type IN ('link', 'file')),
  label        TEXT,
  url          TEXT,
  storage_path TEXT,
  file_name    TEXT,
  mime_type    TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_assets_vendor ON vendor_assets(vendor_id);

ALTER TABLE vendor_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access vendor assets via vendor"
  ON vendor_assets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM vendors WHERE vendors.id = vendor_assets.vendor_id
        AND vendors.user_id = auth.uid()
    )
  );

-- ─── Interactions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vendor_id   UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  contact_id  UUID REFERENCES contacts(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK(status IN (
                'pending', 'intro_made', 'second_call_booked',
                'final_accepted', 'final_rejected', 'details'
              )),
  notes       TEXT,
  reminder_at TIMESTAMPTZ,
  reminded_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interactions_user_id ON interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_interactions_vendor  ON interactions(vendor_id);
CREATE INDEX IF NOT EXISTS idx_interactions_contact ON interactions(contact_id);
CREATE INDEX IF NOT EXISTS idx_interactions_status  ON interactions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_interactions_reminder
  ON interactions(reminder_at)
  WHERE reminder_at IS NOT NULL AND reminded_at IS NULL;

ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own their interactions"
  ON interactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── Claude Chat History ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claude_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context     TEXT NOT NULL,
  role        TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claude_messages_context
  ON claude_messages(user_id, context, created_at);

ALTER TABLE claude_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own their claude messages"
  ON claude_messages FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── Auto-update updated_at via triggers ───────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER vendors_updated_at
  BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER interactions_updated_at
  BEFORE UPDATE ON interactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
