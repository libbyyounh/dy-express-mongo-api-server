document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const errorMessage = document.getElementById('errorMessage');

    // 检查是否已登录，如果已登录则重定向到首页
    if (localStorage.getItem('token')) {
        window.location.href = '/';
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMessage.textContent = '';

        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (!username || !password) {
            errorMessage.textContent = '请输入账号和密码';
            return;
        }

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok) {
                // 存储token并跳转到首页
                localStorage.setItem('token', data.token);
                window.location.href = '/';
            } else {
                errorMessage.textContent = data.message || '登录失败，请检查账号密码';
            }
        } catch (err) {
            errorMessage.textContent = '网络错误，请稍后重试';
            console.error('登录错误:', err);
        }
    });
});