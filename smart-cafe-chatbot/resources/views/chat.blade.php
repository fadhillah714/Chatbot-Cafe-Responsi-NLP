<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cafebot — Smart Cafe Assistant</title>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="stylesheet" href="{{ asset('css/chat.css') }}">
</head>
<body>

    <header>
        <span class="brand">Cafebot</span>
        <button id="theme-toggle" class="status" type="button" aria-label="Ganti tema tampilan">
            <span class="theme-icon"></span>
            <span class="theme-label">Default Mode</span>
        </button>
    </header>
    <div class="top-fade"></div>

    <main id="chat-container" class="chat-column"></main>

    <footer>
        <div class="bottom-fade"></div>
        <div class="composer">
            <form id="chat-form">
                <textarea id="input" rows="1" placeholder="Tulis pesan…" aria-label="Pesan" autocomplete="off" required></textarea>
                <button type="submit" id="send-btn" aria-label="Kirim">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="12" y1="19" x2="12" y2="5"></line>
                        <polyline points="5 12 12 5 19 12"></polyline>
                    </svg>
                </button>
            </form>
        </div>
    </footer>

    <script>
        window.CHAT_MENU_URL = "{{ route('chat.menu') }}";
        window.CHAT_SEND_URL = "{{ route('chat.send') }}";
    </script>
    <script src="{{ asset('js/chat.js') }}"></script>
</body>
</html>
