document.addEventListener('DOMContentLoaded', () => {
    const apiKeyTextarea = document.getElementById('apiKey');
    const apiSecretTextarea = document.getElementById('apiSecret');
    const generateBtn = document.getElementById('generateBtn');
    const copySecretBtn = document.getElementById('copySecretBtn');
    const copyKeyBtn = document.getElementById('copyKeyBtn');
    const message = document.getElementById('message');

    // 检查登录状态
    if (!localStorage.getItem('token')) {
        window.location.href = '/login.html';
    }

    // 生成API凭证按钮点击事件
    generateBtn.addEventListener('click', async () => {
        try {
            const response = await fetch('/api/generate-api-credentials', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({})
            });

            const data = await response.json();

            if (response.ok) {
                apiKeyTextarea.value = data.apiKey;
                apiSecretTextarea.value = data.apiSecret;
                showMessage('API凭证生成成功', 'success');
            } else {
                showMessage(data.message || 'API凭证生成失败', 'error');
            }
        } catch (err) {
            showMessage('网络错误，请稍后重试', 'error');
            console.error('生成API凭证错误:', err);
        }
    });

    // 复制API Secret到剪贴板按钮点击事件
    copySecretBtn.addEventListener('click', async () => {
        const apiSecret = apiSecretTextarea.value.trim();
        
        if (!apiSecret) {
            showMessage('请先生成API凭证', 'warning');
            return;
        }

        try {
            await navigator.clipboard.writeText(apiSecret);
            showMessage('API Secret已复制到剪贴板', 'success');
        } catch (err) {
            // 降级方案：选择文本并执行复制命令
            apiSecretTextarea.select();
            document.execCommand('copy');
            showMessage('API Secret已复制到剪贴板', 'success');
        }
    });

    // 复制API Key到剪贴板按钮点击事件
    copyKeyBtn.addEventListener('click', async () => {
        const apiKey = apiKeyTextarea.value.trim();
        
        if (!apiKey) {
            showMessage('请先生成API凭证', 'warning');
            return;
        }

        try {
            await navigator.clipboard.writeText(apiKey);
            showMessage('API Key已复制到剪贴板', 'success');
        } catch (err) {
            // 降级方案：选择文本并执行复制命令
            apiKeyTextarea.select();
            document.execCommand('copy');
            showMessage('API Key已复制到剪贴板', 'success');
        }
    });

    // 显示消息函数
    function showMessage(text, type = 'info') {
        message.textContent = text;
        message.className = `message ${type}`;
        
        setTimeout(() => {
            message.textContent = '';
            message.className = 'message';
        }, 3000);
    }
});