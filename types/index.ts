export interface Contact {
  id: string
  user_id: string
  name: string
  company: string | null
  category: string | null
  role: string | null
  location: string | null
  phone: string | null
  email: string | null
  macos_contact_id: string | null
  contact_hash: string | null
  created_at: string
  updated_at: string
}

export interface Vendor {
  id: string
  user_id: string
  company_name: string
  description: string | null
  website_url: string | null
  created_at: string
  updated_at: string
  categories?: string[]
  contacts?: Contact[]
  assets?: VendorAsset[]
}

export interface VendorCategory {
  id: string
  vendor_id: string
  category: string
}

export interface VendorContact {
  id: string
  vendor_id: string
  contact_id: string
  role_note: string | null
  created_at: string
  contact?: Contact
}

export type AssetType = 'link' | 'file'

export interface VendorAsset {
  id: string
  vendor_id: string
  asset_type: AssetType
  label: string | null
  url: string | null
  storage_path: string | null
  file_name: string | null
  mime_type: string | null
  created_at: string
}

export type InteractionStatus =
  | 'pending'
  | 'intro_made'
  | 'second_call_booked'
  | 'final_accepted'
  | 'final_rejected'
  | 'details'

export interface Interaction {
  id: string
  user_id: string
  vendor_id: string
  contact_id: string | null
  status: InteractionStatus
  notes: string | null
  reminder_at: string | null
  reminded_at: string | null
  created_at: string
  updated_at: string
  vendor?: Vendor
  contact?: Contact
}

export type ClaudeMessageRole = 'user' | 'assistant'

export interface ClaudeMessage {
  id: string
  user_id: string
  context: string
  role: ClaudeMessageRole
  content: string
  created_at: string
}

// Form types (input, no id/user_id/timestamps)
export type ContactInput = Omit<Contact, 'id' | 'user_id' | 'contact_hash' | 'created_at' | 'updated_at'>
export type VendorInput = Omit<Vendor, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'categories' | 'contacts' | 'assets'> & {
  categories?: string[]
}
export type InteractionInput = Omit<Interaction, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'vendor' | 'contact'>
