async function Dialog({ title, message, onConfirm, onCancel, content }) {
  return new Promise((resolve, reject) => {
    const dialog = document.createElement('div');
    dialog.classList.add('dialog');
    dialog.innerHTML = `
        <div class="dialog-content">
            <h2>${title}</h2>
            <p>${message}</p>
            ${content || ''}
            <div class="dialog-buttons">
                <button id="confirmButton">确认</button>
                <button id="cancelButton">取消</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);

    const confirmButton = dialog.querySelector('#confirmButton');
    const cancelButton = dialog.querySelector('#cancelButton');

    const confirmButtonClickHandler = () => {
        onConfirm?.();
        dialog.remove();
        resolve(true);
    };

    confirmButton.addEventListener('click', confirmButtonClickHandler);
    

    const cancelButtonClickHandler = () => {
        onCancel?.();
        dialog.remove();
        reject(new Error('用户取消操作'));
    };
        
    cancelButton.addEventListener('click', cancelButtonClickHandler);

    // dialog 移除后，移除事件监听
    dialog.addEventListener('remove', () => {
        confirmButton.removeEventListener('click', confirmButtonClickHandler);
        cancelButton.removeEventListener('click', cancelButtonClickHandler);
    });
  })
}