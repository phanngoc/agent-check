<?php

namespace App\Http\Controllers;

use App\Models\Comment;
use App\Models\Post;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class CommentController extends Controller
{
    public function __construct()
    {
        $this->middleware('auth')->only('store');
    }

    public function store(Request $request, $postSlug)
    {
        $post = Post::where('slug', $postSlug)->firstOrFail();

        $validated = $request->validate([
            'content' => 'required|string|max:1000',
        ]);

        $comment = Comment::create([
            'post_id' => $post->id,
            'user_id' => Auth::id(),
            'content' => $validated['content'],
        ]);

        $comment->load('user');

        return response()->json([
            'success' => true,
            'comment' => [
                'id' => $comment->id,
                'content' => $comment->content,
                'user_name' => $comment->user->full_name ?? $comment->user->name,
                'created_at' => $comment->created_at->format('d/m/Y H:i'),
                'created_at_human' => $comment->created_at->diffForHumans(),
            ],
        ]);
    }

    public function index($postSlug)
    {
        $post = Post::where('slug', $postSlug)->firstOrFail();

        $comments = $post->comments()
            ->with('user')
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(function ($comment) {
                return [
                    'id' => $comment->id,
                    'content' => $comment->content,
                    'user_name' => $comment->user->full_name ?? $comment->user->name,
                    'created_at' => $comment->created_at->format('d/m/Y H:i'),
                    'created_at_human' => $comment->created_at->diffForHumans(),
                ];
            });

        return response()->json([
            'success' => true,
            'comments' => $comments,
        ]);
    }
}
