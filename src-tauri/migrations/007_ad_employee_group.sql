-- Groupe FiEcho « Employé » aligné sur le groupe AD employe.
ALTER TABLE groups
    ADD COLUMN IF NOT EXISTS ad_sync_key VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_ad_sync_key
    ON groups (ad_sync_key)
    WHERE ad_sync_key IS NOT NULL;

INSERT INTO groups (name, description, ad_sync_key, is_active)
SELECT
    'Employé',
    'Membres du groupe Active Directory employe. L’appartenance suit l’AD.',
    'employe',
    TRUE
WHERE NOT EXISTS (SELECT 1 FROM groups WHERE ad_sync_key = 'employe');

INSERT INTO conversations (type, group_id)
SELECT 'group', g.id
FROM groups g
WHERE g.ad_sync_key = 'employe'
  AND NOT EXISTS (
      SELECT 1 FROM conversations c WHERE c.group_id = g.id AND c.type = 'group'
  );
