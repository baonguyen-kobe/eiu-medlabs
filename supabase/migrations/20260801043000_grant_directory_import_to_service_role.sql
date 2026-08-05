-- Allow the server-only production directory importer to reconcile courses,
-- personnel profiles and roles. No delete privilege is granted.
grant select, insert, update on public.profiles, public.user_roles, public.courses
  to service_role;
