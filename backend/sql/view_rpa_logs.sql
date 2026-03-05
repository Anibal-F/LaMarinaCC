-- Ver últimos logs del RPA
SELECT 
    id,
    type,
    status,
    created_at,
    completed_at,
    error,
    LEFT(logs, 3000) as logs_preview  -- Primeros 3000 caracteres
FROM rpa_tasks
ORDER BY created_at DESC
LIMIT 5;

-- Ver el log completo de la última tarea
SELECT logs 
FROM rpa_tasks 
ORDER BY created_at DESC 
LIMIT 1;
