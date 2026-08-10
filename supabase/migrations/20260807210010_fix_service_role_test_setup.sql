-- Restore service_role DML on essential tables for testing and backend operations
GRANT INSERT, UPDATE, DELETE ON public.rooms TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.equipment_catalog TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.courses TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.equipment_requests TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.audit_logs TO service_role;
