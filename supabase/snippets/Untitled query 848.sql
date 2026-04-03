SELECT grantee, privilege_type 
FROM information_schema.routine_privileges 
WHERE routine_name = 'get_booking_by_signature_token';