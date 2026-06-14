<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);

$config = require __DIR__ . '/../config.php';

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin && in_array($origin, $config['cors_allowed_origins'], true)) {
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

function get_pdo(array $config): PDO
{
    $db = $config['db'];
    $dsn = "mysql:host={$db['host']};port={$db['port']};dbname={$db['name']};charset={$db['charset']}";
    return new PDO($dsn, $db['user'], $db['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
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

function current_user(PDO $pdo, array $config): ?array
{
    $token = bearer_token();
    if (!$token) {
        return null;
    }
    $payload = jwt_decode($token, $config['jwt_secret']);
    if (!$payload || empty($payload['sub'])) {
        return null;
    }
    $stmt = $pdo->prepare('SELECT id, name, username, role, phone, is_active, created_at FROM users WHERE id = ? AND is_active = 1');
    $stmt->execute([(int)$payload['sub']]);
    $user = $stmt->fetch();
    return $user ?: null;
}

function require_auth(PDO $pdo, array $config): array
{
    $user = current_user($pdo, $config);
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

function resolve_vehicle_id(PDO $pdo, array $user, array $data): ?int
{
    if (!empty($data['vehicle_id'])) {
        $vehicleId = (int)$data['vehicle_id'];
        if ($user['role'] === 'owner') {
            $stmt = $pdo->prepare('SELECT id FROM vehicles WHERE id = ? AND is_active = 1');
            $stmt->execute([$vehicleId]);
        } else {
            $stmt = $pdo->prepare('SELECT id FROM vehicles WHERE id = ? AND is_active = 1 AND user_id = ?');
            $stmt->execute([$vehicleId, (int)$user['id']]);
        }
        return $stmt->fetch() ? $vehicleId : null;
    }

    $plate = trim((string)($data['plate_no'] ?? ''));
    if ($plate === '') {
        return null;
    }

    $ownerAssignedUser = $user['role'] === 'owner' && !empty($data['user_id']);
    $vehicleUserId = $ownerAssignedUser ? (int)$data['user_id'] : (int)$user['id'];
    $vehicleNo = trim((string)($data['vehicle_no'] ?? '')) ?: null;
    $driverName = trim((string)($data['driver_name'] ?? '')) ?: ($user['role'] === 'owner' ? null : $user['name']);

    $stmt = $pdo->prepare('SELECT id FROM vehicles WHERE plate_no = ? AND user_id = ? AND is_active = 1 ORDER BY id DESC LIMIT 1');
    $stmt->execute([$plate, $vehicleUserId]);
    $row = $stmt->fetch();
    if ($row) {
        return (int)$row['id'];
    }

    $stmt = $pdo->prepare('INSERT INTO vehicles (user_id, plate_no, vehicle_no, driver_name, description) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([$vehicleUserId, $plate, $vehicleNo, $driverName, 'เพิ่มจากหน้าบันทึกงานมือถือ']);
    return (int)$pdo->lastInsertId();
}

function create_auto_notifications(PDO $pdo, int $deliveryId, array $data): void
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
        $stmt = $pdo->prepare('INSERT INTO notifications (delivery_id, title, message, type) VALUES (?, ?, ?, ?)');
        $stmt->execute([$deliveryId, $alert[0], $alert[1], $alert[2]]);
    }
}

function build_delivery_filters(array $user): array
{
    $where = [];
    $params = [];
    if ($user['role'] !== 'owner') {
        $where[] = 'd.user_id = ?';
        $params[] = (int)$user['id'];
    }
    if (!empty($_GET['from'])) {
        $where[] = 'd.work_date >= ?';
        $params[] = $_GET['from'];
    }
    if (!empty($_GET['to'])) {
        $where[] = 'd.work_date <= ?';
        $params[] = $_GET['to'];
    }
    if (!empty($_GET['q'])) {
        $where[] = '(d.bill_no LIKE ? OR d.origin_place LIKE ? OR d.destination_place LIKE ? OR d.oil_type LIKE ? OR v.plate_no LIKE ?)';
        $q = '%' . $_GET['q'] . '%';
        array_push($params, $q, $q, $q, $q, $q);
    }
    return [$where ? 'WHERE ' . implode(' AND ', $where) : '', $params];
}

function delivery_select_sql(): string
{
    return "SELECT d.*, u.name AS employee_name, u.username AS employee_username, v.plate_no, v.vehicle_no, v.driver_name,
            CASE WHEN d.quantity_liters > 0 THEN ROUND(d.amount_baht / d.quantity_liters, 2) ELSE 0 END AS price_per_liter,
            CASE WHEN d.distance_km > 0 THEN ROUND(d.fuel_used_liters / d.distance_km * 100, 2) ELSE 0 END AS fuel_liters_per_100km
            FROM deliveries d
            LEFT JOIN users u ON u.id = d.user_id
            LEFT JOIN vehicles v ON v.id = d.vehicle_id";
}

try {
    $pdo = get_pdo($config);
    $path = normalize_path();
    $method = $_SERVER['REQUEST_METHOD'];

    if ($path === '/' && $method === 'GET') {
        json_response([
            'success' => true,
            'name' => 'OilOps PHP API',
            'time' => date('c'),
            'endpoints' => ['/auth/login', '/auth/me', '/deliveries', '/dashboard/stats', '/notifications', '/users', '/vehicles'],
        ]);
    }

    if ($path === '/auth/login' && $method === 'POST') {
        $data = body_json();
        $username = trim((string)($data['username'] ?? ''));
        $password = (string)($data['password'] ?? '');
        if ($username === '' || $password === '') {
            json_response(['success' => false, 'message' => 'กรุณากรอก username และ password'], 422);
        }
        $stmt = $pdo->prepare('SELECT * FROM users WHERE username = ? AND is_active = 1');
        $stmt->execute([$username]);
        $user = $stmt->fetch();
        if (!$user || !password_verify($password, $user['password_hash'])) {
            json_response(['success' => false, 'message' => 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'], 401);
        }
        $payload = [
            'sub' => (int)$user['id'],
            'role' => $user['role'],
            'iat' => time(),
            'exp' => time() + $config['jwt_expire_seconds'],
        ];
        $token = jwt_encode($payload, $config['jwt_secret']);
        unset($user['password_hash']);
        json_response(['success' => true, 'token' => $token, 'user' => $user]);
    }

    if ($path === '/auth/me' && $method === 'GET') {
        $user = require_auth($pdo, $config);
        json_response(['success' => true, 'user' => $user]);
    }

    if ($path === '/vehicles' && $method === 'GET') {
        $user = require_auth($pdo, $config);
        if ($user['role'] === 'owner') {
            $rows = $pdo->query('SELECT v.*, u.name AS employee_name, u.username AS employee_username,
                (SELECT COUNT(*) FROM deliveries d WHERE d.vehicle_id = v.id) AS total_trips
                FROM vehicles v
                LEFT JOIN users u ON u.id = v.user_id
                WHERE v.is_active = 1
                ORDER BY v.id DESC')->fetchAll();
        } else {
            $stmt = $pdo->prepare('SELECT v.*, u.name AS employee_name, u.username AS employee_username,
                (SELECT COUNT(*) FROM deliveries d WHERE d.vehicle_id = v.id) AS total_trips
                FROM vehicles v
                LEFT JOIN users u ON u.id = v.user_id
                WHERE v.is_active = 1 AND v.user_id = ?
                ORDER BY v.id DESC');
            $stmt->execute([(int)$user['id']]);
            $rows = $stmt->fetchAll();
        }
        json_response(['success' => true, 'data' => $rows]);
    }

    if ($path === '/vehicles' && $method === 'POST') {
        $user = require_auth($pdo, $config);
        $data = body_json();
        $plate = trim((string)($data['plate_no'] ?? ''));
        if ($plate === '') json_response(['success' => false, 'message' => 'กรุณากรอกทะเบียนรถ'], 422);
        $vehicleUserId = $user['role'] === 'owner' ? (!empty($data['user_id']) ? (int)$data['user_id'] : null) : (int)$user['id'];
        $driverName = trim((string)($data['driver_name'] ?? '')) ?: ($user['role'] === 'owner' ? null : $user['name']);
        $stmt = $pdo->prepare('INSERT INTO vehicles (user_id, plate_no, vehicle_no, driver_name, description) VALUES (?, ?, ?, ?, ?)');
        $stmt->execute([$vehicleUserId, $plate, val($data, 'vehicle_no'), $driverName, val($data, 'description')]);
        json_response(['success' => true, 'id' => (int)$pdo->lastInsertId()], 201);
    }

    if ($path === '/users' && $method === 'GET') {
        $user = require_auth($pdo, $config);
        require_owner($user);
        $rows = $pdo->query('SELECT id, name, username, role, phone, is_active, created_at FROM users ORDER BY id DESC')->fetchAll();
        json_response(['success' => true, 'data' => $rows]);
    }

    if ($path === '/users' && $method === 'POST') {
        $user = require_auth($pdo, $config);
        require_owner($user);
        $data = body_json();
        $name = trim((string)($data['name'] ?? ''));
        $username = trim((string)($data['username'] ?? ''));
        $password = (string)($data['password'] ?? 'password123');
        $role = in_array(($data['role'] ?? 'employee'), ['owner', 'employee'], true) ? $data['role'] : 'employee';
        if ($name === '' || $username === '') json_response(['success' => false, 'message' => 'กรุณากรอกชื่อและ username'], 422);
        $stmt = $pdo->prepare('INSERT INTO users (name, username, password_hash, role, phone) VALUES (?, ?, ?, ?, ?)');
        $stmt->execute([$name, $username, password_hash($password, PASSWORD_DEFAULT), $role, val($data, 'phone')]);
        json_response(['success' => true, 'id' => (int)$pdo->lastInsertId()], 201);
    }

    if (preg_match('#^/users/(\d+)/toggle$#', $path, $m) && $method === 'PATCH') {
        $user = require_auth($pdo, $config);
        require_owner($user);
        $id = (int)$m[1];
        if ($id === (int)$user['id']) json_response(['success' => false, 'message' => 'ไม่สามารถปิดใช้งานบัญชีตัวเองได้'], 422);
        $stmt = $pdo->prepare('UPDATE users SET is_active = IF(is_active = 1, 0, 1) WHERE id = ?');
        $stmt->execute([$id]);
        json_response(['success' => true]);
    }

    if ($path === '/deliveries' && $method === 'GET') {
        $user = require_auth($pdo, $config);
        [$whereSql, $params] = build_delivery_filters($user);
        $limit = min(max((int)($_GET['limit'] ?? 100), 1), 500);
        $stmt = $pdo->prepare(delivery_select_sql() . " {$whereSql} ORDER BY d.work_date DESC, d.id DESC LIMIT {$limit}");
        $stmt->execute($params);
        json_response(['success' => true, 'data' => $stmt->fetchAll()]);
    }

    if ($path === '/deliveries' && $method === 'POST') {
        $user = require_auth($pdo, $config);
        $data = body_json();
        $workDate = parse_date_or_null($data['work_date'] ?? null) ?: date('Y-m-d');
        $ownerCanAssign = $user['role'] === 'owner' && !empty($data['user_id']);
        $userId = $ownerCanAssign ? (int)$data['user_id'] : (int)$user['id'];
        $fields = [
            'user_id' => $userId,
            'vehicle_id' => resolve_vehicle_id($pdo, $user, $data),
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
        ];
        $sql = 'INSERT INTO deliveries (user_id, vehicle_id, work_date, report_month, bill_no, origin_place, load_date, oil_type, unload_date, destination_place, tank_weight, quantity_liters, amount_baht, distance_km, fuel_used_liters, wage_payer, payment_status, note) VALUES (:user_id, :vehicle_id, :work_date, :report_month, :bill_no, :origin_place, :load_date, :oil_type, :unload_date, :destination_place, :tank_weight, :quantity_liters, :amount_baht, :distance_km, :fuel_used_liters, :wage_payer, :payment_status, :note)';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($fields);
        $id = (int)$pdo->lastInsertId();
        create_auto_notifications($pdo, $id, $fields);
        json_response(['success' => true, 'id' => $id], 201);
    }

    if (preg_match('#^/deliveries/(\d+)$#', $path, $m) && $method === 'PUT') {
        $user = require_auth($pdo, $config);
        $id = (int)$m[1];
        $stmt = $pdo->prepare('SELECT * FROM deliveries WHERE id = ?');
        $stmt->execute([$id]);
        $old = $stmt->fetch();
        if (!$old) json_response(['success' => false, 'message' => 'ไม่พบรายการ'], 404);
        if ($user['role'] !== 'owner' && (int)$old['user_id'] !== (int)$user['id']) json_response(['success' => false, 'message' => 'ไม่มีสิทธิ์แก้ไขรายการนี้'], 403);
        $data = body_json();
        $workDate = parse_date_or_null($data['work_date'] ?? $old['work_date']) ?: $old['work_date'];
        $fields = [
            'vehicle_id' => resolve_vehicle_id($pdo, $user, $data) ?? $old['vehicle_id'],
            'work_date' => $workDate,
            'report_month' => substr($workDate, 0, 7),
            'bill_no' => val($data, 'bill_no', $old['bill_no']),
            'origin_place' => val($data, 'origin_place', $old['origin_place']),
            'load_date' => parse_date_or_null(val($data, 'load_date', $old['load_date'])),
            'oil_type' => val($data, 'oil_type', $old['oil_type']),
            'unload_date' => parse_date_or_null(val($data, 'unload_date', $old['unload_date'])),
            'destination_place' => val($data, 'destination_place', $old['destination_place']),
            'tank_weight' => (float)val($data, 'tank_weight', $old['tank_weight']),
            'quantity_liters' => (float)val($data, 'quantity_liters', $old['quantity_liters']),
            'amount_baht' => (float)val($data, 'amount_baht', $old['amount_baht']),
            'distance_km' => (float)val($data, 'distance_km', $old['distance_km']),
            'fuel_used_liters' => (float)val($data, 'fuel_used_liters', $old['fuel_used_liters']),
            'wage_payer' => val($data, 'wage_payer', $old['wage_payer']),
            'payment_status' => (($data['payment_status'] ?? $old['payment_status']) === 'paid') ? 'paid' : 'pending',
            'note' => val($data, 'note', $old['note']),
            'id' => $id,
        ];
        $sql = 'UPDATE deliveries SET vehicle_id=:vehicle_id, work_date=:work_date, report_month=:report_month, bill_no=:bill_no, origin_place=:origin_place, load_date=:load_date, oil_type=:oil_type, unload_date=:unload_date, destination_place=:destination_place, tank_weight=:tank_weight, quantity_liters=:quantity_liters, amount_baht=:amount_baht, distance_km=:distance_km, fuel_used_liters=:fuel_used_liters, wage_payer=:wage_payer, payment_status=:payment_status, note=:note WHERE id=:id';
        $pdo->prepare($sql)->execute($fields);
        json_response(['success' => true]);
    }

    if (preg_match('#^/deliveries/(\d+)$#', $path, $m) && $method === 'DELETE') {
        $user = require_auth($pdo, $config);
        $id = (int)$m[1];
        $stmt = $pdo->prepare('SELECT * FROM deliveries WHERE id = ?');
        $stmt->execute([$id]);
        $old = $stmt->fetch();
        if (!$old) json_response(['success' => false, 'message' => 'ไม่พบรายการ'], 404);
        if ($user['role'] !== 'owner' && (int)$old['user_id'] !== (int)$user['id']) json_response(['success' => false, 'message' => 'ไม่มีสิทธิ์ลบรายการนี้'], 403);
        $pdo->prepare('DELETE FROM deliveries WHERE id = ?')->execute([$id]);
        json_response(['success' => true]);
    }

    if (preg_match('#^/deliveries/(\d+)/upload$#', $path, $m) && $method === 'POST') {
        $user = require_auth($pdo, $config);
        $id = (int)$m[1];
        $stmt = $pdo->prepare('SELECT * FROM deliveries WHERE id = ?');
        $stmt->execute([$id]);
        $old = $stmt->fetch();
        if (!$old) json_response(['success' => false, 'message' => 'ไม่พบรายการ'], 404);
        if ($user['role'] !== 'owner' && (int)$old['user_id'] !== (int)$user['id']) json_response(['success' => false, 'message' => 'ไม่มีสิทธิ์อัปโหลดรายการนี้'], 403);
        if (empty($_FILES['photo'])) json_response(['success' => false, 'message' => 'กรุณาเลือกไฟล์รูป'], 422);
        $file = $_FILES['photo'];
        if ($file['error'] !== UPLOAD_ERR_OK) json_response(['success' => false, 'message' => 'อัปโหลดไม่สำเร็จ'], 400);
        if ($file['size'] > $config['upload_max_mb'] * 1024 * 1024) json_response(['success' => false, 'message' => 'ไฟล์ใหญ่เกินกำหนด'], 422);
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
        $pdo->prepare('UPDATE deliveries SET receipt_photo = ? WHERE id = ?')->execute([$relative, $id]);
        $pdo->prepare('INSERT INTO notifications (delivery_id, title, message, type) VALUES (?, ?, ?, ?)')->execute([$id, 'แนบรูปสำเร็จ', 'มีการแนบรูปบิลให้รายการนี้แล้ว', 'success']);
        json_response(['success' => true, 'path' => $relative]);
    }

    if ($path === '/dashboard/stats' && $method === 'GET') {
        $user = require_auth($pdo, $config);
        [$whereSql, $params] = build_delivery_filters($user);
        $summarySql = "SELECT COUNT(*) AS total_trips,
                       COALESCE(SUM(d.quantity_liters),0) AS total_liters,
                       COALESCE(SUM(d.amount_baht),0) AS total_amount,
                       COALESCE(AVG(NULLIF(d.amount_baht / NULLIF(d.quantity_liters,0), 0)),0) AS avg_price,
                       COALESCE(SUM(d.distance_km),0) AS total_distance,
                       COALESCE(SUM(d.fuel_used_liters),0) AS total_fuel_used,
                       COALESCE(SUM(CASE WHEN d.payment_status='pending' THEN 1 ELSE 0 END),0) AS pending_payments,
                       COALESCE(SUM(CASE WHEN d.receipt_photo IS NULL OR d.receipt_photo='' THEN 1 ELSE 0 END),0) AS missing_photos
                       FROM deliveries d LEFT JOIN vehicles v ON v.id = d.vehicle_id {$whereSql}";
        $stmt = $pdo->prepare($summarySql);
        $stmt->execute($params);
        $summary = $stmt->fetch();

        if ($user['role'] === 'owner') {
            $summary['active_employees'] = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role='employee' AND is_active=1")->fetchColumn();
            $summary['active_vehicles'] = (int)$pdo->query("SELECT COUNT(*) FROM vehicles WHERE is_active=1")->fetchColumn();
        } else {
            $vehicleCountStmt = $pdo->prepare('SELECT COUNT(*) FROM vehicles WHERE user_id = ? AND is_active=1');
            $vehicleCountStmt->execute([(int)$user['id']]);
            $summary['active_vehicles'] = (int)$vehicleCountStmt->fetchColumn();
        }

        $chartStmt = $pdo->prepare("SELECT d.work_date, COALESCE(SUM(d.quantity_liters),0) AS liters, COALESCE(SUM(d.amount_baht),0) AS amount, COUNT(*) AS trips
                                   FROM deliveries d LEFT JOIN vehicles v ON v.id = d.vehicle_id {$whereSql}
                                   GROUP BY d.work_date ORDER BY d.work_date ASC LIMIT 60");
        $chartStmt->execute($params);

        $typeStmt = $pdo->prepare("SELECT COALESCE(d.oil_type, 'ไม่ระบุ') AS name, COALESCE(SUM(d.quantity_liters),0) AS value, COUNT(*) AS trips
                                  FROM deliveries d LEFT JOIN vehicles v ON v.id = d.vehicle_id {$whereSql}
                                  GROUP BY d.oil_type ORDER BY value DESC LIMIT 10");
        $typeStmt->execute($params);

        $destStmt = $pdo->prepare("SELECT COALESCE(d.destination_place, 'ไม่ระบุ') AS destination, COALESCE(SUM(d.quantity_liters),0) AS liters, COALESCE(SUM(d.amount_baht),0) AS amount, COUNT(*) AS trips
                                  FROM deliveries d LEFT JOIN vehicles v ON v.id = d.vehicle_id {$whereSql}
                                  GROUP BY d.destination_place ORDER BY liters DESC LIMIT 8");
        $destStmt->execute($params);

        $latestStmt = $pdo->prepare(delivery_select_sql() . " {$whereSql} ORDER BY d.created_at DESC LIMIT 8");
        $latestStmt->execute($params);

        json_response([
            'success' => true,
            'summary' => $summary,
            'daily' => $chartStmt->fetchAll(),
            'oilTypes' => $typeStmt->fetchAll(),
            'topDestinations' => $destStmt->fetchAll(),
            'latest' => $latestStmt->fetchAll(),
            'serverTime' => date('c'),
        ]);
    }

    if ($path === '/notifications' && $method === 'GET') {
        $user = require_auth($pdo, $config);
        $where = '';
        $params = [];
        if ($user['role'] !== 'owner') {
            $where = 'WHERE n.user_id = ? OR d.user_id = ?';
            $params = [(int)$user['id'], (int)$user['id']];
        }
        $stmt = $pdo->prepare("SELECT n.*, d.bill_no, d.work_date FROM notifications n LEFT JOIN deliveries d ON d.id = n.delivery_id {$where} ORDER BY n.created_at DESC LIMIT 50");
        $stmt->execute($params);
        json_response(['success' => true, 'data' => $stmt->fetchAll()]);
    }

    if (preg_match('#^/notifications/(\d+)/read$#', $path, $m) && $method === 'PATCH') {
        require_auth($pdo, $config);
        $pdo->prepare('UPDATE notifications SET is_read = 1 WHERE id = ?')->execute([(int)$m[1]]);
        json_response(['success' => true]);
    }

    json_response(['success' => false, 'message' => 'ไม่พบ endpoint: ' . $path], 404);
} catch (PDOException $e) {
    json_response(['success' => false, 'message' => 'Database error', 'detail' => $e->getMessage()], 500);
} catch (Throwable $e) {
    json_response(['success' => false, 'message' => 'Server error', 'detail' => $e->getMessage()], 500);
}
