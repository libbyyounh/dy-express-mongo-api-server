// 初始化浮动导航
function initFloatNav(currentPage) {
    // 创建导航栏HTML结构
    const navHTML = `
        <div class="float-nav-container">
            <div class="float-nav-menu">
                <a href="/index.html" class="float-nav-item" ${currentPage === 'index' ? 'style="display:none"' : ''}>
                    <span>首页</span>
                    <span class="float-nav-label">首页</span>
                </a>
                <a href="/shoppingCard.html" class="float-nav-item" ${currentPage === 'shoppingCard' ? 'style="display:none"' : ''}>
                    <span>购物车</span>
                    <span class="float-nav-label">购物车工具</span>
                </a>
                <a href="/shoppingCard-table.html" class="float-nav-item" ${currentPage === 'shoppingCard-table' ? 'style="display:none"' : ''}>
                    <span>购物表</span>
                    <span class="float-nav-label">购物表</span>
                </a>
                <a href="/shoppingCardListAdd.html" class="float-nav-item" ${currentPage === 'shoppingCardListAdd' ? 'style="display:none"' : ''}>
                    <span>加车</span>
                    <span class="float-nav-label">加车</span>
                </a>
                <a href="/hamibot.html" class="float-nav-item" ${currentPage === 'hamibot' ? 'style="display:none"' : ''}>
                    <span>脚本</span>
                    <span class="float-nav-label">脚本执行</span>
                </a>
                <a href="/url-table.html" class="float-nav-item" ${currentPage === 'url-table' ? 'style="display:none"' : ''}>
                    <span>URL</span>
                    <span class="float-nav-label">URL管理</span>
                </a>
                <a href="/logout.html" class="float-nav-item">
                    <span>登出</span>
                    <span class="float-nav-label">退出登录</span>
                </a>
            </div>
            <button class="float-nav-main-btn">+</button>
        </div>
    `;

    // 将导航栏添加到页面底部
    document.body.insertAdjacentHTML('beforeend', navHTML);

    // 获取导航元素
    const navContainer = document.querySelector('.float-nav-container');
    const mainBtn = document.querySelector('.float-nav-main-btn');
    const menu = document.querySelector('.float-nav-menu');

    // 初始化位置
    function initPosition() {
        // 设置固定初始位置为右下角
        const initialRight = 30;
        const initialBottom = 30;
        const offsetX = window.innerWidth - navContainer.offsetWidth - initialRight;
        const offsetY = window.innerHeight - navContainer.offsetHeight - initialBottom;
        navContainer.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    }

    // 初始化位置
    initPosition();

    // 切换导航菜单显示/隐藏
    mainBtn.addEventListener('click', () => {
        mainBtn.classList.toggle('active');
        menu.classList.toggle('active');
    });

    // 窗口大小改变时重新计算位置
    window.addEventListener('resize', initPosition);
}