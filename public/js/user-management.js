document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('userForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const usernameError = document.getElementById('usernameError');
    const passwordError = document.getElementById('passwordError');
    const submitBtn = document.getElementById('submitBtn');

    // 检查用户名是否已存在
    usernameInput.addEventListener('blur', async function() {
        const username = usernameInput.value.trim();
        usernameError.textContent = '';

        if (!username) return;

        try {
            const response = await fetch(`/api/users/check-username?username=${encodeURIComponent(username)}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (!response.ok) {
                throw new Error('检查用户名失败');
            }

            const data = await response.json();
            if (data.exists) {
                usernameError.textContent = '用户名已存在，请选择其他用户名';
                submitBtn.disabled = true;
            } else {
                submitBtn.disabled = false;
            }
        } catch (error) {
            console.error('用户名检查错误:', error);
            usernameError.textContent = '检查用户名时出错，请稍后重试';
        }
    });

    // 验证密码匹配
    confirmPasswordInput.addEventListener('input', function() {
        passwordError.textContent = '';
        if (passwordInput.value !== confirmPasswordInput.value) {
            passwordError.textContent = '两次密码输入不一致';
            submitBtn.disabled = true;
        } else {
            if (!usernameError.textContent) {
                submitBtn.disabled = false;
            }
        }
    });

    // 表单提交
    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        // 客户端最终验证
        if (passwordInput.value !== confirmPasswordInput.value) {
            passwordError.textContent = '两次密码输入不一致';
            return;
        }

        const userData = {
            username: usernameInput.value.trim(),
            password: passwordInput.value,
            role: 'user'
        };

        try {
            const response = await fetch('/api/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(userData)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || '创建用户失败');
            }

            alert('用户创建成功！');
            form.reset();
            // 可选择跳转到用户列表页
            // window.location.href = '/user-list.html';
        } catch (error) {
            console.error('创建用户错误:', error);
            alert(error.message || '创建用户时出错，请稍后重试');
        }
    });
});