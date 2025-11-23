@extends('layouts.app')

@section('title', 'Danh sách bài viết')

@section('content')
<div class="max-w-6xl mx-auto">
    <div class="mb-8">
        <h1 class="text-4xl font-bold text-gray-800 mb-4">📚 Danh sách bài viết</h1>
        <p class="text-gray-600">Khám phá các bài viết thú vị và tương tác để xem hệ thống tracking hoạt động</p>
    </div>

    @if($posts->count() > 0)
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            @foreach($posts as $post)
                <article class="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow duration-300">
                    <div class="p-6">
                        <div class="mb-4">
                            <span class="text-sm text-purple-600 font-semibold">{{ $post->author }}</span>
                            <span class="text-gray-400 mx-2">•</span>
                            <span class="text-sm text-gray-500">{{ $post->published_at->format('d/m/Y') }}</span>
                        </div>
                        
                        <h2 class="text-xl font-bold text-gray-800 mb-3 hover:text-purple-600 transition">
                            <a href="{{ route('posts.show', $post->slug) }}" class="block">
                                {{ $post->title }}
                            </a>
                        </h2>
                        
                        @if($post->excerpt)
                            <p class="text-gray-600 mb-4 line-clamp-3">{{ $post->excerpt }}</p>
                        @else
                            <p class="text-gray-600 mb-4 line-clamp-3">{{ Str::limit(strip_tags($post->content), 150) }}</p>
                        @endif
                        
                        <a href="{{ route('posts.show', $post->slug) }}" 
                           class="inline-block bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition">
                            Đọc thêm →
                        </a>
                    </div>
                </article>
            @endforeach
        </div>

        <div class="mt-8">
            {{ $posts->links() }}
        </div>
    @else
        <div class="bg-white rounded-lg shadow-md p-8 text-center">
            <p class="text-gray-600 text-lg">Chưa có bài viết nào được xuất bản.</p>
        </div>
    @endif

    <!-- Interactive Demo Section -->
    <div class="mt-12 bg-white rounded-lg shadow-md p-6">
        <h2 class="text-2xl font-bold text-gray-800 mb-4">🎯 Demo Tracking</h2>
        <p class="text-gray-600 mb-4">Thử các tương tác sau để xem hệ thống tracking hoạt động:</p>
        
        <div class="space-y-4">
            <div class="flex flex-wrap gap-3">
                <button onclick="alert('Button clicked!')" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition">
                    Click Me
                </button>
                <button onclick="showDemoToast('Toast notification!')" class="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition">
                    Show Toast
                </button>
                <button onclick="toggleDemoSection()" class="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600 transition">
                    Toggle Section
                </button>
            </div>

            <div id="demoSection" class="hidden mt-4 p-4 bg-gray-100 rounded">
                <h3 class="font-bold mb-2">Section đã được toggle!</h3>
                <p class="text-gray-600">Mọi tương tác đang được tracking.</p>
            </div>

            <form id="demoForm" class="mt-4 space-y-3">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Tên của bạn:</label>
                    <input type="text" name="name" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Email:</label>
                    <input type="email" name="email" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500">
                </div>
                <button type="submit" class="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 transition">
                    Gửi Form
                </button>
            </form>
        </div>
    </div>

    <!-- Scroll Test Area -->
    <div class="mt-8 bg-gradient-to-b from-orange-200 to-pink-200 rounded-lg p-8 text-center" style="min-height: 800px;">
        <h2 class="text-2xl font-bold text-gray-800 mb-4">📜 Scroll Test Area</h2>
        <p class="text-gray-700 mb-8">Cuộn xuống để test scroll tracking!</p>
        <div class="space-y-4">
            @for($i = 1; $i <= 20; $i++)
                <div class="bg-white bg-opacity-50 rounded p-4">
                    <p class="text-gray-700">Section {{ $i }} - Keep scrolling...</p>
                </div>
            @endfor
        </div>
    </div>
</div>

<div id="toast" class="fixed bottom-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg hidden z-50">
    <span id="toastMessage"></span>
</div>

<script>
function showDemoToast(message) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    toastMessage.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

function toggleDemoSection() {
    const section = document.getElementById('demoSection');
    section.classList.toggle('hidden');
}

document.getElementById('demoForm').addEventListener('submit', function(e) {
    e.preventDefault();
    showDemoToast('Form submitted! (Check tracking events)');
    this.reset();
});
</script>
@endsection

