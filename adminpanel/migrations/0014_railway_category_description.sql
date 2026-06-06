UPDATE categories
SET description = 'रेलवे की हर नौकरी को गहराई से समझें — पद, कार्य, सैलरी, प्रमोशन और करियर पथ की पूरी जानकारी।',
    updated_at = CURRENT_TIMESTAMP
WHERE lower(slug) IN ('railway', 'indianrailway')
   OR lower(name) = 'railway'
   OR name LIKE '%रेलवे%';
