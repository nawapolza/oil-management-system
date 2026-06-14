<?php
require_once __DIR__ . '/vendor/autoload.php';
$config = require __DIR__ . '/config.php';

$client = new MongoDB\Client($config['mongo']['uri']);
$db = $client->selectDatabase($config['mongo']['db']);

$db->users->createIndex(['username' => 1], ['unique' => true]);
$db->deliveries->createIndex(['user_id' => 1, 'work_date' => -1]);
$db->deliveries->createIndex(['vehicle_id' => 1]);
$db->vehicles->createIndex(['user_id' => 1, 'plate_no' => 1]);
$db->notifications->createIndex(['delivery_id' => 1, 'created_at' => -1]);

$username = getenv('OWNER_USERNAME') ?: 'owner';
$password = getenv('OWNER_PASSWORD') ?: 'password123';
$name = getenv('OWNER_NAME') ?: 'เจ้าของระบบ';

$exists = $db->users->findOne(['username' => $username]);
if ($exists) {
    echo "Owner already exists: {$username}\n";
    exit;
}

$result = $db->users->insertOne([
    'name' => $name,
    'username' => $username,
    'password_hash' => password_hash($password, PASSWORD_DEFAULT),
    'role' => 'owner',
    'phone' => null,
    'is_active' => 1,
    'created_at' => date('c'),
    'updated_at' => date('c'),
]);

echo "Created owner user\n";
echo "username: {$username}\n";
echo "password: {$password}\n";
echo "id: " . (string)$result->getInsertedId() . "\n";
