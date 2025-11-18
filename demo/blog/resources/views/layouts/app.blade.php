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
                <div class="space-x-4">
                    <a href="{{ route('posts.index') }}" class="hover:text-purple-200 transition">Trang chủ</a>
                    <span class="text-purple-200">|</span>
                    <span class="text-sm opacity-75">User Tracking Demo</span>
                </div>
            </div>
        </div>
    </nav>

    <main class="container mx-auto px-4 py-8">
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
            apiUrl: 'http://localhost:8085/api/v1',
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

