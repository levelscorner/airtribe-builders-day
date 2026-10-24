-- Starter voices + cast presets (docs/13 §7–8 / Venus fixtures).

INSERT INTO voices (id, elevenlabs_voice_id, label, language_hint, stability, style, default_cast_name, is_preset)
VALUES
  ('warm_kid_female', 'mock_warm_kid_female', 'Warm kid-friendly female', 'Hindi, Hinglish', 0.4, 0.2, 'Mini', true),
  ('playful_young_male', 'mock_playful_young_male', 'Playful young male', 'Hinglish', 0.45, 0.35, 'Chintu', true),
  ('confident_presenter_female', 'mock_confident_presenter_female', 'Confident presenter female', 'Hinglish, English', 0.4, 0.25, 'Riya', true),
  ('deep_storyteller_male', 'mock_deep_storyteller_male', 'Deep storyteller male', 'Hindi, English', 0.55, 0.15, 'Narrator', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO cast_members (
  id, owner_user_id, name, role, identity_text, dna_chips, art_style,
  higgsfield_element_id, voice_id, version, status, is_preset
) VALUES
  (
    'preset_chintu', NULL, 'Chintu', 'mascot',
    'Chintu is an 8-year-old cartoon boy with a round face, short black hair, a small gap in his front teeth, a yellow kurta, and a red backpack worn on one shoulder.',
    '["8-year-old boy","round face","short black hair","yellow kurta","red backpack","gap-tooth smile"]'::jsonb,
    'bright-2d-cartoon', 'el_chintu', 'playful_young_male', 1, 'approved', true
  ),
  (
    'preset_mini', NULL, 'Mini', 'mascot',
    'Mini is an 8-year-old cartoon girl with a round face, two black braids tied with blue bands, bright curious eyes, a green frock over leggings, and a tiny star clip above her left ear.',
    '["8-year-old girl","two black braids","blue hair bands","green frock","star clip","curious eyes"]'::jsonb,
    'bright-2d-cartoon', 'el_mini', 'warm_kid_female', 1, 'approved', true
  ),
  (
    'preset_riya', NULL, 'Riya', 'presenter',
    'Riya is a young Indian woman presenter with a shoulder-length wavy black bob, warm brown eyes, small gold studs, a coral short-sleeve shirt, and a thin brass bangle on her right wrist.',
    '["young woman presenter","wavy black bob","warm brown eyes","coral shirt","gold studs","brass bangle"]'::jsonb,
    'clean-product-studio', 'el_riya', 'confident_presenter_female', 1, 'approved', true
  ),
  (
    'preset_narrator', NULL, 'Narrator', 'narrator',
    'The narrator is an unseen adult storyteller. No face, no body, and no character appears on screen.',
    '["unseen narrator","adult storyteller","no face on screen","no body on screen","steady pace"]'::jsonb,
    NULL, NULL, 'deep_storyteller_male', 1, 'approved', true
  )
ON CONFLICT (id) DO NOTHING;
