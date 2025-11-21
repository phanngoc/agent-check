<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function showRegisterForm()
    {
        return view('auth.register');
    }

    public function register(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|email|unique:users',
            'password' => 'required|min:8',
            'full_name' => 'required|string|max:255',
        ]);

        $user = User::create([
            'name' => $validated['full_name'], // Laravel default name field
            'full_name' => $validated['full_name'],
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
        ]);

        // Tự động đăng nhập sau khi đăng ký
        Auth::login($user);

        return redirect()->route('posts.index')->with('success', 'Đăng ký thành công!');
    }

    public function showLoginForm()
    {
        return view('auth.login');
    }

    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        if (Auth::attempt($credentials, $request->boolean('remember'))) {
            $request->session()->regenerate();

            return redirect()->intended(route('posts.index'))->with('success', 'Đăng nhập thành công!');
        }

        throw ValidationException::withMessages([
            'email' => ['Email hoặc mật khẩu không đúng.'],
        ]);
    }

    public function logout(Request $request)
    {
        Auth::logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->route('posts.index')->with('success', 'Đăng xuất thành công!');
    }
}
