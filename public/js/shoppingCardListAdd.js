document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('shoppingCardForm');
    const mobileSelect = document.getElementById('mobile');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');

    // 检查登录状态
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    // 加载type=A的手机号
    async function loadMobiles() {
        try {
            const response = await fetch('/api/mobiles?type=B', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || '获取手机号失败');
            }

            // 清空并填充下拉菜单
            mobileSelect.innerHTML = '<option value="">请选择手机号</option>';
            data.forEach(mobile => {
                const option = document.createElement('option');
                option.value = mobile.mobile;
                option.textContent = mobile.mobile;
                mobileSelect.appendChild(option);
            });
        } catch (error) {
            showError(error.message);
        }
    }

    // 显示错误消息
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        successMessage.style.display = 'none';
        setTimeout(() => {
            errorMessage.style.display = 'none';
        }, 3000);
    }

    // 显示成功消息
    function showSuccess(message) {
        successMessage.textContent = message;
        successMessage.style.display = 'block';
        errorMessage.style.display = 'none';
        setTimeout(() => {
            successMessage.style.display = 'none';
        }, 3000);
    }

    // 提交表单
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const mobile = mobileSelect.value.trim();
        const url = document.getElementById('url').value.trim();
        const remark = document.getElementById('remark').value.trim() || '';

        if (!mobile || !url) {
            showError('手机号和URL地址为必填项');
            return;
        }

        try {
            const response = await fetch('/api/shoppingCard/add', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    mobile,
                    url,
                    remark
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || '提交失败');
            }

            showSuccess('提交成功');
            form.reset();
        } catch (error) {
            showError(error.message);
        }
    });

    // 初始化加载手机号
    loadMobiles();
});