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

    // 显示当前手机号
    const mobileSpan = document.getElementById('mobileSpan');
    mobileSpan.textContent = getUrlParams().mobile;
    // 获取信息
    getInfo();

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

    async function getInfo () {
        const { mobile, id } = getUrlParams();
        if (id && mobile) {
            try {
                const response = await fetch(`/api/shoppingCard/getByMobile?mobile=${mobile}&id=${id}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.message || '获取信息失败');
                }

                // 填充信息
                document.getElementById('titleSpan').textContent = data.title;
            } catch (error) {
                alert('获取信息失败: ' + error.message);
            }
        }
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

            const response = await fetch('/api/urls/postUrl', { // 添加/urls前缀
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