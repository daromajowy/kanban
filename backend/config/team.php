<?php

return [
    'board_id' => 'b9e5466d-b243-4660-b8a3-25271eadbed5',
    'password_reset_enabled' => (bool) env('TEAM_PASSWORD_RESET_ENABLED', false),
    'idle_seconds' => 24 * 60 * 60,
    'max_session_seconds' => 7 * 24 * 60 * 60,
    'max_document_bytes' => 2000000,
    'file_quota_bytes' => (int) env('TEAM_FILE_QUOTA_BYTES', 1073741824),
    'backup_directory' => env('TEAM_BACKUP_DIRECTORY', storage_path('app/private/backups')),
];
