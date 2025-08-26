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

    function extractInfo(str) {
        // 匹配以https开头的URL
        const urlRegex = /https:\/\/[^\s]+/;
        const urlMatch = str.match(urlRegex);
        const url = urlMatch ? urlMatch[0] : null;
        
        // 如果找到了URL，提取URL后面的标题（直到【截止于：长按复制此条消息】为止）
        let title = null;
        if (url) {
            // 从URL后面开始提取
            const urlIndex = str.indexOf(url) + url.length;
            const remainingStr = str.substring(urlIndex).trim();
            
            // 找到标题结束的位置
            const endMarker = '长按复制此条消息';
            const endIndex = remainingStr.indexOf(endMarker);
            
            if (endIndex !== -1) {
                title = remainingStr.substring(0, endIndex).trim();
            } else {
                // 如果没有找到结束标记，就取剩余的所有内容
                title = remainingStr;
            }
            
            // 去除标题前后可能存在的特殊符号（如【】）
            title = title.trim();
        }
        
        return {
            url: url,
            title: title
        };
    }

    document.getElementById('url').addEventListener('input', (e) => {
        const url = e.target.value.trim();
        if (url) {
            const info = extractInfo(url);
            document.getElementById('title').value = info.title;
        }
    });

    // 提交表单
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const mobile = mobileSelect.value.trim();
        const url = document.getElementById('url').value.trim();
        const remark = document.getElementById('remark').value.trim() || '';
        const title = document.getElementById('title').value.trim() || '';

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
                    remark,
                    title
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