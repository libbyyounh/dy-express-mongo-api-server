 
// 添加全局变量存储轮询ID
let logIntervalId = null;

// 获取移动设备列表
async function loadMobileDevices() {
    try {
        // 从localStorage获取token
        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = '/login.html';
            return;
        }
        const response = await fetch('/api/mobiles', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!response.ok) throw new Error('获取设备列表失败');
        const mobiles = await response.json();
        const select = document.getElementById('mobile');
        select.innerHTML = mobiles.map(m => `<option value="${m.mobile}">${m.mobile}</option>`).join('');
    } catch (error) {
        addLog('错误：' + error.message);
    }
}

// 获取Cookie
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

// 添加日志
let logEntries = []; // 日志存储数组
const MAX_LOG_ENTRIES = 100; // 最大日志条数

function addLog(message) {
    const logElement = document.getElementById('logContent');
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;

    // 添加新日志并维持FIFO队列
    logEntries.push(logEntry);
    if (logEntries.length > MAX_LOG_ENTRIES) {
        logEntries.shift(); // 移除最早的日志
    }

    // 渲染日志（使用数组join避免多次innerHTML操作）
    logElement.innerHTML = logEntries.join('\n');
    logElement.scrollTop = logElement.scrollHeight;
}

// 修改轮询函数，添加停止条件
function startLogPolling() {
    // 先清除可能存在的轮询
    if (logIntervalId) clearInterval(logIntervalId);

    // 使用变量存储interval ID以便后续清理
    logIntervalId = setInterval(async () => {
        try {
            // 从localStorage获取token
            const token = localStorage.getItem('token');
            if (!token) {
                window.location.href = '/login.html';
                clearInterval(logIntervalId);
                logIntervalId = null;
                return;
            }
            const response = await fetch('/api/hamibot/log', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!response.ok) throw new Error('获取日志失败');
            const logData = await response.json();
            addLog('任务队列状态：' + logData.queueLength + '个任务待处理');
            logData.tasks.forEach(task => {
                addLog(`任务 ${task.id}: ${task.status} ${task.error ? '错误：' + task.error : ''}`);
            });

            // 检查是否需要停止轮询
            if (logData.queueLength === 0) {
                addLog('所有任务已处理完成，停止日志轮询');
                clearInterval(logIntervalId);
                logIntervalId = null;
            }
        } catch (error) {
            addLog('日志获取错误：' + error.message);
            // 发生错误时停止轮询
            clearInterval(logIntervalId);
            logIntervalId = null;
        }
    }, 15000); // 15秒轮询一次

    return logIntervalId;
}

// 停止所有任务
async function stopAllTasks() {
    try {
        addLog('正在停止所有任务...');
        // 从localStorage获取token
        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = '/login.html';
            return;
        }
        const response = await fetch('/api/hamibot/stop', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });
        if (!response.ok) throw new Error('停止任务请求失败');
        const result = await response.json();
        addLog(result.message);
    } catch (error) {
        addLog('停止任务错误：' + error.message);
    }
}

// 绑定停止按钮事件
document.getElementById('stopAllTasks').addEventListener('click', stopAllTasks);

// 表单提交处理
document.getElementById('hamibotForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const mobile = document.getElementById('mobile').value;
    const speed = document.querySelector('input[name="speed"]:checked').value;
    const delay = document.querySelector('input[name="delay"]:checked').value;
    // 从localStorage获取token
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }
    try {
        addLog('开始执行脚本...');
        const response = await fetch('/api/hamibot/execute', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ mobile, speed, delay })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        let number = result.taskIds.length;
        let totalMS = number * Number(delay);
        let min = totalMS / 1000 / 60;
        let time = new Date(totalMS + Date.now()).toLocaleTimeString();
        addLog('提交成功：共' + number + '个任务，预计耗时' + min.toFixed(2) + '分钟，预计完成时间：' + time);
        
        // 表单提交成功后开始日志轮询
        addLog('开始监控任务执行状态...');
        startLogPolling();
    } catch (error) {
        addLog('提交错误：' + error.message || '未知错误');
    }
});

// 页面加载时初始化 - 移除自动启动轮询
window.onload = () => {
    loadMobileDevices();
    addLog('系统就绪，等待操作...');
};