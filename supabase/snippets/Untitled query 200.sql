SELECT id, name, category 
FROM treatment_menus 
WHERE id::text = ANY(ARRAY['<ID_SOIN_1>', '<ID_SOIN_2>']);