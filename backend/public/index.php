<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);

$autoloadCandidates = [
    __DIR__ . '/../vendor/autoload.php',
    __DIR__ . '/vendor/autoload.php',
];
foreach ($autoloadCandidates as $autoload) {
    if (is_file($autoload)) {
        require_once $autoload;
        break;
    }
}

if (!class_exists(MongoDB\Client::class)) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => false,
        'message' => 'MongoDB PHP library not installed. Run: composer require mongodb/mongodb',
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

use MongoDB\Client;
use MongoDB\Database;
use MongoDB\BSON\ObjectId;
use MongoDB\BSON\Regex;
use MongoDB\BSON\UTCDateTime;
use MongoDB\Exception\Exception as MongoException;

$config = require __DIR__ . '/../config.php';

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin && in_array($origin, $config['cors_allowed_origins'] ?? [], true)) {
    header("Access-Control-Allow-Origin: {$origin}");
} else {
    header('Access-Control-Allow-Origin: *');
}
header('Access-Control-Allow-Headers: Authorization, Content-Type, X-Requested-With');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function json_response($data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function get_mongo_db(array $config): Database
{
    // รองรับ config.php แบบใหม่ที่ใช้ key ชื่อ mongodb และยังรองรับของเก่า mongo
    $mongo = $config['mongodb'] ?? ($config['mongo'] ?? []);

    // บน Render ให้ ENV มาก่อนเสมอ
    $uri = getenv('MONGODB_URI') ?: ($mongo['uri'] ?? '');
    $dbName = getenv('MONGODB_DB') ?: ($mongo['db'] ?? 'oil_management_system');

    if (!$uri) {
        throw new RuntimeException('MONGODB_URI is not set');
    }
    if (!$dbName) {
        throw new RuntimeException('MONGODB_DB is not set');
    }

    $client = new Client($uri, [
        'serverSelectionTimeoutMS' => 5000,
    ]);

    return $client->selectDatabase($dbName);
}

function now_iso(): string
{
    return date('c');
}

function oid_or_null($id): ?ObjectId
{
    if ($id instanceof ObjectId) {
        return $id;
    }
    $id = trim((string)$id);
    if (!preg_match('/^[a-f0-9]{24}$/i', $id)) {
        return null;
    }
    try {
        return new ObjectId($id);
    } catch (Throwable $e) {
        return null;
    }
}

function mongo_to_array($value)
{
    if ($value instanceof ObjectId) {
        return (string)$value;
    }
    if ($value instanceof UTCDateTime) {
        return $value->toDateTime()->format('c');
    }
    if (is_object($value) && method_exists($value, 'getArrayCopy')) {
        $value = $value->getArrayCopy();
    }
    if (is_array($value)) {
        $out = [];
        foreach ($value as $key => $item) {
            $out[$key] = mongo_to_array($item);
        }
        if (isset($out['_id'])) {
            $out['id'] = (string)$out['_id'];
            unset($out['_id']);
        }
        return $out;
    }
    return $value;
}

function public_user($user): ?array
{
    if (!$user) {
        return null;
    }
    $arr = mongo_to_array($user);
    unset($arr['password_hash']);
    return $arr;
}

function body_json(): array
{
    $raw = file_get_contents('php://input');
    if (!$raw) {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function b64url_encode(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function b64url_decode(string $data): string
{
    $remainder = strlen($data) % 4;
    if ($remainder) {
        $data .= str_repeat('=', 4 - $remainder);
    }
    return base64_decode(strtr($data, '-_', '+/')) ?: '';
}

function jwt_encode(array $payload, string $secret): string
{
    $header = ['typ' => 'JWT', 'alg' => 'HS256'];
    $segments = [
        b64url_encode(json_encode($header)),
        b64url_encode(json_encode($payload, JSON_UNESCAPED_UNICODE)),
    ];
    $signature = hash_hmac('sha256', implode('.', $segments), $secret, true);
    $segments[] = b64url_encode($signature);
    return implode('.', $segments);
}

function jwt_decode(string $jwt, string $secret): ?array
{
    $parts = explode('.', $jwt);
    if (count($parts) !== 3) {
        return null;
    }
    [$head64, $payload64, $sig64] = $parts;
    $expected = b64url_encode(hash_hmac('sha256', $head64 . '.' . $payload64, $secret, true));
    if (!hash_equals($expected, $sig64)) {
        return null;
    }
    $payload = json_decode(b64url_decode($payload64), true);
    if (!is_array($payload)) {
        return null;
    }
    if (isset($payload['exp']) && time() > (int)$payload['exp']) {
        return null;
    }
    return $payload;
}

function bearer_token(): ?string
{
    $header = $_SERVER['HTTP_AUTHORIZATION']
        ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
        ?? $_SERVER['Authorization']
        ?? '';

    if (!$header && function_exists('getallheaders')) {
        foreach (getallheaders() as $key => $value) {
            if (strtolower($key) === 'authorization') {
                $header = $value;
                break;
            }
        }
    }

    if (preg_match('/Bearer\s+(.+)$/i', $header, $matches)) {
        return trim($matches[1]);
    }
    return null;
}

function current_user(Database $db, array $config): ?array
{
    $token = bearer_token();
    if (!$token) {
        return null;
    }
    $payload = jwt_decode($token, $config['jwt_secret']);
    if (!$payload || empty($payload['sub'])) {
        return null;
    }
    $oid = oid_or_null($payload['sub']);
    if (!$oid) {
        return null;
    }
    $user = $db->users->findOne([
        '_id' => $oid,
        'is_active' => 1,
    ], [
        'projection' => ['password_hash' => 0],
    ]);
    return public_user($user);
}

function require_auth(Database $db, array $config): array
{
    $user = current_user($db, $config);
    if (!$user) {
        json_response(['success' => false, 'message' => 'กรุณาเข้าสู่ระบบใหม่'], 401);
    }
    return $user;
}

function require_owner(array $user): void
{
    if (($user['role'] ?? '') !== 'owner') {
        json_response(['success' => false, 'message' => 'ไม่มีสิทธิ์สำหรับหน้านี้'], 403);
    }
}

function starts_with_safe(string $haystack, string $needle): bool
{
    return $needle === '' || strncmp($haystack, $needle, strlen($needle)) === 0;
}

function normalize_path(): string
{
    if (isset($_GET['route'])) {
        $route = trim((string)$_GET['route']);
        $path = $route === '' ? '/' : '/' . trim($route, '/');
    } else {
        $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';
        $scriptName = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '');
        $scriptDir = rtrim(str_replace('\\', '/', dirname($scriptName)), '/');

        if ($scriptName && starts_with_safe($path, $scriptName)) {
            $path = substr($path, strlen($scriptName));
        } elseif ($scriptDir && $scriptDir !== '/' && starts_with_safe($path, $scriptDir)) {
            $path = substr($path, strlen($scriptDir));
        }

        $path = '/' . trim($path, '/');
        if ($path === '/index.php') {
            $path = '/';
        }
        if (starts_with_safe($path, '/index.php/')) {
            $path = substr($path, strlen('/index.php'));
        }
    }

    // กันกรณี path หลุดมาพร้อม query string เช่น /index.php?route=/health
    if (str_contains($path, '?')) {
        $queryPart = parse_url($path, PHP_URL_QUERY);
        parse_str((string)$queryPart, $queryParams);
        if (!empty($queryParams['route'])) {
            $path = '/' . trim((string)$queryParams['route'], '/');
        } else {
            $path = parse_url($path, PHP_URL_PATH) ?: $path;
        }
    }

    if (starts_with_safe($path, '/api/')) {
        $path = substr($path, 4);
    } elseif ($path === '/api') {
        $path = '/';
    }
    return $path;
}

function parse_date_or_null($value): ?string
{
    if (!$value) return null;
    $ts = strtotime((string)$value);
    return $ts ? date('Y-m-d', $ts) : null;
}

function val(array $data, string $key, $default = null)
{
    return array_key_exists($key, $data) ? $data[$key] : $default;
}

function safe_regex(string $text): Regex
{
    return new Regex(preg_quote($text, '/'), 'i');
}

function find_user_public(Database $db, $id): ?array
{
    $oid = oid_or_null($id);
    if (!$oid) return null;
    return public_user($db->users->findOne(['_id' => $oid], ['projection' => ['password_hash' => 0]]));
}

function find_vehicle_public(Database $db, $id): ?array
{
    $oid = oid_or_null($id);
    if (!$oid) return null;
    return mongo_to_array($db->vehicles->findOne(['_id' => $oid]));
}

function resolve_vehicle_id(Database $db, array $user, array $data): ?string
{
    if (!empty($data['vehicle_id'])) {
        $oid = oid_or_null($data['vehicle_id']);
        if (!$oid) return null;

        $filter = ['_id' => $oid, 'is_active' => 1];
        if (($user['role'] ?? '') !== 'owner') {
            $filter['user_id'] = (string)$user['id'];
        }
        $vehicle = $db->vehicles->findOne($filter, ['projection' => ['_id' => 1]]);
        return $vehicle ? (string)$vehicle['_id'] : null;
    }

    $plate = trim((string)($data['plate_no'] ?? ''));
    if ($plate === '') {
        return null;
    }

    $ownerAssignedUser = ($user['role'] ?? '') === 'owner' && !empty($data['user_id']);
    $vehicleUserId = $ownerAssignedUser ? (string)$data['user_id'] : (string)$user['id'];
    $vehicleNo = trim((string)($data['vehicle_no'] ?? '')) ?: null;
    $driverName = trim((string)($data['driver_name'] ?? '')) ?: (($user['role'] ?? '') === 'owner' ? null : ($user['name'] ?? null));

    $row = $db->vehicles->findOne([
        'plate_no' => $plate,
        'user_id' => $vehicleUserId,
        'is_active' => 1,
    ], [
        'sort' => ['created_at' => -1],
        'projection' => ['_id' => 1],
    ]);
    if ($row) {
        return (string)$row['_id'];
    }

    $result = $db->vehicles->insertOne([
        'user_id' => $vehicleUserId,
        'plate_no' => $plate,
        'vehicle_no' => $vehicleNo,
        'driver_name' => $driverName,
        'description' => 'เพิ่มจากหน้าบันทึกงานมือถือ',
        'is_active' => 1,
        'created_at' => now_iso(),
        'updated_at' => now_iso(),
    ]);
    return (string)$result->getInsertedId();
}

function create_auto_notifications(Database $db, string $deliveryId, array $data): void
{
    $alerts = [];
    if ((float)($data['quantity_liters'] ?? 0) >= 280) {
        $alerts[] = ['ปริมาณน้ำมันสูงผิดปกติ', 'รายการนี้มีปริมาณน้ำมันตั้งแต่ 280 ลิตรขึ้นไป กรุณาตรวจสอบ', 'danger'];
    }
    if (($data['payment_status'] ?? 'pending') === 'pending') {
        $alerts[] = ['ยังไม่จ่ายค่าแรง', 'รายการนี้ยังเป็นสถานะรอจ่าย', 'warning'];
    }
    if (empty($data['receipt_photo'])) {
        $alerts[] = ['ยังไม่แนบรูปบิล', 'รายการนี้ยังไม่มีรูปบิลหรือเอกสารแนบ', 'info'];
    }
    foreach ($alerts as $alert) {
        $db->notifications->insertOne([
            'delivery_id' => $deliveryId,
            'title' => $alert[0],
            'message' => $alert[1],
            'type' => $alert[2],
            'is_read' => 0,
            'created_at' => now_iso(),
        ]);
    }
}

function build_delivery_filter(Database $db, array $user): array
{
    $filter = [];
    if (($user['role'] ?? '') !== 'owner') {
        $filter['user_id'] = (string)$user['id'];
    }
    if (!empty($_GET['from'])) {
        $filter['work_date']['$gte'] = parse_date_or_null($_GET['from']) ?: $_GET['from'];
    }
    if (!empty($_GET['to'])) {
        $filter['work_date']['$lte'] = parse_date_or_null($_GET['to']) ?: $_GET['to'];
    }
    if (!empty($_GET['q'])) {
        $q = trim((string)$_GET['q']);
        if ($q !== '') {
            $rx = safe_regex($q);
            $or = [
                ['bill_no' => $rx],
                ['origin_place' => $rx],
                ['destination_place' => $rx],
                ['oil_type' => $rx],
            ];

            $vehicleFilter = ['plate_no' => $rx, 'is_active' => 1];
            if (($user['role'] ?? '') !== 'owner') {
                $vehicleFilter['user_id'] = (string)$user['id'];
            }
            $vehicleIds = [];
            foreach ($db->vehicles->find($vehicleFilter, ['projection' => ['_id' => 1]]) as $v) {
                $vehicleIds[] = (string)$v['_id'];
            }
            if ($vehicleIds) {
                $or[] = ['vehicle_id' => ['$in' => $vehicleIds]];
            }
            $filter['$or'] = $or;
        }
    }
    return $filter;
}

function enrich_delivery(Database $db, $delivery): array
{
    $d = mongo_to_array($delivery);
    $employee = !empty($d['user_id']) ? find_user_public($db, $d['user_id']) : null;
    $vehicle = !empty($d['vehicle_id']) ? find_vehicle_public($db, $d['vehicle_id']) : null;

    $d['employee_name'] = $employee['name'] ?? null;
    $d['employee_username'] = $employee['username'] ?? null;
    $d['plate_no'] = $vehicle['plate_no'] ?? null;
    $d['vehicle_no'] = $vehicle['vehicle_no'] ?? null;
    $d['driver_name'] = $vehicle['driver_name'] ?? null;

    $quantity = (float)($d['quantity_liters'] ?? 0);
    $amount = (float)($d['amount_baht'] ?? 0);
    $distance = (float)($d['distance_km'] ?? 0);
    $fuelUsed = (float)($d['fuel_used_liters'] ?? 0);

    $d['price_per_liter'] = $quantity > 0 ? round($amount / $quantity, 2) : 0;
    $d['fuel_liters_per_100km'] = $distance > 0 ? round($fuelUsed / $distance * 100, 2) : 0;

    return $d;
}

function fetch_enriched_deliveries(Database $db, array $filter, array $options = []): array
{
    $rows = [];
    foreach ($db->deliveries->find($filter, $options) as $doc) {
        $rows[] = enrich_delivery($db, $doc);
    }
    return $rows;
}

function group_sum(array $rows, string $key, string $sumField, int $limit = 0): array
{
    $groups = [];
    foreach ($rows as $row) {
        $name = trim((string)($row[$key] ?? '')) ?: 'ไม่ระบุ';
        if (!isset($groups[$name])) {
            $groups[$name] = ['name' => $name, 'value' => 0.0, 'trips' => 0];
        }
        $groups[$name]['value'] += (float)($row[$sumField] ?? 0);
        $groups[$name]['trips']++;
    }
    $out = array_values($groups);
    usort($out, fn($a, $b) => $b['value'] <=> $a['value']);
    return $limit > 0 ? array_slice($out, 0, $limit) : $out;
}

try {
    $path = normalize_path();
    $method = $_SERVER['REQUEST_METHOD'];

    // ใช้เช็กก่อนว่า Render deploy ไฟล์ index.php ตัวนี้จริงหรือยัง โดยไม่ต้องต่อ DB
    if ($path === '/ping' && $method === 'GET') {
        json_response([
            'success' => true,
            'message' => 'pong',
            'build' => 'index-render-fixed-v4',
            'route' => $path,
            'time' => date('c'),
        ]);
    }

    $db = get_mongo_db($config);

    // ใช้เช็กว่าต่อ MongoDB Atlas ได้จริง
    if ($path === '/health' && $method === 'GET') {
        $db->command(['ping' => 1]);
        json_response([
            'success' => true,
            'message' => 'Backend connected to MongoDB successfully',
            'build' => 'index-render-fixed-v4',
            'database' => getenv('MONGODB_DB') ?: (($config['mongodb']['db'] ?? null) ?: ($config['mongo']['db'] ?? 'oil_management_system')),
            'route' => $path,
            'time' => date('c'),
        ]);
    }

    if ($path === '/' && $method === 'GET') {
        json_response([
            'success' => true,
            'name' => 'OilOps PHP API MongoDB',
            'build' => 'index-render-fixed-v4',
            'time' => date('c'),
            'endpoints' => ['/ping', '/health', '/auth/login', '/auth/me', '/deliveries', '/dashboard/stats', '/notifications', '/users', '/vehicles'],
        ]);
    }

    if ($path === '/auth/login' && $method === 'GET') {
        json_response([
            'success' => true,
            'message' => 'auth/login route found. Use POST with username and password to login.',
            'build' => 'index-render-fixed-v4',
            'route' => $path,
        ]);
    }

    if ($path === '/auth/login' && $method === 'POST') {
        $data = body_json();
        $username = trim((string)($data['username'] ?? ''));
        $password = (string)($data['password'] ?? '');
        if ($username === '' || $password === '') {
            json_response(['success' => false, 'message' => 'กรุณากรอก username และ password'], 422);
        }
        $userDoc = $db->users->findOne(['username' => $username, 'is_active' => 1]);
        $user = mongo_to_array($userDoc);
        if (!$user || empty($user['password_hash']) || !password_verify($password, $user['password_hash'])) {
            json_response(['success' => false, 'message' => 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'], 401);
        }
        $payload = [
            'sub' => (string)$user['id'],
            'role' => $user['role'],
            'iat' => time(),
            'exp' => time() + (int)$config['jwt_expire_seconds'],
        ];
        $token = jwt_encode($payload, $config['jwt_secret']);
        unset($user['password_hash']);
        json_response(['success' => true, 'token' => $token, 'user' => $user]);
    }

    if ($path === '/auth/me' && $method === 'GET') {
        $user = require_auth($db, $config);
        json_response(['success' => true, 'user' => $user]);
    }

    if ($path === '/vehicles' && $method === 'GET') {
        $user = require_auth($db, $config);
        $filter = ['is_active' => 1];
        if (($user['role'] ?? '') !== 'owner') {
            $filter['user_id'] = (string)$user['id'];
        }
        $rows = [];
        foreach ($db->vehicles->find($filter, ['sort' => ['created_at' => -1]]) as $v) {
            $row = mongo_to_array($v);
            $employee = !empty($row['user_id']) ? find_user_public($db, $row['user_id']) : null;
            $row['employee_name'] = $employee['name'] ?? null;
            $row['employee_username'] = $employee['username'] ?? null;
            $row['total_trips'] = $db->deliveries->countDocuments(['vehicle_id' => (string)$row['id']]);
            $rows[] = $row;
        }
        json_response(['success' => true, 'data' => $rows]);
    }

    if ($path === '/vehicles' && $method === 'POST') {
        $user = require_auth($db, $config);
        $data = body_json();
        $plate = trim((string)($data['plate_no'] ?? ''));
        if ($plate === '') json_response(['success' => false, 'message' => 'กรุณากรอกทะเบียนรถ'], 422);
        $vehicleUserId = ($user['role'] ?? '') === 'owner' ? (!empty($data['user_id']) ? (string)$data['user_id'] : null) : (string)$user['id'];
        $driverName = trim((string)($data['driver_name'] ?? '')) ?: (($user['role'] ?? '') === 'owner' ? null : ($user['name'] ?? null));
        $result = $db->vehicles->insertOne([
            'user_id' => $vehicleUserId,
            'plate_no' => $plate,
            'vehicle_no' => val($data, 'vehicle_no'),
            'driver_name' => $driverName,
            'description' => val($data, 'description'),
            'is_active' => 1,
            'created_at' => now_iso(),
            'updated_at' => now_iso(),
        ]);
        json_response(['success' => true, 'id' => (string)$result->getInsertedId()], 201);
    }

    if ($path === '/users' && $method === 'GET') {
        $user = require_auth($db, $config);
        require_owner($user);
        $rows = [];
        foreach ($db->users->find([], ['sort' => ['created_at' => -1], 'projection' => ['password_hash' => 0]]) as $doc) {
            $rows[] = mongo_to_array($doc);
        }
        json_response(['success' => true, 'data' => $rows]);
    }

    if ($path === '/users' && $method === 'POST') {
        $user = require_auth($db, $config);
        require_owner($user);
        $data = body_json();
        $name = trim((string)($data['name'] ?? ''));
        $username = trim((string)($data['username'] ?? ''));
        $password = (string)($data['password'] ?? 'password123');
        $role = in_array(($data['role'] ?? 'employee'), ['owner', 'employee'], true) ? $data['role'] : 'employee';
        if ($name === '' || $username === '') json_response(['success' => false, 'message' => 'กรุณากรอกชื่อและ username'], 422);
        if ($db->users->countDocuments(['username' => $username]) > 0) {
            json_response(['success' => false, 'message' => 'username นี้มีอยู่แล้ว'], 422);
        }
        $result = $db->users->insertOne([
            'name' => $name,
            'username' => $username,
            'password_hash' => password_hash($password, PASSWORD_DEFAULT),
            'role' => $role,
            'phone' => val($data, 'phone'),
            'is_active' => 1,
            'created_at' => now_iso(),
            'updated_at' => now_iso(),
        ]);
        json_response(['success' => true, 'id' => (string)$result->getInsertedId()], 201);
    }

    if (preg_match('#^/users/([^/]+)/toggle$#', $path, $m) && $method === 'PATCH') {
        $user = require_auth($db, $config);
        require_owner($user);
        $id = (string)$m[1];
        if ($id === (string)$user['id']) json_response(['success' => false, 'message' => 'ไม่สามารถปิดใช้งานบัญชีตัวเองได้'], 422);
        $oid = oid_or_null($id);
        if (!$oid) json_response(['success' => false, 'message' => 'id ไม่ถูกต้อง'], 422);
        $target = mongo_to_array($db->users->findOne(['_id' => $oid]));
        if (!$target) json_response(['success' => false, 'message' => 'ไม่พบผู้ใช้'], 404);
        $newStatus = ((int)($target['is_active'] ?? 1) === 1) ? 0 : 1;
        $db->users->updateOne(['_id' => $oid], ['$set' => ['is_active' => $newStatus, 'updated_at' => now_iso()]]);
        json_response(['success' => true]);
    }

    if ($path === '/deliveries' && $method === 'GET') {
        $user = require_auth($db, $config);
        $filter = build_delivery_filter($db, $user);
        $limit = min(max((int)($_GET['limit'] ?? 100), 1), 500);
        $rows = fetch_enriched_deliveries($db, $filter, ['sort' => ['work_date' => -1, 'created_at' => -1], 'limit' => $limit]);
        json_response(['success' => true, 'data' => $rows]);
    }

    if ($path === '/deliveries' && $method === 'POST') {
        $user = require_auth($db, $config);
        $data = body_json();
        $workDate = parse_date_or_null($data['work_date'] ?? null) ?: date('Y-m-d');
        $ownerCanAssign = ($user['role'] ?? '') === 'owner' && !empty($data['user_id']);
        $userId = $ownerCanAssign ? (string)$data['user_id'] : (string)$user['id'];
        $fields = [
            'user_id' => $userId,
            'vehicle_id' => resolve_vehicle_id($db, $user, $data),
            'work_date' => $workDate,
            'report_month' => substr($workDate, 0, 7),
            'bill_no' => val($data, 'bill_no'),
            'origin_place' => val($data, 'origin_place'),
            'load_date' => parse_date_or_null(val($data, 'load_date')),
            'oil_type' => val($data, 'oil_type'),
            'unload_date' => parse_date_or_null(val($data, 'unload_date')),
            'destination_place' => val($data, 'destination_place'),
            'tank_weight' => (float)val($data, 'tank_weight', 0),
            'quantity_liters' => (float)val($data, 'quantity_liters', 0),
            'amount_baht' => (float)val($data, 'amount_baht', 0),
            'distance_km' => (float)val($data, 'distance_km', 0),
            'fuel_used_liters' => (float)val($data, 'fuel_used_liters', 0),
            'wage_payer' => val($data, 'wage_payer'),
            'payment_status' => (($data['payment_status'] ?? 'pending') === 'paid') ? 'paid' : 'pending',
            'note' => val($data, 'note'),
            'receipt_photo' => val($data, 'receipt_photo'),
            'created_at' => now_iso(),
            'updated_at' => now_iso(),
        ];
        $result = $db->deliveries->insertOne($fields);
        $id = (string)$result->getInsertedId();
        create_auto_notifications($db, $id, $fields);
        json_response(['success' => true, 'id' => $id], 201);
    }

    if (preg_match('#^/deliveries/([^/]+)$#', $path, $m) && $method === 'PUT') {
        $user = require_auth($db, $config);
        $id = (string)$m[1];
        $oid = oid_or_null($id);
        if (!$oid) json_response(['success' => false, 'message' => 'id ไม่ถูกต้อง'], 422);
        $oldDoc = $db->deliveries->findOne(['_id' => $oid]);
        $old = mongo_to_array($oldDoc);
        if (!$old) json_response(['success' => false, 'message' => 'ไม่พบรายการ'], 404);
        if (($user['role'] ?? '') !== 'owner' && (string)$old['user_id'] !== (string)$user['id']) json_response(['success' => false, 'message' => 'ไม่มีสิทธิ์แก้ไขรายการนี้'], 403);
        $data = body_json();
        $workDate = parse_date_or_null($data['work_date'] ?? ($old['work_date'] ?? null)) ?: ($old['work_date'] ?? date('Y-m-d'));
        $vehicleId = resolve_vehicle_id($db, $user, $data) ?? ($old['vehicle_id'] ?? null);
        $fields = [
            'vehicle_id' => $vehicleId,
            'work_date' => $workDate,
            'report_month' => substr($workDate, 0, 7),
            'bill_no' => val($data, 'bill_no', $old['bill_no'] ?? null),
            'origin_place' => val($data, 'origin_place', $old['origin_place'] ?? null),
            'load_date' => parse_date_or_null(val($data, 'load_date', $old['load_date'] ?? null)),
            'oil_type' => val($data, 'oil_type', $old['oil_type'] ?? null),
            'unload_date' => parse_date_or_null(val($data, 'unload_date', $old['unload_date'] ?? null)),
            'destination_place' => val($data, 'destination_place', $old['destination_place'] ?? null),
            'tank_weight' => (float)val($data, 'tank_weight', $old['tank_weight'] ?? 0),
            'quantity_liters' => (float)val($data, 'quantity_liters', $old['quantity_liters'] ?? 0),
            'amount_baht' => (float)val($data, 'amount_baht', $old['amount_baht'] ?? 0),
            'distance_km' => (float)val($data, 'distance_km', $old['distance_km'] ?? 0),
            'fuel_used_liters' => (float)val($data, 'fuel_used_liters', $old['fuel_used_liters'] ?? 0),
            'wage_payer' => val($data, 'wage_payer', $old['wage_payer'] ?? null),
            'payment_status' => (($data['payment_status'] ?? ($old['payment_status'] ?? 'pending')) === 'paid') ? 'paid' : 'pending',
            'note' => val($data, 'note', $old['note'] ?? null),
            'updated_at' => now_iso(),
        ];
        $db->deliveries->updateOne(['_id' => $oid], ['$set' => $fields]);
        json_response(['success' => true]);
    }

    if (preg_match('#^/deliveries/([^/]+)$#', $path, $m) && $method === 'DELETE') {
        $user = require_auth($db, $config);
        $id = (string)$m[1];
        $oid = oid_or_null($id);
        if (!$oid) json_response(['success' => false, 'message' => 'id ไม่ถูกต้อง'], 422);
        $old = mongo_to_array($db->deliveries->findOne(['_id' => $oid]));
        if (!$old) json_response(['success' => false, 'message' => 'ไม่พบรายการ'], 404);
        if (($user['role'] ?? '') !== 'owner' && (string)$old['user_id'] !== (string)$user['id']) json_response(['success' => false, 'message' => 'ไม่มีสิทธิ์ลบรายการนี้'], 403);
        $db->deliveries->deleteOne(['_id' => $oid]);
        json_response(['success' => true]);
    }

    if (preg_match('#^/deliveries/([^/]+)/upload$#', $path, $m) && $method === 'POST') {
        $user = require_auth($db, $config);
        $id = (string)$m[1];
        $oid = oid_or_null($id);
        if (!$oid) json_response(['success' => false, 'message' => 'id ไม่ถูกต้อง'], 422);
        $old = mongo_to_array($db->deliveries->findOne(['_id' => $oid]));
        if (!$old) json_response(['success' => false, 'message' => 'ไม่พบรายการ'], 404);
        if (($user['role'] ?? '') !== 'owner' && (string)$old['user_id'] !== (string)$user['id']) json_response(['success' => false, 'message' => 'ไม่มีสิทธิ์อัปโหลดรายการนี้'], 403);
        if (empty($_FILES['photo'])) json_response(['success' => false, 'message' => 'กรุณาเลือกไฟล์รูป'], 422);
        $file = $_FILES['photo'];
        if ($file['error'] !== UPLOAD_ERR_OK) json_response(['success' => false, 'message' => 'อัปโหลดไม่สำเร็จ'], 400);
        if ($file['size'] > (int)$config['upload_max_mb'] * 1024 * 1024) json_response(['success' => false, 'message' => 'ไฟล์ใหญ่เกินกำหนด'], 422);
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = finfo_file($finfo, $file['tmp_name']);
        finfo_close($finfo);
        $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
        if (!isset($allowed[$mime])) json_response(['success' => false, 'message' => 'รองรับเฉพาะ JPG, PNG, WEBP'], 422);
        $dir = __DIR__ . '/uploads';
        if (!is_dir($dir)) mkdir($dir, 0775, true);
        $name = 'bill_' . $id . '_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $allowed[$mime];
        $dest = $dir . '/' . $name;
        if (!move_uploaded_file($file['tmp_name'], $dest)) json_response(['success' => false, 'message' => 'ไม่สามารถบันทึกไฟล์ได้'], 500);
        $relative = '/uploads/' . $name;
        $db->deliveries->updateOne(['_id' => $oid], ['$set' => ['receipt_photo' => $relative, 'updated_at' => now_iso()]]);
        $db->notifications->insertOne([
            'delivery_id' => $id,
            'title' => 'แนบรูปสำเร็จ',
            'message' => 'มีการแนบรูปบิลให้รายการนี้แล้ว',
            'type' => 'success',
            'is_read' => 0,
            'created_at' => now_iso(),
        ]);
        json_response(['success' => true, 'path' => $relative]);
    }

    if ($path === '/dashboard/stats' && $method === 'GET') {
        $user = require_auth($db, $config);
        $filter = build_delivery_filter($db, $user);
        $rows = fetch_enriched_deliveries($db, $filter, ['sort' => ['work_date' => 1]]);

        $summary = [
            'total_trips' => count($rows),
            'total_liters' => 0,
            'total_amount' => 0,
            'avg_price' => 0,
            'total_distance' => 0,
            'total_fuel_used' => 0,
            'pending_payments' => 0,
            'missing_photos' => 0,
        ];
        $priceSum = 0;
        $priceCount = 0;
        $dailyMap = [];
        $destMap = [];
        foreach ($rows as $row) {
            $liters = (float)($row['quantity_liters'] ?? 0);
            $amount = (float)($row['amount_baht'] ?? 0);
            $distance = (float)($row['distance_km'] ?? 0);
            $fuel = (float)($row['fuel_used_liters'] ?? 0);
            $summary['total_liters'] += $liters;
            $summary['total_amount'] += $amount;
            $summary['total_distance'] += $distance;
            $summary['total_fuel_used'] += $fuel;
            if (($row['payment_status'] ?? 'pending') === 'pending') $summary['pending_payments']++;
            if (empty($row['receipt_photo'])) $summary['missing_photos']++;
            if ($liters > 0) {
                $priceSum += $amount / $liters;
                $priceCount++;
            }
            $date = $row['work_date'] ?? 'ไม่ระบุ';
            if (!isset($dailyMap[$date])) $dailyMap[$date] = ['work_date' => $date, 'liters' => 0, 'amount' => 0, 'trips' => 0];
            $dailyMap[$date]['liters'] += $liters;
            $dailyMap[$date]['amount'] += $amount;
            $dailyMap[$date]['trips']++;

            $dest = trim((string)($row['destination_place'] ?? '')) ?: 'ไม่ระบุ';
            if (!isset($destMap[$dest])) $destMap[$dest] = ['destination' => $dest, 'liters' => 0, 'amount' => 0, 'trips' => 0];
            $destMap[$dest]['liters'] += $liters;
            $destMap[$dest]['amount'] += $amount;
            $destMap[$dest]['trips']++;
        }
        $summary['avg_price'] = $priceCount > 0 ? round($priceSum / $priceCount, 2) : 0;

        if (($user['role'] ?? '') === 'owner') {
            $summary['active_employees'] = $db->users->countDocuments(['role' => 'employee', 'is_active' => 1]);
            $summary['active_vehicles'] = $db->vehicles->countDocuments(['is_active' => 1]);
        } else {
            $summary['active_vehicles'] = $db->vehicles->countDocuments(['user_id' => (string)$user['id'], 'is_active' => 1]);
        }

        $daily = array_values($dailyMap);
        usort($daily, fn($a, $b) => strcmp($a['work_date'], $b['work_date']));
        $daily = array_slice($daily, -60);

        $oilTypes = group_sum($rows, 'oil_type', 'quantity_liters', 10);

        $topDestinations = array_values($destMap);
        usort($topDestinations, fn($a, $b) => $b['liters'] <=> $a['liters']);
        $topDestinations = array_slice($topDestinations, 0, 8);

        $latest = fetch_enriched_deliveries($db, $filter, ['sort' => ['created_at' => -1], 'limit' => 8]);

        json_response([
            'success' => true,
            'summary' => $summary,
            'daily' => $daily,
            'oilTypes' => $oilTypes,
            'topDestinations' => $topDestinations,
            'latest' => $latest,
            'serverTime' => date('c'),
        ]);
    }

    if ($path === '/notifications' && $method === 'GET') {
        $user = require_auth($db, $config);
        $filter = [];
        if (($user['role'] ?? '') !== 'owner') {
            $deliveryIds = [];
            foreach ($db->deliveries->find(['user_id' => (string)$user['id']], ['projection' => ['_id' => 1]]) as $d) {
                $deliveryIds[] = (string)$d['_id'];
            }
            $filter = ['$or' => [
                ['user_id' => (string)$user['id']],
                ['delivery_id' => ['$in' => $deliveryIds]],
            ]];
        }
        $rows = [];
        foreach ($db->notifications->find($filter, ['sort' => ['created_at' => -1], 'limit' => 50]) as $n) {
            $row = mongo_to_array($n);
            if (!empty($row['delivery_id'])) {
                $delivery = mongo_to_array($db->deliveries->findOne(['_id' => oid_or_null($row['delivery_id'])]));
                $row['bill_no'] = $delivery['bill_no'] ?? null;
                $row['work_date'] = $delivery['work_date'] ?? null;
            }
            $rows[] = $row;
        }
        json_response(['success' => true, 'data' => $rows]);
    }

    if (preg_match('#^/notifications/([^/]+)/read$#', $path, $m) && $method === 'PATCH') {
        require_auth($db, $config);
        $oid = oid_or_null($m[1]);
        if (!$oid) json_response(['success' => false, 'message' => 'id ไม่ถูกต้อง'], 422);
        $db->notifications->updateOne(['_id' => $oid], ['$set' => ['is_read' => 1, 'updated_at' => now_iso()]]);
        json_response(['success' => true]);
    }

    json_response(['success' => false, 'message' => 'ไม่พบ endpoint: ' . $path], 404);
} catch (MongoException $e) {
    json_response(['success' => false, 'message' => 'Database error', 'detail' => $e->getMessage()], 500);
} catch (Throwable $e) {
    json_response(['success' => false, 'message' => 'Server error', 'detail' => $e->getMessage()], 500);
}
