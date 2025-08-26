document.addEventListener('DOMContentLoaded', () => {
    const tokenTextarea = document.getElementById('token');
    const generateBtn = document.getElementById('generateBtn');
    const copyBtn = document.getElementById('copyBtn');
    const message = document.getElementById('message');

    // 检查登录状态
    if (!localStorage.getItem('token')) {
        window.location.href = '/login.html';
    }

    // 生成Token按钮点击事件
    generateBtn.addEventListener('click', async () => {
        try {
            const response = await fetch('/api/generateAPIToken', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            const data = await response.json();

            if (response.ok) {
                tokenTextarea.value = `Bearer ${data.token}`;
                showMessage(`Token生成成功，有效期${data.expiresIn}`, 'success');
            } else {
                showMessage(data.message || 'Token生成失败', 'error');
            }
        } catch (err) {
            showMessage('网络错误，请稍后重试', 'error');
            console.error('生成Token错误:', err);
        }
    });

    // 复制到剪贴板按钮点击事件
    copyBtn.addEventListener('click', async () => {
        const token = tokenTextarea.value.trim();
        
        if (!token) {
            showMessage('请先生成Token', 'warning');
            return;
        }

        try {
            await navigator.clipboard.writeText(token);
            showMessage('Token已复制到剪贴板', 'success');
        } catch (err) {
            // 降级方案：选择文本并执行复制命令
            tokenTextarea.select();
            document.execCommand('copy');
            showMessage('Token已复制到剪贴板', 'success');
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