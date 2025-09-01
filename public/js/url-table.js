// 设置默认日期为今天
document.addEventListener('DOMContentLoaded', () => {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('datePicker').value = today;
});

async function fetchTableData() {
    const dateInput = document.getElementById('datePicker');
    const queryButton = document.getElementById('queryButton');
    const loading = document.getElementById('loading');
    const tableContainer = document.getElementById('tableContainer');
    const errorMessage = document.getElementById('errorMessage');

    // 格式化日期为YYYYMMDD
    const selectedDate = dateInput.value;
    if (!selectedDate) {
        showError('请选择日期');
        return;
    }
    const formattedDate = selectedDate.replace(/-/g, '');

    // 显示加载状态
    queryButton.disabled = true;
    loading.style.display = 'block';
    tableContainer.innerHTML = '';
    errorMessage.style.display = 'none';

    try {
        // 获取JWT token
        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = 'login.html';
            return;
        }

        // 调用API
        const response = await fetch(`/api/urls/table?date=${formattedDate}`, { // 添加/urls前缀
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
        renderTable(data.headers, data.rows);
    } catch (error) {
        showError(error.message);
    } finally {
        // 隐藏加载状态
        queryButton.disabled = false;
        loading.style.display = 'none';
    }
}

function renderTable(headers, rows) {
    const tableContainer = document.getElementById('tableContainer');
    const tableActions = document.getElementById('tableActions');

    // 添加空值检查
    if (!tableActions) {
        console.error('tableActions element not found');
        return;
    }

    if (rows.length === 0) {
        tableContainer.innerHTML = '<div class="loading">没有找到数据</div>';
        tableActions.style.display = 'none';
        return;
    }

    // 显示操作按钮
    tableActions.style.display = 'flex';

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
    thead.appendChild(headerRow);

    // 创建表格内容（添加复选框列和序号列）
    rows.forEach((row, index) => {
        const tr = document.createElement('tr');
        // 添加行复选框
        const checkboxCell = document.createElement('td');
        checkboxCell.className = 'checkbox-cell';
        checkboxCell.innerHTML = `<input type="checkbox" class="row-checkbox" data-id="${row._id}">`;
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
            } else if (header === 'isUsed') {
                td.innerHTML = row[header] ? '<span class="disable-text">已使用</span>' : '<span class="enable-text">未使用</span>';
            } else if (header === 'disabled') {
                td.innerHTML = row[header] ? '<span class="disable-text">已禁用</span>' : '<span class="enable-text">未禁用</span>';
            } else {
                td.textContent = row[header] !== undefined ? row[header] : '';
            }
            tr.appendChild(td);
        });
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
    const multipleSwitch = document.getElementById('multipleSwitch');
    const multipleSetUsed = document.getElementById('multipleSetUsed');

    multipleDel.disabled = checkedCount === 0;
    multipleSwitch.disabled = checkedCount === 0;
    multipleSetUsed.disabled = checkedCount === 0;
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

    const dateInput = document.getElementById('datePicker');
    const formattedDate = dateInput.value.replace(/-/g, '');
    const token = localStorage.getItem('token');

    try {
        const response = await fetch('/api/urls/batch/delete', { // 添加/urls前缀
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                date: formattedDate,
                ids: checkedIds
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || '批量删除失败');
        }

        showError(`成功删除${data.deletedCount}条数据`, 'success');
        // 重新加载数据
        fetchTableData();
    } catch (error) {
        showError(error.message);
    }
}

// 批量切换使用状态功能
async function batchSwitchUsed(isUsed = false) {
    const checkedIds = Array.from(document.querySelectorAll('.row-checkbox:checked'))
        .map(checkbox => checkbox.dataset.id);

    if (checkedIds.length === 0) {
        showError('请选择要操作的数据');
        return;
    }

    const dateInput = document.getElementById('datePicker');
    const formattedDate = dateInput.value.replace(/-/g, '');
    const token = localStorage.getItem('token');

    try {
        const response = await fetch('/api/urls/batch/update-used', { // 添加/urls前缀
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                date: formattedDate,
                ids: checkedIds,
                isUsed: isUsed
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || '批量更新失败');
        }

        const statusText = isUsed ? '已使用' : '未使用';
        showError(`成功更新${data.modifiedCount}条数据的使用状态为${statusText}`, 'success');
        // 重新加载数据
        fetchTableData();
    } catch (error) {
        showError(error.message);
    }
}

// 更新错误提示函数，支持成功消息
// 删除重复的 showError 函数定义
// 保留带 type 参数的版本，删除无参数版本
function showError(message, type = 'error') {
    const errorMessage = document.getElementById('errorMessage');
    if (!errorMessage) return; // 添加空值检查
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    errorMessage.className = type === 'success' ? 'success' : 'error';

    setTimeout(() => {
        errorMessage.style.display = 'none';
    }, 3000);
}

// 删除以下重复定义
// function showError(message) {
//     const errorMessage = document.getElementById('errorMessage');
//     errorMessage.textContent = message;
//     errorMessage.style.display = 'block';
//     // 3秒后自动隐藏错误消息
//     setTimeout(() => {
//         errorMessage.style.display = 'none';
//     }, 3000);
// }
function formatHeaderName(header) {
    // 将字段名转换为中文显示
    const headerMap = {
        url: 'URL地址',
        mobile: '手机号',
        type: '类型',
        isUsed: '使用状态',
        createTime: '创建时间',
        disabled: '禁用状态'
    };
    return headerMap[header] || header;
}