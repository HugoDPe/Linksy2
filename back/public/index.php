<?php
use App\Kernel;
use Symfony\Component\ErrorHandler\Debug;
use Symfony\Component\HttpFoundation\Request;

require dirname(__DIR__).'/vendor/autoload.php';

if (!array_key_exists('APP_ENV', $_SERVER)) {
    $_SERVER['APP_ENV'] = $_ENV['APP_ENV'] ?? 'dev';
}
if (!array_key_exists('APP_DEBUG', $_SERVER)) {
    $_SERVER['APP_DEBUG'] = (bool)($_ENV['APP_DEBUG'] ?? true);
}

if ($_SERVER['APP_DEBUG']) {
    Debug::enable();
}

$kernel = new Kernel($_SERVER['APP_ENV'], (bool)$_SERVER['APP_DEBUG']);
$request = Request::createFromGlobals();
$response = $kernel->handle($request);
$response->send();
$kernel->terminate($request, $response);
