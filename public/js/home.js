document.addEventListener('DOMContentLoaded', () => {
        const urlInput = document.getElementById('urlInput');
        const pasteBtn = document.getElementById('pasteBtn');
        const submitBtn = document.getElementById('submitBtn');
        const isByMobileRadios = document.getElementsByName('isByMobile');
        const mobileGroup = document.getElementById('mobileGroup');
        const mobileSelect = document.getElementById('mobileSelect');

        // 检查登录状态
        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = '/login.html';
            return;
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

        // isByMobile切换逻辑
        isByMobileRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.value === '1') {
                    mobileGroup.style.display = 'block';
                    // 加载手机号数据
                    loadMobiles();
                } else {
                    mobileGroup.style.display = 'none';
                }
            });
        });

        // 加载手机号数据
        async function loadMobiles() {
            try {
                const response = await fetch('/api/mobiles?type=A', {
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
                alert('加载手机号失败: ' + error.message);
            }
        }

        // 提交URL
        submitBtn.addEventListener('click', async () => {
            const url = urlInput.value.trim();
            if (!url) {
                alert('请输入URL');
                return;
            }

            // 检查是否选择了通过手机号新增
            const isByMobile = Array.from(isByMobileRadios).find(radio => radio.checked).value;
            let mobile = undefined;

            if (isByMobile === '1') {
                mobile = mobileSelect.value;
                if (!mobile) {
                    alert('请选择手机号');
                    return;
                }
            }

            try {
                const response = await fetch('/api/postUrl', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        url: url,
                        mobile: mobile // 传递mobile参数
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    alert(data.message);
                    urlInput.value = '';
                    // 如果选择了通过手机号新增，重置选择
                    // if (isByMobile === '1') {
                    //     mobileSelect.value = '';
                    // }
                } else {
                    alert(data.message || '提交失败，请重试');
                }
            } catch (err) {
                alert('网络错误，请稍后重试');
                console.error('提交错误:', err);
            }
        });
});