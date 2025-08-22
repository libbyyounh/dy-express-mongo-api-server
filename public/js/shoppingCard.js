document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('urlInput');
    const pasteBtn = document.getElementById('pasteBtn');
    const submitBtn = document.getElementById('submitBtn');

    // 检查登录状态
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    // 获取URL参数
    function getUrlParams() {
        const params = {};
        const pathParts = window.location.pathname.split('/');
        if (pathParts.length >= 3) {
            params.mobile = pathParts.at(-2);
            params.id = pathParts.at(-1);
        }
        return params;
    }

    // 粘贴按钮功能
    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            urlInput.value = text.trim();
            urlInput.focus();
        } catch (err) {
            alert('无法访问剪贴板，请手动粘贴');
            console.error('剪贴板错误:', err);
        }
    });

    // 提交URL
    submitBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        if (!url) {
            alert('请输入URL');
            return;
        }

        try {
            // 获取URL参数
            const { mobile, id } = getUrlParams();

            // 准备请求体
            const requestBody = { url: url, type: 'B' };
            if (mobile) requestBody.mobile = mobile;
            if (id) requestBody.remark = id;

            const response = await fetch('/api/postUrl', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (response.ok) {
                alert(data.message);
                urlInput.value = '';
            } else {
                alert(data.message || '提交失败，请重试');
            }
        } catch (err) {
            alert('网络错误，请稍后重试');
            console.error('提交错误:', err);
        }
    });
});