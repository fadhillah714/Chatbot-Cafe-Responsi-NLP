<?php

use Illuminate\Support\Facades\Route;
// PASTIKAN BARIS DI BAWAH INI ADA DAN SAMA PERSIS:
use App\Http\Controllers\ChatController;

Route::get('/', [ChatController::class, 'index']);
Route::post('/send-message', [ChatController::class, 'sendMessage'])->name('chat.send');
Route::get('/menu', [ChatController::class, 'getMenu'])->name('chat.menu');