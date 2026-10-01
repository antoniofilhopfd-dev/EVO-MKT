if('serviceWorker' in navigator&&location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1'){navigator.serviceWorker?.register('/sw.js').catch(()=>{})}
let evoInstall=null;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();evoInstall=e;document.body.dataset.canInstall='1';window.dispatchEvent(new Event('evo-can-install'))});
window.evoInstallApp=async()=>{if(!evoInstall)return false;evoInstall.prompt();await evoInstall.userChoice;evoInstall=null;return true};
