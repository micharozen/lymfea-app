-- On donne le token 'test-123' à la première réservation qu'on trouve
UPDATE bookings 
SET signature_token = 'test-123' 
WHERE id = (SELECT id FROM bookings LIMIT 1);