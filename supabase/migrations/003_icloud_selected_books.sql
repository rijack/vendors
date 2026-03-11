ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS icloud_selected_books JSONB DEFAULT '[]'::jsonb;
