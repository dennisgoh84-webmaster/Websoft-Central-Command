<?php

// Central Command's backend is API-only (see routes/api.php). The React
// frontend is a separate app (../frontend) served by its own nginx
// container, which proxies /api/* to this backend — see
// frontend/nginx.conf and docker-compose.yml.
