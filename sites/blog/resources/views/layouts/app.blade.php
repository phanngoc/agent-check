<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>@yield('title', 'Blog Demo - User Tracking')</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
    </style>
</head>
<body class="bg-gray-50">
    <nav class="bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg">
        <div class="container mx-auto px-4 py-4">
            <div class="flex items-center justify-between">
                <a href="{{ route('posts.index') }}" class="text-2xl font-bold hover:text-purple-200 transition">
                    📝 Blog Demo
                </a>
                <div class="flex items-center space-x-4">
                    <a href="{{ route('posts.index') }}" class="hover:text-purple-200 transition">Trang chủ</a>
                    <span class="text-purple-200">|</span>
                    @auth
                        <span class="text-sm">Xin chào, <strong>{{ Auth::user()->full_name ?? Auth::user()->name }}</strong></span>
                        <span class="text-purple-200">|</span>
                        <form method="POST" action="{{ route('logout') }}" class="inline">
                            @csrf
                            <button type="submit" class="hover:text-purple-200 transition">Đăng xuất</button>
                        </form>
                    @else
                        <a href="{{ route('login') }}" class="hover:text-purple-200 transition">Đăng nhập</a>
                        <span class="text-purple-200">|</span>
                        <a href="{{ route('register') }}" class="hover:text-purple-200 transition">Đăng ký</a>
                    @endauth
                    <span class="text-purple-200">|</span>
                    <span class="text-sm opacity-75">User Tracking Demo</span>
                </div>
            </div>
        </div>
    </nav>

    <main class="container mx-auto px-4 py-8">
        @if (session('success'))
            <div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
                {{ session('success') }}
            </div>
        @endif
        @yield('content')
    </main>

    <footer class="bg-gray-800 text-white mt-12 py-6">
        <div class="container mx-auto px-4 text-center">
            <p>&copy; {{ date('Y') }} Blog Demo - User Behavior Tracking System</p>
            <p class="text-sm text-gray-400 mt-2">Mọi tương tác đang được theo dõi để demo hệ thống tracking</p>
        </div>
    </footer>

    <!-- User Tracker Script -->
    <script src="{{ asset('tracker/tracker.js') }}"></script>
    <script>
        // Initialize tracker
        window.UserTracker.init({
            apiUrl: '{{ config('tracker.api_url') }}',
            userId: null,
            captureScreenshots: true,
            screenshotQuality: 0.8,
            maskSensitiveInputs: true,
            batchSize: 20,
            flushInterval: 3000,
            mouseMoveThrottle: 100,
            debug: true
        });
    </script>
</body>
</html>

