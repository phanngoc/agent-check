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
            <form id="commentForm" class="space-y-3">
                <textarea name="comment" rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="Viết bình luận..."></textarea>
                <button type="submit" class="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 transition">
                    Gửi bình luận
                </button>
            </form>
            <div id="commentsList" class="mt-4 space-y-3">
                <p class="text-gray-500 text-sm">Chưa có bình luận nào. Hãy là người đầu tiên!</p>
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

function showToast(message) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    toastMessage.textContent = message;
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

function showComments() {
    const section = document.getElementById('commentsSection');
    section.classList.toggle('hidden');
}

document.getElementById('commentForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const comment = this.comment.value;
    if (comment.trim()) {
        const commentsList = document.getElementById('commentsList');
        if (commentsList.querySelector('p')) {
            commentsList.innerHTML = '';
        }
        const commentDiv = document.createElement('div');
        commentDiv.className = 'bg-gray-100 p-3 rounded';
        commentDiv.innerHTML = `<p class="text-gray-700">${comment}</p><p class="text-xs text-gray-500 mt-1">Vừa xong</p>`;
        commentsList.appendChild(commentDiv);
        this.reset();
        showToast('Bình luận đã được gửi!');
    }
});
</script>
@endsection

