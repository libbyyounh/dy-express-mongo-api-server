// 在页面加载时执行登出操作
window.onload = function() {
    // 清除localStorage中的token信息
    if (localStorage.getItem('token')) {
        localStorage.removeItem('token');
    }
    // 可以添加清除其他相关信息（如有）
    // localStorage.removeItem('userInfo');
    
    // 跳转到登录页面
    window.location.href = 'login.html';
};