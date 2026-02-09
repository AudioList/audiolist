-- 008_mic_accessory_category.sql
-- Add mic_accessory category (was defined in frontend/scripts but missing from DB)

INSERT INTO categories (id, name, sort_order, icon, has_ppi, parent_category) VALUES
  ('mic_accessory', 'Microphone Accessories', 22, 'wrench', false, 'microphone');
