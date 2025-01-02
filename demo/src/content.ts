function injectMessage() {
  const messageContainer = document.querySelector('#messages')!;
  messageContainer.textContent += `content script run at: ${new Date().toISOString()}\n`;
}
injectMessage();
