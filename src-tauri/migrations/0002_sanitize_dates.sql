UPDATE assets
SET captured_at = NULL
WHERE captured_at IS NOT NULL
  AND captured_at NOT GLOB '1*'
  AND captured_at NOT GLOB '2*';
