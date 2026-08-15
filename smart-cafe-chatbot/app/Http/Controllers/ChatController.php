<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class ChatController extends Controller
{
    /**
     * Menampilkan halaman UI Chatbot.
     */
    public function index()
    {
        return view('chat');
    }

    /**
     * Menerima pesan dari UI Laravel, mengirim ke server AI FastAPI (main.py)
     * via HTTP, dan mengembalikan jawaban bot ke UI.
     */
    public function sendMessage(Request $request)
    {
        // 1. Validasi input pesan dari user
        $request->validate([
            'message' => 'required|string'
        ]);

        $userMessage = $request->input('message');

        // 2. Kirim pesan ke server AI FastAPI (main.py, sudah harus jalan duluan
        // via `uvicorn main:app --port 8001`). Model FastText + MLP di-load sekali
        // saat server start, jadi tidak ada overhead cold-start per pesan lagi.
        //
        // CATATAN PORT: FastAPI dipasang di 8001, BUKAN 8000, karena 8000 sudah
        // dipakai Laravel sendiri (php artisan serve). Kalau FastAPI juga di 8000,
        // Http::post ini akan memanggil Laravel sendiri (404, tidak ada route
        // /predict di sini), bukan server AI.
        $response = Http::post('http://127.0.0.1:8001/predict', [
            'message' => $userMessage
        ]);

        // Jika request gagal (server AI mati/error), beri jawaban aman (fallback)
        if ($response->failed()) {
            $botReply = "Maaf kak, server AI kami sedang tidak merespon. Boleh coba ketik ulang pesannya? 😊";
            $intent = null;
            $confidence = null;
        } else {
            $json = $response->json();
            $botReply = $json['reply'];
            // intent & confidence diteruskan apa adanya -- dipakai frontend untuk
            // memutuskan kapan menampilkan widget menu, bukan sekadar bubble teks.
            $intent = $json['intent'] ?? null;
            $confidence = $json['confidence'] ?? null;
        }

        // 3. Kembalikan jawaban ke Laravel UI (format JSON untuk kebutuhan AJAX/Fetch di Frontend)
        return response()->json([
            'reply' => trim($botReply),
            'intent' => $intent,
            'confidence' => $confidence,
        ]);
    }

    /**
     * Proxy katalog menu dari server AI FastAPI ke frontend. Browser tidak
     * memanggil FastAPI (port 8001) langsung supaya tidak kena CORS -- pola
     * yang sama seperti sendMessage() di atas untuk /predict.
     */
    public function getMenu()
    {
        $response = Http::get('http://127.0.0.1:8001/menu');

        if ($response->failed()) {
            return response()->json(['items' => []]);
        }

        return response()->json($response->json());
    }
}