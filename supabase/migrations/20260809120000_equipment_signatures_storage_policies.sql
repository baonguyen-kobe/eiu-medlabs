-- 20260809120000_equipment_signatures_storage_policies.sql
-- SIGNATURE-A: Hardening access policies for private bucket 'equipment_signatures'.
-- Removes direct authenticated RLS policies on storage.objects for equipment_signatures.
-- All future signature storage operations will be mediated server-side via service_role.

drop policy if exists "Signatures are viewable by admin, staff, and the registrant" on storage.objects;
drop policy if exists "Signatures can be uploaded by admin, staff, and the registrant" on storage.objects;
drop policy if exists "Signatures can be deleted by admin, staff" on storage.objects;
