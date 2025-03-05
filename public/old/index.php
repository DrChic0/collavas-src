<?php
// Handle data storage and retrieval
$dataFile = 'drawing_data.json';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Handle incoming drawing data
    $currentData = json_decode(file_get_contents($dataFile), true);
    $newData = json_decode(file_get_contents('php://input'), true);

    // Merge new data with existing data
    $currentData[] = $newData;

    // Save the updated data
    file_put_contents($dataFile, json_encode($currentData, JSON_PRETTY_PRINT));
    echo 'Data saved successfully';
} else {
    // Serve the HTML file
    include 'main.html';
}
?>