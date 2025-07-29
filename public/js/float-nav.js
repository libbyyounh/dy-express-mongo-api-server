// 初始化浮动导航
function initFloatNav(currentPage) {
    // 创建导航栏HTML结构
    const navHTML = `
        <div class="float-nav-container">
            <div class="float-nav-drag-handle"></div>
            <div class="float-nav-menu">
                <a href="/index.html" class="float-nav-item" ${currentPage === 'index' ? 'style="display:none"' : ''}>
                    <span>首页</span>
                    <span class="float-nav-label">首页</span>
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
    // 获取导航容器元素
    const navContainer = document.querySelector('.float-nav-container');
    const mainBtn = document.querySelector('.float-nav-main-btn');
    const menu = document.querySelector('.float-nav-menu');

    // 拖拽相关变量
    let isDragging = false;
    let initialX = 0;
    let initialY = 0;
    let offsetX = 0;
    let offsetY = 0;
    let startX = 0;
    let startY = 0;

    // 从localStorage加载保存的位置
    function loadSavedPosition() {
        const savedPos = localStorage.getItem('floatNavPosition');
        if (savedPos) {
            const { x, y } = JSON.parse(savedPos);
            // 添加边界检查，确保加载的位置在窗口内
            const bounds = getScreenBounds();
            const clampedX = Math.max(bounds.minX, Math.min(x, bounds.maxX));
            const clampedY = Math.max(bounds.minY, Math.min(y, bounds.maxY));
            navContainer.style.transform = `translate(${clampedX}px, ${clampedY}px)`;
            offsetX = clampedX;
            offsetY = clampedY;
        } else {
            // 初始化位置（移除localStorage相关代码）
            function initPosition() {
                // 设置初始位置为右下角
                const initialRight = 30;
                const initialBottom = 30;
                offsetX = window.innerWidth - navContainer.offsetWidth - initialRight;
                offsetY = window.innerHeight - navContainer.offsetHeight - initialBottom;
                navContainer.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
            }
        }
    }

    // 保存位置到localStorage
    // function savePosition(x, y) {
    //     localStorage.setItem('floatNavPosition', JSON.stringify({ x, y }));
    // }

    // 获取屏幕边界限制
    function getScreenBounds() {
        return {
            minX: 0,
            maxX: window.innerWidth - navContainer.offsetWidth,
            minY: 0,
            maxY: window.innerHeight - navContainer.offsetHeight
        };
    }

    // 触摸开始事件 - 开始拖拽
    function handleTouchStart(e) {
        // 只有在菜单收起状态下才能拖拽
        if (menu.classList.contains('active')) return;

        // 获取触摸点坐标
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        isDragging = true;

        // 添加拖拽中样式
        navContainer.style.opacity = '0.8';
        mainBtn.style.transition = 'none';

        e.preventDefault();
    }

    // 触摸移动事件 - 处理拖拽
    function handleTouchMove(e) {
        if (!isDragging) return;

        // 获取触摸点坐标
        const touch = e.touches[0];
        const currentX = touch.clientX;
        const currentY = touch.clientY;

        // 计算移动距离
        const dx = currentX - startX;
        const dy = currentY - startY;

        // 更新偏移量
        offsetX += dx;
        offsetY += dy;

        // 更新起始位置
        startX = currentX;
        startY = currentY;

        // 获取屏幕边界
        const { minX, maxX, minY, maxY } = getScreenBounds();

        // 限制在屏幕内（允许整个屏幕范围）
        offsetX = Math.max(minX, Math.min(offsetX, maxX));
        offsetY = Math.max(minY, Math.min(offsetY, maxY));

        // 应用位置变换
        navContainer.style.transform = `translate(${offsetX}px, ${offsetY}px)`;

        e.preventDefault();
    }

    // 触摸结束事件 - 结束拖拽
    function handleTouchEnd(e) {
        if (!isDragging) return;

        isDragging = false;

        // 恢复样式
        navContainer.style.opacity = '1';
        mainBtn.style.transition = '';

        // 删除保存位置的调用
        // savePosition(offsetX, offsetY);

        e.preventDefault();
    }

    // 添加触摸事件监听器
    navContainer.addEventListener('touchstart', handleTouchStart);
    navContainer.addEventListener('touchmove', handleTouchMove);
    navContainer.addEventListener('touchend', handleTouchEnd);
    navContainer.addEventListener('touchcancel', handleTouchEnd);

    // 加载保存的位置
    loadSavedPosition();

    // 切换导航菜单显示/隐藏
    mainBtn.addEventListener('click', () => {
        mainBtn.classList.toggle('active');
        menu.classList.toggle('active');
    });

    // 点击菜单项后关闭菜单
    const menuItems = document.querySelectorAll('.float-nav-item');
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            mainBtn.classList.remove('active');
            menu.classList.remove('active');
        });
    });
}