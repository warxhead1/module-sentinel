-- Check for relationships with cross-language metadata
SELECT 
    r.type,
    r.metadata,
    fs.name as from_symbol,
    fs.file_path as from_file,
    ts.name as to_symbol,
    ts.file_path as to_file
FROM universal_relationships r
JOIN universal_symbols fs ON r.from_symbol_id = fs.id
JOIN universal_symbols ts ON r.to_symbol_id = ts.id
WHERE 
    r.metadata LIKE '%crossLanguage%'
    OR r.metadata LIKE '%grpc%'
    OR r.metadata LIKE '%http%'
    OR r.type IN ('spawns', 'invokes', 'communicates', 'binds_to')
LIMIT 20;

-- Check relationship types
SELECT type, COUNT(*) as count
FROM universal_relationships
GROUP BY type
ORDER BY count DESC;

-- Check for gRPC patterns in symbols
SELECT name, qualified_name, file_path, kind
FROM universal_symbols
WHERE 
    name LIKE '%Client%'
    OR name LIKE '%Service%'
    OR name LIKE '%grpc%'
    OR qualified_name LIKE '%grpc%'
LIMIT 20;
EOF < /dev/null