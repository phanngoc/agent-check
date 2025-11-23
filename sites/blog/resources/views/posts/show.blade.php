@extends('layouts.app')

@section('title', $post->title)

@section('content')
<div class="max-w-4xl mx-auto">
    <article class="bg-white rounded-lg shadow-md overflow-hidden">
        <div class="p-8">
            <div class="mb-6">
                <a href="{{ route('posts.index') }}" class="text-purple-600 hover:text-purple-800 inline-flex items-center mb-4">
                    ← Quay lại danh sách
                </a>
                
                <div class="flex items-center text-sm text-gray-500 mb-4">
                    <span class="text-purple-600 font-semibold">{{ $post->author }}</span>
                    <span class="mx-2">•</span>
                    <time datetime="{{ $post->published_at->toIso8601String() }}">
                        {{ $post->published_at->format('d/m/Y H:i') }}
                    </time>
                </div>
                
                <h1 class="text-4xl font-bold text-gray-800 mb-4">{{ $post->title }}</h1>
                
                @if($post->excerpt)
                    <p class="text-xl text-gray-600 italic border-l-4 border-purple-500 pl-4 mb-6">
                        {{ $post->excerpt }}
                    </p>
                @endif
            </div>

            <div class="prose max-w-none text-gray-700 leading-relaxed">
                {!! nl2br(e($post->content)) !!}
            </div>
        </div>
    </article>

    <!-- Interactive Actions -->
    <div class="mt-8 bg-white rounded-lg shadow-md p-6">
        <h2 class="text-2xl font-bold text-gray-800 mb-4">💬 Tương tác với bài viết</h2>
        
        <div class="flex flex-wrap gap-3 mb-6">
            <button onclick="handleLike()" class="bg-red-500 text-white px-6 py-2 rounded-lg hover:bg-red-600 transition flex items-center gap-2">
                ❤️ Like
                <span id="likeCount" class="bg-red-600 px-2 py-1 rounded">0</span>
            </button>
            <button onclick="handleShare()" class="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition">
                📤 Share
            </button>
            <button onclick="handleBookmark()" class="bg-yellow-500 text-white px-6 py-2 rounded-lg hover:bg-yellow-600 transition">
                🔖 Bookmark
            </button>
            <button onclick="showComments()" class="bg-green-500 text-white px-6 py-2 rounded-lg hover:bg-green-600 transition">
                💬 Comments
            </button>
        </div>

        <div id="commentsSection" class="hidden mt-4">
            <h3 class="font-bold text-lg mb-3">Comments</h3>
            
            @auth
                <form id="commentForm" class="space-y-3">
                    @csrf
                    <textarea name="content" id="commentContent" rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="Viết bình luận..."></textarea>
                    <button type="submit" class="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 transition">
                        Gửi bình luận
                    </button>
                </form>
            @else
                <div class="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-4">
                    <p class="text-yellow-800 mb-2">Vui lòng đăng nhập để bình luận</p>
                    <a href="{{ route('login') }}" class="text-purple-600 hover:text-purple-800 font-medium">Đăng nhập</a>
                    <span class="text-gray-400 mx-2">|</span>
                    <a href="{{ route('register') }}" class="text-purple-600 hover:text-purple-800 font-medium">Đăng ký</a>
                </div>
            @endauth
            
            <div id="commentsList" class="mt-4 space-y-3">
                <p class="text-gray-500 text-sm">Đang tải bình luận...</p>
            </div>
        </div>
    </div>

    <!-- Related Posts -->
    <div class="mt-8">
        <h2 class="text-2xl font-bold text-gray-800 mb-4">📚 Bài viết khác</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            @php
                $relatedPosts = \App\Models\Post::where('id', '!=', $post->id)
                    ->whereNotNull('published_at')
                    ->where('published_at', '<=', now())
                    ->orderBy('published_at', 'desc')
                    ->limit(4)
                    ->get();
            @endphp
            
            @foreach($relatedPosts as $relatedPost)
                <a href="{{ route('posts.show', $relatedPost->slug) }}" 
                   class="bg-white rounded-lg shadow-md p-4 hover:shadow-xl transition block">
                    <h3 class="font-bold text-gray-800 mb-2 hover:text-purple-600">{{ $relatedPost->title }}</h3>
                    <p class="text-sm text-gray-500">{{ $relatedPost->published_at->format('d/m/Y') }}</p>
                </a>
            @endforeach
        </div>
    </div>
</div>

<div id="toast" class="fixed bottom-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg hidden z-50">
    <span id="toastMessage"></span>
</div>

<script>
let likeCount = 0;

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    toastMessage.textContent = message;
    toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 ${
        type === 'error' ? 'bg-red-500' : 'bg-green-500'
    } text-white`;
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

function handleLike() {
    likeCount++;
    document.getElementById('likeCount').textContent = likeCount;
    showToast('Bạn đã like bài viết!');
}

function handleShare() {
    showToast('Chức năng share đã được trigger!');
}

function handleBookmark() {
    showToast('Bài viết đã được bookmark!');
}

const postSlug = '{{ $post->slug }}';

function showComments() {
    const section = document.getElementById('commentsSection');
    const isHidden = section.classList.contains('hidden');
    section.classList.toggle('hidden');
    
    if (isHidden) {
        loadComments();
    }
}

function loadComments() {
    fetch(`/posts/${postSlug}/comments`)
        .then(response => response.json())
        .then(data => {
            const commentsList = document.getElementById('commentsList');
            
            if (data.success && data.comments.length > 0) {
                commentsList.innerHTML = '';
                data.comments.forEach(comment => {
                    const commentDiv = document.createElement('div');
                    commentDiv.className = 'bg-gray-100 p-3 rounded';
                    commentDiv.innerHTML = `
                        <div class="flex items-start justify-between">
                            <div class="flex-1">
                                <p class="text-gray-700">${escapeHtml(comment.content)}</p>
                                <div class="mt-2 flex items-center gap-2 text-xs text-gray-500">
                                    <span class="font-semibold text-purple-600">${escapeHtml(comment.user_name)}</span>
                                    <span>•</span>
                                    <span>${comment.created_at_human}</span>
                                </div>
                            </div>
                        </div>
                    `;
                    commentsList.appendChild(commentDiv);
                });
            } else {
                commentsList.innerHTML = '<p class="text-gray-500 text-sm">Chưa có bình luận nào. Hãy là người đầu tiên!</p>';
            }
        })
        .catch(error => {
            console.error('Error loading comments:', error);
            document.getElementById('commentsList').innerHTML = '<p class="text-red-500 text-sm">Lỗi khi tải bình luận. Vui lòng thử lại.</p>';
        });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

const commentForm = document.getElementById('commentForm');
if (commentForm) {
    commentForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const content = document.getElementById('commentContent').value.trim();
        
        if (!content) {
            showToast('Vui lòng nhập nội dung bình luận!', 'error');
            return;
        }
        
        const formData = new FormData();
        formData.append('content', content);
        formData.append('_token', '{{ csrf_token() }}');
        
        fetch(`/posts/${postSlug}/comments`, {
            method: 'POST',
            body: formData,
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                document.getElementById('commentContent').value = '';
                loadComments();
                showToast('Bình luận đã được gửi!');
            } else {
                showToast('Có lỗi xảy ra. Vui lòng thử lại!', 'error');
            }
        })
        .catch(error => {
            console.error('Error submitting comment:', error);
            showToast('Có lỗi xảy ra. Vui lòng thử lại!', 'error');
        });
    });
}
</script>
@endsection

