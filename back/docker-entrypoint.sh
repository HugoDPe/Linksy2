#!/bin/sh
set -e

# Fonction pour démarrer le serveur PHP
start_server() {
    if [ -n "$PHP_PID" ] && kill -0 "$PHP_PID" 2>/dev/null; then
        echo "🔄 Arrêt du serveur PHP (PID: $PHP_PID)..."
        kill "$PHP_PID"
        wait "$PHP_PID" 2>/dev/null || true
    fi
    
    echo "🚀 Démarrage du serveur PHP..."
    php -S 0.0.0.0:8000 -t public public/index.php &
    PHP_PID=$!
    echo "✅ Serveur PHP démarré (PID: $PHP_PID)"
}

# Démarrage initial du serveur
start_server

# Surveillance du fichier .env pour redémarrage automatique
echo "👁️  Surveillance de .env pour rechargement automatique..."
while inotifywait -e modify,create,delete,move .env 2>/dev/null; do
    echo "📝 Modification de .env détectée!"
    sleep 0.5  # Petit délai pour s'assurer que le fichier est complètement écrit
    start_server
done
