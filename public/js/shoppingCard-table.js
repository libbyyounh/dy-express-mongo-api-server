
// 检查登录状态
const token = localStorage.getItem('token');
if (!token) {
    window.location.href = '/login.html';
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
        const mobileSelect = document.getElementById('mobileSelect');
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

// 获取表格数据
async function fetchTableData() {
    const mobileSelect = document.getElementById('mobileSelect');
    const queryButton = document.getElementById('queryButton');
    const loading = document.getElementById('loading');
    const tableContainer = document.getElementById('tableContainer');
    const errorMessage = document.getElementById('errorMessage');
    const tableActions = document.getElementById('tableActions');

    const mobile = mobileSelect.value;
    if (!mobile) {
        showError('请选择手机号');
        return;
    }

    // 显示加载状态
    queryButton.disabled = true;
    loading.style.display = 'block';
    tableContainer.innerHTML = '';
    errorMessage.style.display = 'none';
    tableActions.style.display = 'none';

    try {
        // 调用API
        const response = await fetch(`/api/shoppingCard/getByMobile?mobile=${mobile}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || '获取数据失败');
        }

        // 渲染表格
        renderTable(data.headers, data.rows, mobile);
    } catch (error) {
        showError(error.message);
    } finally {
        // 隐藏加载状态
        queryButton.disabled = false;
        loading.style.display = 'none';
    }
}

// 渲染表格
function renderTable(headers, rows, mobile) {
    const tableContainer = document.getElementById('tableContainer');
    const tableActions = document.getElementById('tableActions');

    if (rows.length === 0) {
        tableContainer.innerHTML = '<div class="loading">没有找到数据</div>';
        tableActions.style.display = 'none';
        return;
    }

    // 显示操作按钮
    tableActions.style.display = 'flex';

    // 处理数据，将_id映射为id
    const processedRows = rows.map(row => {
        // 创建新对象，避免直接修改原始数据
        const newRow = { ...row };
        // 如果存在_id字段但不存在id字段，则添加id字段
        if (newRow._id && !newRow.id) {
            newRow.id = newRow._id;
        }
        return newRow;
    });

    // 创建表格
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');

    // 创建表头（添加复选框列和序号列）
    const headerRow = document.createElement('tr');
    // 添加全选复选框
    const checkboxHeader = document.createElement('th');
    const selectAllContainer = document.createElement('div');
    selectAllContainer.className = 'select-all-container';
    selectAllContainer.innerHTML = '<input type="checkbox" id="selectAll"> <label for="selectAll"></label>';
    checkboxHeader.appendChild(selectAllContainer);
    headerRow.appendChild(checkboxHeader);

    // 添加序号表头
    const serialHeader = document.createElement('th');
    serialHeader.textContent = '序号';
    headerRow.appendChild(serialHeader);

    headers.forEach(header => {
        const th = document.createElement('th');
        th.textContent = formatHeaderName(header);
        headerRow.appendChild(th);
    });

    // 添加操作列表头
    const actionHeader = document.createElement('th');
    actionHeader.textContent = '操作';
    actionHeader.className = 'action-column';
    headerRow.appendChild(actionHeader);

    thead.appendChild(headerRow);

    // 创建表格内容（添加复选框列和序号列）
    processedRows.forEach((row, index) => {
        const tr = document.createElement('tr');
        // 添加行复选框
        const checkboxCell = document.createElement('td');
        checkboxCell.className = 'checkbox-cell';
        checkboxCell.innerHTML = `<input type="checkbox" class="row-checkbox" data-id="${row.id}">`;
        tr.appendChild(checkboxCell);

        // 添加序号列
        const serialCell = document.createElement('td');
        serialCell.textContent = index + 1;
        tr.appendChild(serialCell);

        headers.forEach(header => {
            const td = document.createElement('td');
            if (header === 'url') {
                td.innerHTML = String(row[header] !== undefined ? row[header] : '').replace(/^(.*)https(.*)$/, function (match, p1, p2) {
                    return p1 + '<a target="_blank" rel="noopener noreferrer" href="https' + p2 + '">https' + p2 + '</a>';
                });
            } else if (header === 'disabled') {
                td.innerHTML = row[header] ? '<span class="disable-text">已禁用</span>' : '<span class="enable-text">未禁用</span>';
            } else {
                td.textContent = row[header] !== undefined ? row[header] : '';
            }
            tr.appendChild(td);
        });

        // 添加操作列
        const actionCell = document.createElement('td');
        actionCell.className = 'action-column';
        actionCell.innerHTML = `<span class="collect-btn" onclick="collectData('${mobile}', '${row.id}')">收集</span>`;
        tr.appendChild(actionCell);

        tbody.appendChild(tr);
    });

    table.appendChild(thead);
    table.appendChild(tbody);
    tableContainer.innerHTML = '';
    tableContainer.appendChild(table);

    // 添加全选/取消全选功能
    document.getElementById('selectAll').addEventListener('change', function(e) {
        const rowCheckboxes = document.querySelectorAll('.row-checkbox');
        rowCheckboxes.forEach(checkbox => {
            checkbox.checked = e.target.checked;
        });
        updateActionButtons();
    });

    // 添加行复选框事件监听
    document.querySelectorAll('.row-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', updateActionButtons);
    });
}

// 更新操作按钮状态
function updateActionButtons() {
    const checkedCount = document.querySelectorAll('.row-checkbox:checked').length;
    const multipleDel = document.getElementById('multipleDel');
    const multipleEnable = document.getElementById('multipleEnable');
    const multipleDisable = document.getElementById('multipleDisable');

    multipleDel.disabled = checkedCount === 0;
    multipleEnable.disabled = checkedCount === 0;
    multipleDisable.disabled = checkedCount === 0;
}

// 批量删除功能
async function batchDelete() {
    const checkedIds = Array.from(document.querySelectorAll('.row-checkbox:checked'))
        .map(checkbox => checkbox.dataset.id);

    if (checkedIds.length === 0) {
        showError('请选择要删除的数据');
        return;
    }

    if (!confirm(`确定要删除选中的${checkedIds.length}条数据吗？`)) {
        return;
    }

    const mobile = document.getElementById('mobileSelect').value;

    try {
        const response = await fetch('/api/shoppingCard/delete', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                mobile,
                ids: checkedIds
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || '批量删除失败');
        }

        showSuccess(`成功删除${data.deletedCount}条数据`);
        // 重新加载数据
        fetchTableData();
    } catch (error) {
        showError(error.message);
    }
}

// 批量切换禁用状态功能
async function batchSwitchDisabled(disabled = false) {
    const checkedIds = Array.from(document.querySelectorAll('.row-checkbox:checked'))
        .map(checkbox => checkbox.dataset.id);

    if (checkedIds.length === 0) {
        showError('请选择要操作的数据');
        return;
    }

    const mobile = document.getElementById('mobileSelect').value;

    try {
        const response = await fetch('/api/shoppingCard/updateDisabled', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                mobile,
                ids: checkedIds,
                disabled
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || '批量更新失败');
        }

        const statusText = disabled ? '禁用' : '启用';
        showSuccess(`成功${statusText}${data.modifiedCount}条数据`);
        // 重新加载数据
        fetchTableData();
    } catch (error) {
        showError(error.message);
    }
}

// 收集数据功能
function collectData(mobile, id) {
    window.location.href = `/shoppingCard/${mobile}/${id}`;
}

// 显示错误消息
function showError(message) {
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    document.getElementById('successMessage').style.display = 'none';
    setTimeout(() => {
        errorMessage.style.display = 'none';
    }, 3000);
}

// 显示成功消息
function showSuccess(message) {
    const successMessage = document.getElementById('successMessage');
    successMessage.textContent = message;
    successMessage.style.display = 'block';
    document.getElementById('errorMessage').style.display = 'none';
    setTimeout(() => {
        successMessage.style.display = 'none';
    }, 3000);
}

// 格式化表头名称
function formatHeaderName(header) {
    // 将字段名转换为中文显示
    const headerMap = {
        id: 'ID',
        url: 'URL地址',
        title: '标题',
        remark: '备注信息',
        createTime: '创建时间',
        disabled: '禁用状态'
    };
    return headerMap[header] || header;
}

// 初始化加载手机号
loadMobiles();