-- Local-only seed data, applied by `supabase db reset` after the migrations.
-- Powers the FSC-90 Item List reference screen (local live data). Never put
-- production data or secrets here.
--
-- IMPORTANT: ids and linkedin_post_id values below must NOT collide with the
-- pgTAP fixtures in supabase/tests/schema.test.sql (urn:li:activity:A/B, uuids
-- ...0001/0002, 1111..., 2222...) — those tests assert on specific ids and a
-- dedup collision, so reused values would break `pnpm db:test`.
--
-- best_author_degree is derived by trigger from item_sources; we insert the
-- source rows (with social_proof) and let the trigger set it. social_proof is
-- seeded for future FSC-106 realism but the dashboard never reads it.

-- Sensors (collective members running the capture extension) ------------------
insert into sensors (id, name, email, token_hash, consented_at) values
  ('a1000000-0000-4000-8000-000000000001', 'Camille Roy', 'camille.roy@hanabi.test', 'seed-hash-camille', now()),
  ('a1000000-0000-4000-8000-000000000002', 'Théo Marchand', 'theo.marchand@hanabi.test', 'seed-hash-theo', now());

-- Items ----------------------------------------------------------------------
-- Opportunities (default tab)
insert into items
  (id, linkedin_post_id, author_name, author_company, author_title, author_type,
   text, url, post_type, is_repost, original_author_name, hashtags,
   reaction_count, comment_count, posted_at, posted_at_raw, captured_at, seen_count,
   stream, domains, account, heat, summary, status)
values
  ('b1000000-0000-4000-8000-000000000001', 'urn:li:activity:seed-opp-1',
   'Jean Dupont', 'Acme Corp', 'Directeur des systèmes d''information', 'person',
   null, 'https://www.linkedin.com/feed/update/urn:li:activity:seed-opp-1', 'text',
   false, null, '{transformation,servicenow}', 128, 24,
   now() - interval '4 hours', '4h', now(), 6,
   'opportunity', '{servicenow,pmo}', 'Acme Corp', 'hot',
   'Acme Corp lance un vaste chantier de refonte ServiceNow et cherche un partenaire PMO pour cadrer la trajectoire sur 18 mois.', 'new'),

  ('b1000000-0000-4000-8000-000000000002', 'urn:li:activity:seed-opp-2',
   'Sophie Bernard', 'Globex', 'VP Transformation', 'person',
   null, 'https://www.linkedin.com/feed/update/urn:li:activity:seed-opp-2', 'text',
   false, null, '{genai}', 74, 11,
   now() - interval '2 days', '2j', now(), 4,
   'opportunity', '{gen_ai}', 'Globex', 'warm',
   'Globex évalue des cas d''usage GenAI pour son support interne — appel à retours d''expérience sur la mise à l''échelle.', 'new'),

  ('b1000000-0000-4000-8000-000000000003', 'urn:li:activity:seed-opp-3',
   'Marc Lefebvre', 'Initech', 'COO', 'person',
   null, 'https://www.linkedin.com/feed/update/urn:li:activity:seed-opp-3', 'text',
   false, null, '{powerplatform}', 32, 5,
   now() - interval '5 days', '5j', now(), 2,
   'opportunity', '{power_platform}', 'Initech', 'cold',
   'Initech industrialise ses automatisations Power Platform et internalise progressivement la gouvernance.', 'processed'),

  ('b1000000-0000-4000-8000-000000000004', 'urn:li:activity:seed-opp-4',
   'Léa Girard', 'Umbrella', 'Chargée de communication', 'person',
   null, 'https://www.linkedin.com/feed/update/urn:li:activity:seed-opp-4', 'text',
   true, 'Antoine Mercier', '{carveout}', 56, 9,
   now() - interval '1 day', '1j', now(), 3,
   'opportunity', '{carve_in_out}', 'Umbrella', 'warm',
   'Umbrella prépare la cession d''une business unit — un projet de carve-out avec séparation SI à la clé.', 'new'),

  -- Signals
  ('b1000000-0000-4000-8000-000000000005', 'urn:li:activity:seed-sig-1',
   'Acme Corp', 'Acme Corp', null, 'company',
   null, 'https://www.linkedin.com/feed/update/urn:li:activity:seed-sig-1', 'article',
   false, null, '{architecture}', 210, 41,
   now() - interval '6 hours', '6h', now(), 8,
   'signal', '{it_architecture}', 'Acme Corp', 'hot',
   'Acme Corp annonce la nomination d''un nouveau Chief Architect et une refonte de son socle applicatif.', 'new'),

  ('b1000000-0000-4000-8000-000000000006', 'urn:li:activity:seed-sig-2',
   'Nadia Haddad', 'Globex', 'Responsable Digital Workplace', 'person',
   null, 'https://www.linkedin.com/feed/update/urn:li:activity:seed-sig-2', 'text',
   false, null, '{digitalworkplace}', 47, 6,
   now() - interval '3 days', '3j', now(), 3,
   'signal', '{digital_workplace}', 'Globex', 'warm',
   'Globex déploie un nouvel intranet collaboratif et retravaille son expérience employé.', 'new'),

  ('b1000000-0000-4000-8000-000000000007', 'urn:li:activity:seed-sig-3',
   'Initech', 'Initech', null, 'company',
   null, 'https://www.linkedin.com/feed/update/urn:li:activity:seed-sig-3', 'image',
   false, null, '{}', 18, 2,
   now() - interval '9 days', '1sem', now(), 1,
   'signal', '{}', 'Initech', null,
   'Initech publie ses résultats trimestriels — croissance stable, pas d''annonce technologique majeure.', 'processed'),

  -- Trends (cross-account; account is null and exempt from the account filter)
  ('b1000000-0000-4000-8000-000000000008', 'urn:li:activity:seed-trend-1',
   'Tendance GenAI', null, null, 'person',
   null, 'https://www.linkedin.com/feed/update/urn:li:activity:seed-trend-1', 'text',
   false, null, '{genai,productmanagement}', 0, 0,
   now() - interval '8 hours', '8h', now(), 14,
   'trend', '{gen_ai,product_management}', null, 'hot',
   'Forte accélération des publications sur les copilotes métiers ce mois-ci, portée par plusieurs comptes suivis.', 'new'),

  ('b1000000-0000-4000-8000-000000000009', 'urn:li:activity:seed-trend-2',
   'Tendance Appels d''offres', null, null, 'person',
   null, 'https://www.linkedin.com/feed/update/urn:li:activity:seed-trend-2', 'text',
   false, null, '{rfp}', 0, 0,
   now() - interval '4 days', '4j', now(), 9,
   'trend', '{rfp}', null, 'warm',
   'Multiplication des appels d''offres publics autour de la modernisation des SI de collectivités.', 'new');

-- Warm-path sources (opportunities only — drives best_author_degree via trigger).
-- social_proof is the reveal holder (FSC-106); the dashboard never reads it.
insert into item_sources (item_id, sensor_id, author_degree, social_proof) values
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'first',
   'Camille Roy est en relation directe avec Jean Dupont'),
  ('b1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 'second',
   'Théo Marchand a 3 relations en commun avec Sophie Bernard');
